ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS account_name text,
  ADD COLUMN IF NOT EXISTS access_code text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND column_name = 'password_hash'
  ) THEN
    EXECUTE 'UPDATE public.customers SET access_code = password_hash WHERE access_code IS NULL AND password_hash IS NOT NULL';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS customers_restaurant_account_name_uidx
  ON public.customers (restaurant_id, lower(account_name))
  WHERE account_name IS NOT NULL;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE
  public.restaurants,
  public.customers,
  public.loyalty_cards,
  public.card_transactions
TO service_role;

CREATE OR REPLACE FUNCTION public.redeem_customer_bonus(
  p_restaurant_id uuid,
  p_customer_id uuid,
  p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant public.restaurants%ROWTYPE;
  v_card public.loyalty_cards%ROWTYPE;
  v_goal integer;
  v_stored_bonus numeric(10, 2);
  v_stored_carryover numeric(10, 2);
  v_available numeric(10, 2);
  v_remaining numeric(10, 2);
  v_main_deduction numeric(10, 2);
  v_carryover_deduction numeric(10, 2);
  v_next_carryover numeric(10, 2);
BEGIN
  IF p_amount IS NULL
     OR p_amount < 0
     OR p_amount <> round(p_amount, 2)
     OR p_amount > 99999999.99 THEN
    RAISE EXCEPTION 'İstifadə ediləcək bonus məbləği düzgün deyil.';
  END IF;

  SELECT * INTO v_restaurant
  FROM public.restaurants
  WHERE id = p_restaurant_id AND is_active = true
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restoran tapılmadı.';
  END IF;

  SELECT * INTO v_card
  FROM public.loyalty_cards
  WHERE restaurant_id = p_restaurant_id AND visitor_token = p_customer_id::text
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Müştəri kartı tapılmadı.';
  END IF;

  v_goal := GREATEST(COALESCE(v_restaurant.stamp_goal, 5), 1);
  IF GREATEST(COALESCE(v_card.stamps_count, 0), 0) < v_goal THEN
    RAISE EXCEPTION 'Aktiv bonus yoxdur.';
  END IF;

  v_stored_bonus := GREATEST(COALESCE(v_card.bonus_balance, 0), 0);
  IF v_card.reward_unlocked IS DISTINCT FROM true
     AND lower(COALESCE(v_restaurant.bonus_mode, 'fixed')) <> 'percent' THEN
    v_stored_bonus := v_stored_bonus + GREATEST(COALESCE(v_restaurant.bonus_fixed_amount, 10), 0);
  END IF;
  v_stored_carryover := GREATEST(COALESCE(v_card.bonus_carryover, 0), 0);
  v_available := v_stored_bonus + v_stored_carryover;

  IF p_amount > v_available THEN
    RAISE EXCEPTION 'İstifadə ediləcək məbləğ bonus balansından çox ola bilməz.';
  END IF;

  v_remaining := p_amount;
  v_main_deduction := LEAST(v_stored_bonus, v_remaining);
  v_remaining := v_remaining - v_main_deduction;
  v_carryover_deduction := LEAST(v_stored_carryover, v_remaining);
  v_next_carryover := (v_stored_carryover - v_carryover_deduction) + (v_stored_bonus - v_main_deduction);

  UPDATE public.loyalty_cards
  SET stamps_count = 0,
      reward_unlocked = false,
      total_spent = 0,
      bonus_balance = 0,
      bonus_carryover = v_next_carryover
  WHERE id = v_card.id
  RETURNING * INTO v_card;

  INSERT INTO public.card_transactions (
    restaurant_id, card_id, customer_id, visitor_token, action, tx_type, amount, bill_amount, bonus_delta, stamp_delta
  ) VALUES (
    p_restaurant_id, v_card.id, p_customer_id, p_customer_id::text, 'redeem', 'redeem', 0, 0, -p_amount, 0
  );

  RETURN jsonb_build_object(
    'card', to_jsonb(v_card),
    'redeemed_amount', p_amount,
    'bonus_balance', v_card.bonus_balance + v_card.bonus_carryover
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_customer_bonus(uuid, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_customer_bonus(uuid, uuid, numeric) TO service_role;
