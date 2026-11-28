ALTER TABLE public.loyalty_cards
  ADD COLUMN IF NOT EXISTS bonus_carryover numeric(10, 2) NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS loyalty_cards_restaurant_visitor_uidx
  ON public.loyalty_cards (restaurant_id, visitor_token);

ALTER TABLE public.card_transactions
  ADD COLUMN IF NOT EXISTS reverses_transaction_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS card_transactions_single_reversal_uidx
  ON public.card_transactions (reverses_transaction_id)
  WHERE reverses_transaction_id IS NOT NULL;

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
  v_restaurant public.restaurants%ROWTYPE;
  v_card public.loyalty_cards%ROWTYPE;
  v_last_stamp public.card_transactions%ROWTYPE;
  v_current_stamps integer;
  v_next_stamps integer;
  v_goal integer;
  v_delta smallint;
  v_bonus_delta numeric(10, 2) := 0;
  v_reversed_bonus numeric(10, 2) := 0;
  v_reversed_amount numeric(10, 2) := 0;
  v_remaining_reversal numeric(10, 2) := 0;
  v_main_deduction numeric(10, 2) := 0;
  v_carryover_deduction numeric(10, 2) := 0;
  v_next_bonus numeric(10, 2);
  v_next_carryover numeric(10, 2);
  v_next_spent numeric(10, 2);
BEGIN
  IF p_stamp_delta IS NULL OR p_stamp_delta NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Möhür əməliyyatı etibarsızdır.';
  END IF;
  IF p_amount IS NULL
     OR p_amount < 0
     OR p_amount <> round(p_amount, 2)
     OR p_amount > 99999999.99
     OR (p_stamp_delta = 1 AND p_amount = 0) THEN
    RAISE EXCEPTION 'Düzgün hesab məbləği daxil edin.';
  END IF;

  SELECT * INTO v_restaurant
  FROM public.restaurants
  WHERE id = p_restaurant_id AND is_active = true
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restoran tapılmadı.';
  END IF;

  PERFORM 1 FROM public.customers
  WHERE id = p_customer_id AND restaurant_id = p_restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Müştəri tapılmadı.';
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
  v_next_carryover := GREATEST(COALESCE(v_card.bonus_carryover, 0), 0);

  IF p_stamp_delta = 1 THEN
    v_next_spent := v_next_spent + p_amount;
    IF lower(COALESCE(v_restaurant.bonus_mode, 'fixed')) = 'percent' THEN
      v_bonus_delta := round(p_amount * GREATEST(COALESCE(v_restaurant.bonus_percent, 0), 0) / 100, 2);
    ELSIF v_delta = 1 AND v_next_stamps >= v_goal THEN
      v_bonus_delta := GREATEST(COALESCE(v_restaurant.bonus_fixed_amount, 0), 0);
    END IF;
    v_next_bonus := v_next_bonus + v_bonus_delta;
  ELSE
    SELECT tx.* INTO v_last_stamp
    FROM public.card_transactions tx
    WHERE tx.card_id = v_card.id
      AND tx.tx_type = 'stamp_added'
      AND NOT EXISTS (
        SELECT 1
        FROM public.card_transactions reversal
        WHERE reversal.reverses_transaction_id = tx.id
      )
    ORDER BY tx.created_at DESC, tx.id DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Geri alınacaq əməliyyat tapılmadı.';
    END IF;

    v_reversed_amount := GREATEST(COALESCE(v_last_stamp.bill_amount, v_last_stamp.amount, 0), 0);
    v_next_spent := GREATEST(v_next_spent - v_reversed_amount, 0);
    v_remaining_reversal := GREATEST(COALESCE(v_last_stamp.bonus_delta, 0), 0);
    v_main_deduction := LEAST(v_next_bonus, v_remaining_reversal);
    v_remaining_reversal := v_remaining_reversal - v_main_deduction;
    v_carryover_deduction := LEAST(v_next_carryover, v_remaining_reversal);
    v_reversed_bonus := v_main_deduction + v_carryover_deduction;
    v_next_bonus := v_next_bonus - v_main_deduction;
    v_next_carryover := v_next_carryover - v_carryover_deduction;
  END IF;

  UPDATE public.loyalty_cards
  SET stamps_count = v_next_stamps,
      reward_unlocked = (v_next_stamps >= v_goal),
      total_spent = v_next_spent,
      bonus_balance = v_next_bonus,
      bonus_carryover = v_next_carryover,
      last_stamped_at = CASE WHEN p_stamp_delta = 1 THEN now() ELSE last_stamped_at END
  WHERE id = v_card.id
  RETURNING * INTO v_card;

  IF p_stamp_delta = 1 THEN
    INSERT INTO public.card_transactions (
      restaurant_id, card_id, customer_id, visitor_token, action, tx_type, amount, bill_amount, bonus_delta, stamp_delta
    ) VALUES (
      p_restaurant_id, v_card.id, p_customer_id, p_customer_id::text, 'stamp_added', 'stamp_added', p_amount, p_amount, v_bonus_delta, v_delta
    );
  ELSE
    INSERT INTO public.card_transactions (
      restaurant_id, card_id, customer_id, visitor_token, action, tx_type, amount, bill_amount, bonus_delta, stamp_delta, reverses_transaction_id
    ) VALUES (
      p_restaurant_id,
      v_card.id,
      p_customer_id,
      p_customer_id::text,
      'stamp_removed',
      'stamp_removed',
      -v_reversed_amount,
      -v_reversed_amount,
      -v_reversed_bonus,
      -1,
      v_last_stamp.id
    );
  END IF;

  RETURN jsonb_build_object(
    'card', to_jsonb(v_card),
    'stamp_delta', v_delta,
    'bonus_delta', CASE WHEN p_stamp_delta = 1 THEN v_bonus_delta ELSE -v_reversed_bonus END
  );
