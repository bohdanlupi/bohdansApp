-- Kreditoren: received invoices (to pay or paid) with the supplier from the address book, an optional project, a
-- category (decides the ESTV Ziffer of the Vorsteuer: 400 Material/Dienstleistungen, 405 Investitionen/übriger
-- Betriebsaufwand) and the original document in the private storage bucket "receipts".
--
-- total       amount incl. MWST as printed on the invoice; net and Vorsteuer follow from vat_rate (effective method).
-- file_path   object path in the bucket "receipts" (<invoice id>/<file name>), null without a document.

create table public.creditor_invoices (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete restrict,
  project_id    uuid references public.projects (id) on delete set null,
  number        text not null default '',
  invoice_date  date not null default current_date,
  due_date      date,
  status        text not null default 'open' check (status in ('open', 'paid')),
  paid_date     date,
  category      text not null default 'material'
                check (category in ('material', 'subcontractor', 'office', 'vehicle', 'software', 'rent', 'investment', 'other')),
  total         numeric(12, 2) not null,
  vat_rate      numeric(5, 2) not null default 8.1 check (vat_rate between 0 and 100),
  description   text not null default '',
  file_path     text,
  file_name     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references public.profiles (id) on delete set null
);

create index creditor_invoices_date_idx on public.creditor_invoices (invoice_date);
create index creditor_invoices_company_idx on public.creditor_invoices (company_id);
create index creditor_invoices_project_idx on public.creditor_invoices (project_id);

create trigger creditor_invoices_updated_at
  before update on public.creditor_invoices
  for each row execute function public.set_updated_at();

alter table public.creditor_invoices enable row level security;

create policy "creditor_invoices: read for members" on public.creditor_invoices for select to authenticated
  using ((select public.current_app_role()) is not null);
create policy "creditor_invoices: insert for writers" on public.creditor_invoices for insert to authenticated
  with check ((select public.can_write()));
create policy "creditor_invoices: update for writers" on public.creditor_invoices for update to authenticated
  using ((select public.can_write())) with check ((select public.can_write()));
create policy "creditor_invoices: delete for writers" on public.creditor_invoices for delete to authenticated
  using ((select public.can_write()));

revoke all on public.creditor_invoices from anon;
grant select, insert, update, delete on public.creditor_invoices to authenticated;

-- Storage: original documents of the received invoices (PDF, JPEG, PNG up to 10 MB), uploaded from the browser.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "receipts bucket: read for members"
  on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.current_app_role() is not null);

create policy "receipts bucket: insert for writers"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.can_write());

create policy "receipts bucket: update for writers"
  on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and public.can_write());

create policy "receipts bucket: delete for writers"
  on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.can_write());
