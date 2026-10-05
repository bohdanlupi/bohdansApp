-- Plankopf of the Prinzipschema Wärmeerzeugung PDF per Anlage: SIA phase and revision list (index, initials, date,
-- comment) entered in the print dialog, like ventilation_systems.schema_plan. Kept apart from heating_plants.data so
-- the autosave of chapter 242 never overwrites a revision.

alter table public.heating_plants add column schema_plan jsonb not null default '{}'::jsonb;
