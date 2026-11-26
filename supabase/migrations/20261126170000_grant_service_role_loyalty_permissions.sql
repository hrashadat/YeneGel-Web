GRANT USAGE ON SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE
  public.restaurants,
  public.customers,
  public.loyalty_cards,
  public.card_transactions
TO service_role;
