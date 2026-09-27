-- Plankopf of the Prinzipschema PDF: parcel number of the project, and per ventilation system the SIA phase and
-- the revision list (index, initials, date, comment) entered in the print dialog. Kept apart from
-- ventilation_systems.data so saving the network editor never overwrites a revision.

alter table public.projects add column parcel text;

alter table public.ventilation_systems add column schema_plan jsonb not null default '{}'::jsonb;
