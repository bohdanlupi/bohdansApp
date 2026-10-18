-- Kreditoren: an invoice can contain amounts at several MWST rates.
--
-- vat_lines (jsonb)  [{ "rate": 8.1, "total": 120.50 }, …] – amounts incl. MWST per rate, validated by the app
--                    (src/lib/creditors.ts). `total` stays the sum of all lines.

alter table public.creditor_invoices
  add column vat_lines jsonb not null default '[]' check (jsonb_typeof(vat_lines) = 'array');

update public.creditor_invoices
  set vat_lines = jsonb_build_array(jsonb_build_object('rate', vat_rate, 'total', total));

alter table public.creditor_invoices drop column vat_rate;
