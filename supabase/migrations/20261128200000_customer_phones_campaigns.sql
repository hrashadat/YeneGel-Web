ALTER TABLE public.customers ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_phone_format;
ALTER TABLE public.customers ADD CONSTRAINT customers_phone_format
  CHECK (phone IS NULL OR phone ~ '^\+994[0-9]{9}$');
DROP INDEX IF EXISTS public.customers_restaurant_phone_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS customers_restaurant_phone_uidx
  ON public.customers (restaurant_id, phone) WHERE phone IS NOT NULL;
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS campaign_default_hours integer NOT NULL DEFAULT 1 CHECK (campaign_default_hours BETWEEN 1 AND 720),
  ADD COLUMN IF NOT EXISTS campaign_default_message text NOT NULL DEFAULT 'Sizə xüsusi bonus fürsəti!';

CREATE TABLE IF NOT EXISTS public.bonus_boosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  multiplier numeric(5,2) NOT NULL DEFAULT 2 CHECK (multiplier >= 1 AND multiplier <= 10),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > starts_at)
);
ALTER TABLE public.bonus_boosts ADD COLUMN IF NOT EXISTS campaign_id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS bonus_boosts_active_idx ON public.bonus_boosts (restaurant_id, customer_id, expires_at);
CREATE TABLE IF NOT EXISTS public.campaign_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  campaign_id uuid,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'manual',
  message text NOT NULL,
  status text NOT NULL DEFAULT 'prepared',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campaign_logs_restaurant_created_idx ON public.campaign_logs (restaurant_id, created_at DESC);
ALTER TABLE public.bonus_boosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bonus_boosts, public.campaign_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonus_boosts, public.campaign_logs TO service_role;

CREATE OR REPLACE FUNCTION public.apply_bonus_boost_to_transaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_multiplier numeric(5,2);
BEGIN
  IF NEW.tx_type = 'stamp_added' AND NEW.customer_id IS NOT NULL AND COALESCE(NEW.bonus_delta, 0) > 0 THEN
    SELECT b.multiplier INTO v_multiplier FROM public.bonus_boosts b
    WHERE b.restaurant_id = NEW.restaurant_id AND b.customer_id = NEW.customer_id
      AND b.starts_at <= now() AND b.expires_at > now()
    ORDER BY b.multiplier DESC LIMIT 1;
    IF v_multiplier IS NOT NULL AND v_multiplier > 1 THEN
      NEW.bonus_delta := round(NEW.bonus_delta * v_multiplier, 2);
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS card_transactions_apply_bonus_boost ON public.card_transactions;
CREATE TRIGGER card_transactions_apply_bonus_boost
BEFORE INSERT ON public.card_transactions FOR EACH ROW
EXECUTE FUNCTION public.apply_bonus_boost_to_transaction();

CREATE OR REPLACE FUNCTION public.apply_bonus_boost_balance_delta()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_multiplier numeric(5,2); v_base numeric(10,2); v_restaurant public.restaurants%ROWTYPE;
BEGIN
  IF NEW.tx_type = 'stamp_added' AND NEW.customer_id IS NOT NULL THEN
    SELECT b.multiplier INTO v_multiplier FROM public.bonus_boosts b
    WHERE b.restaurant_id = NEW.restaurant_id AND b.customer_id = NEW.customer_id
      AND b.starts_at <= now() AND b.expires_at > now() ORDER BY b.multiplier DESC LIMIT 1;
    IF v_multiplier IS NOT NULL AND v_multiplier > 1 THEN
      SELECT * INTO v_restaurant FROM public.restaurants WHERE id = NEW.restaurant_id;
      v_base := CASE WHEN lower(COALESCE(v_restaurant.bonus_mode, 'fixed')) = 'percent'
        THEN round(COALESCE(NEW.bill_amount, NEW.amount, 0) * GREATEST(COALESCE(v_restaurant.bonus_percent, 0), 0) / 100, 2)
        WHEN COALESCE(NEW.stamp_delta, 0) = 1 AND (SELECT stamps_count FROM public.loyalty_cards WHERE id = NEW.card_id) >= GREATEST(COALESCE(v_restaurant.stamp_goal, 5), 1)
        THEN GREATEST(COALESCE(v_restaurant.bonus_fixed_amount, 0), 0) ELSE 0 END;
      UPDATE public.loyalty_cards SET bonus_balance = COALESCE(bonus_balance, 0) + NEW.bonus_delta - v_base
      WHERE id = NEW.card_id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS card_transactions_apply_bonus_boost_balance ON public.card_transactions;
CREATE CONSTRAINT TRIGGER card_transactions_apply_bonus_boost_balance
AFTER INSERT ON public.card_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.apply_bonus_boost_balance_delta();
