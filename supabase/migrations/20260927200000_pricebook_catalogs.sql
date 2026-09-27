-- Supplier price books (PDF price lists parsed by a script, e.g. scripts/gen-schmidlin-data.mjs). Like IGH
-- catalogues they are read-only in the app and replaced as a whole on re-import (matched by external_key).

alter table public.catalogs drop constraint catalogs_source_check;
alter table public.catalogs add constraint catalogs_source_check check (source in ('own', 'igh', 'pricebook'));
