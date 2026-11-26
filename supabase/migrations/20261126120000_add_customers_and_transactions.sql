CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_name_length CHECK (
    char_length(first_name) BETWEEN 1 AND 80
    AND char_length(last_name) BETWEEN 1 AND 80
  ),
  CONSTRAINT customers_phone_format CHECK (phone ~ '^\+?[0-9]{7,15}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS customers_restaurant_phone_uidx
  ON public.customers (restaurant_id, phone);

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount numeric(10, 2) NOT NULL CHECK (amount > 0),
  stamp_delta smallint NOT NULL CHECK (stamp_delta BETWEEN -1 AND 1),
  action text NOT NULL CHECK (action IN ('stamp_added', 'stamp_removed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transactions_customer_created_idx
  ON public.transactions (customer_id, created_at DESC);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.apply_customer_stamp_transaction(
  p_restaurant_id uuid,
  p_customer_id uuid,
  p_amount numeric,
  p_stamp_delta smallint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer public.customers%ROWTYPE;
  v_restaurant public.restaurants%ROWTYPE;
  v_card public.loyalty_cards%ROWTYPE;
  v_current_stamps integer;
  v_next_stamps integer;
  v_goal integer;
  v_delta smallint;
  v_bonus_delta numeric(10, 2) := 0;
  v_next_bonus numeric(10, 2);
  v_next_spent numeric(10, 2);
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'Düzgün hesab məbləği daxil edin.';
  END IF;
  IF p_stamp_delta NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Möhür əməliyyatı etibarsızdır.';
  END IF;

  SELECT * INTO v_customer
  FROM public.customers
  WHERE id = p_customer_id AND restaurant_id = p_restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Müştəri tapılmadı.';
  END IF;

  SELECT * INTO v_restaurant
  FROM public.restaurants
  WHERE id = p_restaurant_id AND is_active = true;
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

  v_current_stamps := GREATEST(COALESCE(v_card.stamps_count, 0), 0);
  v_goal := GREATEST(COALESCE(v_restaurant.stamp_goal, 5), 1);
  IF p_stamp_delta = -1 AND v_current_stamps = 0 THEN
    RAISE EXCEPTION 'Möhür silmək üçün kartda möhür yoxdur.';
  END IF;

  v_delta := CASE
    WHEN p_stamp_delta = -1 THEN -1
    WHEN v_current_stamps < v_goal THEN 1
    ELSE 0
  END;
  v_next_stamps := v_current_stamps + v_delta;
  v_next_spent := GREATEST(COALESCE(v_card.total_spent, 0), 0);
  v_next_bonus := GREATEST(COALESCE(v_card.bonus_balance, 0), 0);

  IF p_stamp_delta = 1 THEN
    v_next_spent := v_next_spent + p_amount;
    IF lower(COALESCE(v_restaurant.bonus_mode, 'fixed')) = 'percent' THEN
      v_bonus_delta := round(p_amount * GREATEST(COALESCE(v_restaurant.bonus_percent, 0), 0) / 100, 2);
    ELSIF v_delta = 1 AND v_next_stamps >= v_goal THEN
      v_bonus_delta := GREATEST(COALESCE(v_restaurant.bonus_fixed_amount, 0), 0);
    END IF;
    v_next_bonus := v_next_bonus + v_bonus_delta;
  END IF;

  UPDATE public.loyalty_cards
  SET stamps_count = v_next_stamps,
      reward_unlocked = (v_next_stamps >= v_goal),
      total_spent = v_next_spent,
      bonus_balance = v_next_bonus,
      last_stamped_at = CASE WHEN p_stamp_delta = 1 THEN now() ELSE last_stamped_at END
  WHERE id = v_card.id
  RETURNING * INTO v_card;

  INSERT INTO public.transactions (restaurant_id, customer_id, amount, stamp_delta, action)
  VALUES (
    p_restaurant_id,
    p_customer_id,
    p_amount,
    v_delta,
    CASE WHEN p_stamp_delta = 1 THEN 'stamp_added' ELSE 'stamp_removed' END
  );

  RETURN jsonb_build_object(
    'card', to_jsonb(v_card),
    'stamp_delta', v_delta,
    'bonus_delta', v_bonus_delta
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_customer_stamp_transaction(uuid, uuid, numeric, smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_customer_stamp_transaction(uuid, uuid, numeric, smallint) TO service_role;