END;
$$;

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
  v_available numeric(10, 2);
  v_remaining numeric(10, 2);
  v_main_deduction numeric(10, 2);
  v_carryover_deduction numeric(10, 2);
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount, 2) THEN
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

  v_available := GREATEST(COALESCE(v_card.bonus_balance, 0), 0)
    + GREATEST(COALESCE(v_card.bonus_carryover, 0), 0);
  IF p_amount > v_available THEN
    RAISE EXCEPTION 'İstifadə ediləcək məbləğ bonus balansından çox ola bilməz.';
  END IF;

  v_remaining := p_amount;
  v_main_deduction := LEAST(GREATEST(COALESCE(v_card.bonus_balance, 0), 0), v_remaining);
  v_remaining := v_remaining - v_main_deduction;
  v_carryover_deduction := LEAST(GREATEST(COALESCE(v_card.bonus_carryover, 0), 0), v_remaining);

  UPDATE public.loyalty_cards
  SET stamps_count = 0,
      reward_unlocked = false,
      total_spent = 0,
      bonus_balance = 0,
      bonus_carryover = GREATEST(COALESCE(v_card.bonus_carryover, 0), 0)
        - v_carryover_deduction
        + GREATEST(COALESCE(v_card.bonus_balance, 0), 0)
        - v_main_deduction
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

REVOKE ALL ON FUNCTION public.apply_customer_stamp_transaction(uuid, uuid, numeric, smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_customer_stamp_transaction(uuid, uuid, numeric, smallint) TO service_role;
REVOKE ALL ON FUNCTION public.redeem_customer_bonus(uuid, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_customer_bonus(uuid, uuid, numeric) TO service_role;

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  rate_key text PRIMARY KEY,
  window_bucket bigint NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0)
);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.api_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.api_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_public_rate_limit(
  p_rate_key text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket bigint;
  v_count integer;
BEGIN
  IF p_rate_key IS NULL OR p_rate_key !~ '^[a-f0-9]{64}$'
     OR p_limit < 1 OR p_limit > 10000
     OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Rate limit parametrları etibarsızdır.';
  END IF;

  v_bucket := floor(extract(epoch FROM clock_timestamp()) / p_window_seconds)::bigint;
  INSERT INTO public.api_rate_limits AS limits (rate_key, window_bucket, request_count)
  VALUES (p_rate_key, v_bucket, 1)
  ON CONFLICT (rate_key) DO UPDATE
  SET window_bucket = EXCLUDED.window_bucket,
      request_count = CASE
        WHEN limits.window_bucket = EXCLUDED.window_bucket THEN limits.request_count + 1
        ELSE 1
      END
  RETURNING request_count INTO v_count;

  IF mod(hashtext(p_rate_key)::bigint, 100) = 0 THEN
    DELETE FROM public.api_rate_limits
    WHERE window_bucket < v_bucket - ceil(86400.0 / p_window_seconds)::bigint;
  END IF;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_public_rate_limit(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_public_rate_limit(text, integer, integer) TO service_role;
