-- Kontostand: the balance of the business account before the first payment recorded in the app. The Kreditoren page
-- adds the paid Honorarrechnungen and subtracts the paid Kreditoren to show what should be on the account today, to
-- compare with the bank statement by hand.

alter table public.firm_settings
  add column opening_balance numeric(12, 2) not null default 0;

-- The firm started with CHF 20'000 on the account (2026-10-20).
update public.firm_settings set opening_balance = 20000 where opening_balance = 0;
