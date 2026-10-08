-- 243 Wärmeverteilung per Anlage: the Strangschema network (pipes from the Heizgruppen to the Heizkörper and
-- Fussbodenheizungs-Verteiler) with its settings, and the Plankopf of its plan PDF (SIA phase, revisions). Kept apart
-- from heating_plants.data and schema_plan so the chapters 242 and 243 never overwrite each other.

alter table public.heating_plants add column distribution jsonb not null default '{}'::jsonb;
alter table public.heating_plants add column distribution_plan jsonb not null default '{}'::jsonb;
