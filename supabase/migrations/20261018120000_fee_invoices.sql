-- Honorarrechnungen: invoices of an accepted Honorarofferte with the cumulative Leistungsstand per trade and phase.
-- Each invoice bills the difference to the previous invoice of the same offer (order of creation).
--
-- data (jsonb)  validated by the app (src/lib/fees/invoice.ts): Leistungsstand in % per trade and phase, per
--               Zusatzposition, and an optional remark.

create table public.fee_invoices (
  id            uuid primary key default gen_random_uuid(),
  number        text not null unique check (btrim(number) <> ''),
  offer_id      uuid not null references public.fee_offers (id) on delete restrict,
  status        text not null default 'draft' check (status in ('draft', 'sent', 'paid')),
  invoice_date  date not null default current_date,
  due_date      date,
  data          jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references public.profiles (id) on delete set null
);

create index fee_invoices_offer_idx on public.fee_invoices (offer_id, created_at);

create trigger fee_invoices_updated_at
  before update on public.fee_invoices
  for each row execute function public.set_updated_at();

alter table public.fee_invoices enable row level security;

create policy "fee_invoices: read for members" on public.fee_invoices for select to authenticated
  using ((select public.current_app_role()) is not null);
create policy "fee_invoices: insert for writers" on public.fee_invoices for insert to authenticated
  with check ((select public.can_write()));
create policy "fee_invoices: update for writers" on public.fee_invoices for update to authenticated
  using ((select public.can_write())) with check ((select public.can_write()));
create policy "fee_invoices: delete for writers" on public.fee_invoices for delete to authenticated
  using ((select public.can_write()));

revoke all on public.fee_invoices from anon;
grant select, insert, update, delete on public.fee_invoices to authenticated;
