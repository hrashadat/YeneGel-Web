ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS pin_hash text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.customers'::regclass
      AND conname = 'customers_pin_hash_format'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_pin_hash_format
      CHECK (pin_hash IS NULL OR pin_hash ~ '^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$');
  END IF;
END
$$;
