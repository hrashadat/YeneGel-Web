-- Run once in the Supabase SQL Editor to enable bonus settings and balances.
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS bonus_mode text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS bonus_fixed_amount numeric(10, 2) NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS bonus_percent numeric(7, 2) NOT NULL DEFAULT 10;

ALTER TABLE public.loyalty_cards
  ADD COLUMN IF NOT EXISTS total_spent numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_balance numeric(10, 2) NOT NULL DEFAULT 0;
