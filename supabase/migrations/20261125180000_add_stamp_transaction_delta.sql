ALTER TABLE public.card_transactions
  ADD COLUMN IF NOT EXISTS stamp_delta smallint NOT NULL DEFAULT 1;
