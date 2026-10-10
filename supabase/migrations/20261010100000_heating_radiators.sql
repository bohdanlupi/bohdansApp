-- 243 Heizkörper per Anlage: the heated rooms of the Wärmebedarf per Heizgruppe with their Heizkörper (Zehnder model,
-- size, Anschluss, Oventrop armatures) and the defaults of the Anlage. Kept apart from heating_plants.data and
-- distribution so the chapters never overwrite each other; the Strangschema links its Heizkörper by id.

alter table public.heating_plants add column radiators jsonb not null default '{}'::jsonb;
