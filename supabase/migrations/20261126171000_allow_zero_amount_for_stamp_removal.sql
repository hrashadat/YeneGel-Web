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
  IF p_stamp_delta IS NULL OR p_stamp_delta NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Möhür əməliyyatı etibarsızdır.';
  END IF;
  IF p_amount IS NULL
     OR p_amount < 0
     OR p_amount <> round(p_amount, 2)
     OR (p_stamp_delta = 1 AND p_amount = 0) THEN
    RAISE EXCEPTION 'Düzgün hesab məbləği daxil edin.';
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

  INSERT INTO public.card_transactions (
    restaurant_id, card_id, customer_id, visitor_token, action, tx_type, amount, bill_amount, bonus_delta, stamp_delta
  )
  VALUES (
    p_restaurant_id,
    v_card.id,
    p_customer_id,
    p_customer_id::text,
    CASE WHEN p_stamp_delta = 1 THEN 'stamp_added' ELSE 'stamp_removed' END,
    CASE WHEN p_stamp_delta = 1 THEN 'stamp_added' ELSE 'stamp_removed' END,
    p_amount,
    p_amount,
    v_bonus_delta,
    v_delta
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
