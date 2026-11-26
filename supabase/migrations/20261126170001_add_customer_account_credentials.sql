ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS account_name text,
  ADD COLUMN IF NOT EXISTS access_code text;

ALTER TABLE public.customers
  ALTER COLUMN first_name DROP NOT NULL,
  ALTER COLUMN last_name DROP NOT NULL,
  ALTER COLUMN phone DROP NOT NULL;

ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_name_length,
  DROP CONSTRAINT IF EXISTS customers_phone_format;

CREATE UNIQUE INDEX IF NOT EXISTS customers_restaurant_account_name_uidx
  ON public.customers (restaurant_id, lower(account_name))
  WHERE account_name IS NOT NULL;

COMMENT ON COLUMN public.customers.access_code IS
  'Salted scrypt hash of customer access code; never store the raw code.';
