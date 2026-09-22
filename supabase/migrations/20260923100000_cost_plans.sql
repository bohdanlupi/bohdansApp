-- Phase 3 – Kostenplan (BKP / eBKP-H) + Kostenvoranschlag.
--
-- cost_plan_templates / cost_plan_items   code lists (hierarchy via parent_id, derived from the code)
-- projects.cost_plan_template_id          the list a project uses
-- lvs.cost_plan_item_id                   default code for all positions of an LV
-- lv_nodes.cost_plan_item_id              optional override per position (or group: inherited by its positions)
-- project_cost_items                      budget and manual KV amounts per code and project
-- project_cost_lv_amounts (view)          LV estimate per project and code (optional positions excluded)
--
-- The preloaded lists contain the main levels of BKP (SN 506 500) and eBKP-H (SN 506 511) plus the
-- HLKSE details. They are meant as a starting point and can be edited under Einstellungen.

create table public.cost_plan_templates (
  id          uuid primary key default gen_random_uuid(),
  key         text unique,
  name        text not null check (btrim(name) <> ''),
  created_at  timestamptz not null default now()
);

create table public.cost_plan_items (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.cost_plan_templates (id) on delete cascade,
  parent_id    uuid references public.cost_plan_items (id) on delete cascade,
  code         text not null check (btrim(code) <> ''),
  name         jsonb not null default '{}' check (jsonb_typeof(name) = 'object'),
  sort         integer not null default 0,
  unique (template_id, code)
);

create index cost_plan_items_template_idx on public.cost_plan_items (template_id, sort);

alter table public.projects
  add column cost_plan_template_id uuid references public.cost_plan_templates (id) on delete set null;

alter table public.lvs
  add column cost_plan_item_id uuid references public.cost_plan_items (id) on delete set null;

alter table public.lv_nodes
  add column cost_plan_item_id uuid references public.cost_plan_items (id) on delete set null;

create table public.project_cost_items (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects (id) on delete cascade,
  cost_plan_item_id  uuid not null references public.cost_plan_items (id) on delete cascade,
  budget             numeric(14, 2),
  -- KV amount not covered by an LV of this project (other planners, fees, reserves).
  manual_amount      numeric(14, 2),
  note               text,
  updated_at         timestamptz not null default now(),
  unique (project_id, cost_plan_item_id)
);

create trigger project_cost_items_updated_at
  before update on public.project_cost_items
  for each row execute function public.set_updated_at();

-- Effective code of a position: its own, else the nearest group's, else the LV's.
create view public.project_cost_lv_amounts with (security_invoker = true) as
with recursive effective as (
  select n.id, n.lv_id, n.kind, n.quantity, n.unit_price, n.is_optional,
         coalesce(n.cost_plan_item_id, l.cost_plan_item_id) as cost_plan_item_id
    from public.lv_nodes n
    join public.lvs l on l.id = n.lv_id
   where n.parent_id is null
  union all
  select c.id, c.lv_id, c.kind, c.quantity, c.unit_price, c.is_optional,
         coalesce(c.cost_plan_item_id, e.cost_plan_item_id)
    from public.lv_nodes c
    join effective e on e.id = c.parent_id
)
select l.project_id,
       e.cost_plan_item_id,
       sum(round(coalesce(e.quantity, 0) * coalesce(e.unit_price, 0), 2))::numeric(14, 2) as amount
  from effective e
  join public.lvs l on l.id = e.lv_id
 where e.kind in ('position', 'r_position') and not e.is_optional and e.cost_plan_item_id is not null
 group by l.project_id, e.cost_plan_item_id;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['cost_plan_templates', 'cost_plan_items', 'project_cost_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "%1$s: read for members" on public.%1$I for select to authenticated
         using (public.current_app_role() is not null)', t);
    execute format(
      'create policy "%1$s: insert for writers" on public.%1$I for insert to authenticated
         with check (public.can_write())', t);
    execute format(
      'create policy "%1$s: update for writers" on public.%1$I for update to authenticated
         using (public.can_write()) with check (public.can_write())', t);
    execute format(
      'create policy "%1$s: delete for writers" on public.%1$I for delete to authenticated
         using (public.can_write())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

revoke all on public.project_cost_lv_amounts from anon;
grant select on public.project_cost_lv_amounts to authenticated;

-- ---------------------------------------------------------------------------
-- Preloaded code lists
-- ---------------------------------------------------------------------------
insert into public.cost_plan_templates (key, name) values
  ('bkp', 'BKP (SN 506 500)'),
  ('ebkp_h', 'eBKP-H (SN 506 511)');

-- code | de | fr | it
create temporary table seed (template text, code text, de text, fr text, it text, ord serial);

insert into seed (template, code, de, fr, it) values
  ('bkp', '0', 'Grundstück', 'Terrain', 'Fondo'),
  ('bkp', '1', 'Vorbereitungsarbeiten', 'Travaux préparatoires', 'Lavori preparatori'),
  ('bkp', '10', 'Bestandesaufnahmen, Baugrunduntersuchungen', 'Relevés, études géotechniques', 'Rilievi, indagini geotecniche'),
  ('bkp', '11', 'Räumungen, Terrainvorbereitungen', 'Déblaiement, préparation du terrain', 'Sgomberi, preparazione del terreno'),
  ('bkp', '12', 'Sicherungen, Provisorien', 'Protections, aménagements provisoires', 'Protezioni, opere provvisorie'),
  ('bkp', '13', 'Gemeinsame Baustelleneinrichtung', 'Installations de chantier en commun', 'Impianti di cantiere comuni'),
  ('bkp', '14', 'Anpassungen an bestehende Bauten', 'Adaptation de bâtiments existants', 'Adattamenti a edifici esistenti'),
  ('bkp', '15', 'Anpassungen an bestehende Erschliessungsleitungen', 'Adaptation du réseau de conduites existant', 'Adattamenti alle condotte esistenti'),
  ('bkp', '19', 'Honorare', 'Honoraires', 'Onorari'),
  ('bkp', '2', 'Gebäude', 'Bâtiment', 'Edificio'),
  ('bkp', '20', 'Baugrube', 'Excavation', 'Scavo'),
  ('bkp', '21', 'Rohbau 1', 'Gros œuvre 1', 'Costruzione grezza 1'),
  ('bkp', '22', 'Rohbau 2', 'Gros œuvre 2', 'Costruzione grezza 2'),
  ('bkp', '23', 'Elektroanlagen', 'Installations électriques', 'Impianti elettrici'),
  ('bkp', '231', 'Apparate Starkstrom', 'Appareils à courant fort', 'Apparecchi corrente forte'),
  ('bkp', '232', 'Starkstrominstallationen', 'Installations à courant fort', 'Impianti a corrente forte'),
  ('bkp', '233', 'Leuchten und Lampen', 'Lustrerie', 'Lampade e apparecchi illuminanti'),
  ('bkp', '235', 'Apparate Schwachstrom', 'Appareils à courant faible', 'Apparecchi corrente debole'),
  ('bkp', '236', 'Schwachstrominstallationen', 'Installations à courant faible', 'Impianti a corrente debole'),
  ('bkp', '237', 'Gebäudeautomation', 'Automatisation du bâtiment', 'Automazione degli edifici'),
  ('bkp', '24', 'Heizungs-, Lüftungs-, Klima- und Kälteanlagen', 'Chauffage, ventilation, conditionnement d''air (installations)', 'Impianti di riscaldamento, ventilazione, climatizzazione e refrigerazione'),
  ('bkp', '241', 'Zulieferung Energieträger, Lagerung', 'Fourniture d''agents énergétiques, stockage', 'Fornitura di vettori energetici, deposito'),
  ('bkp', '242', 'Wärmeerzeugung', 'Production de chaleur', 'Produzione di calore'),
  ('bkp', '243', 'Wärmeverteilung', 'Distribution de chaleur', 'Distribuzione di calore'),
  ('bkp', '244', 'Lüftungsanlagen', 'Installations de ventilation', 'Impianti di ventilazione'),
  ('bkp', '245', 'Klimaanlagen', 'Installations de conditionnement d''air', 'Impianti di climatizzazione'),
  ('bkp', '246', 'Kälteanlagen', 'Installations frigorifiques', 'Impianti di refrigerazione'),
  ('bkp', '247', 'Spezialanlagen', 'Installations spéciales', 'Impianti speciali'),
  ('bkp', '248', 'Dämmungen HLK-Installationen', 'Isolations des installations CVC', 'Isolazioni impianti RVC'),
  ('bkp', '25', 'Sanitäranlagen', 'Installations sanitaires', 'Impianti sanitari'),
  ('bkp', '251', 'Allgemeine Sanitärapparate', 'Appareils sanitaires courants', 'Apparecchi sanitari correnti'),
  ('bkp', '252', 'Spezielle Sanitärapparate', 'Appareils sanitaires spéciaux', 'Apparecchi sanitari speciali'),
  ('bkp', '253', 'Sanitäre Ver- und Entsorgungsapparate', 'Appareils sanitaires d''alimentation et d''évacuation', 'Apparecchi sanitari di alimentazione e smaltimento'),
  ('bkp', '254', 'Sanitärleitungen', 'Tuyauterie sanitaire', 'Condotte sanitarie'),
  ('bkp', '255', 'Dämmungen Sanitärinstallationen', 'Isolations d''installations sanitaires', 'Isolazioni impianti sanitari'),
  ('bkp', '256', 'Sanitärinstallationselemente', 'Éléments d''installations sanitaires', 'Elementi per impianti sanitari'),
  ('bkp', '258', 'Kücheneinrichtungen', 'Agencements de cuisine', 'Arredi per cucine'),
  ('bkp', '26', 'Transportanlagen, Lageranlagen', 'Installations de transport', 'Impianti di trasporto'),
  ('bkp', '27', 'Ausbau 1', 'Aménagements intérieurs 1', 'Finiture 1'),
  ('bkp', '28', 'Ausbau 2', 'Aménagements intérieurs 2', 'Finiture 2'),
  ('bkp', '29', 'Honorare', 'Honoraires', 'Onorari'),
  ('bkp', '291', 'Architekt', 'Architecte', 'Architetto'),
  ('bkp', '292', 'Bauingenieur', 'Ingénieur civil', 'Ingegnere civile'),
  ('bkp', '293', 'Elektroingenieur', 'Ingénieur électricien', 'Ingegnere elettrotecnico'),
  ('bkp', '294', 'HLK-Ingenieur', 'Ingénieur CVC', 'Ingegnere RVC'),
  ('bkp', '295', 'Sanitäringenieur', 'Ingénieur sanitaire', 'Ingegnere sanitario'),
  ('bkp', '296', 'Spezialisten', 'Spécialistes', 'Specialisti'),
  ('bkp', '3', 'Betriebseinrichtungen', 'Équipements d''exploitation', 'Attrezzature d''esercizio'),
  ('bkp', '33', 'Elektroanlagen', 'Installations électriques', 'Impianti elettrici'),
  ('bkp', '34', 'Heizungs-, Lüftungs-, Klima- und Kälteanlagen', 'Chauffage, ventilation, conditionnement d''air (installations)', 'Impianti di riscaldamento, ventilazione, climatizzazione e refrigerazione'),
  ('bkp', '35', 'Sanitäranlagen', 'Installations sanitaires', 'Impianti sanitari'),
  ('bkp', '39', 'Honorare', 'Honoraires', 'Onorari'),
  ('bkp', '4', 'Umgebung', 'Aménagements extérieurs', 'Lavori esterni'),
  ('bkp', '44', 'Installationen', 'Installations', 'Impianti'),
  ('bkp', '45', 'Erschliessung durch Leitungen (innerhalb Grundstück)', 'Conduites de raccordement (à l''intérieur de la parcelle)', 'Allacciamenti (all''interno del fondo)'),
  ('bkp', '49', 'Honorare', 'Honoraires', 'Onorari'),
  ('bkp', '5', 'Baunebenkosten und Übergangskonten', 'Frais secondaires et comptes d''attente', 'Costi secondari e conti transitori'),
  ('bkp', '51', 'Bewilligungen, Gebühren', 'Autorisations, taxes', 'Permessi, tasse'),
  ('bkp', '52', 'Muster, Modelle, Vervielfältigungen, Dokumentation', 'Échantillons, maquettes, reproductions, documents', 'Campioni, modelli, riproduzioni, documentazione'),
  ('bkp', '53', 'Versicherungen', 'Assurances', 'Assicurazioni'),
  ('bkp', '56', 'Übrige Baunebenkosten', 'Autres frais secondaires', 'Altri costi secondari'),
  ('bkp', '58', 'Übergangskonten für Rückstellungen und Reserven', 'Comptes d''attente pour provisions et réserves', 'Conti transitori per accantonamenti e riserve'),
  ('bkp', '9', 'Ausstattung', 'Ameublement et décoration', 'Arredo'),
  ('ebkp_h', 'A', 'Grundstück', 'Bien-fonds', 'Fondo'),
  ('ebkp_h', 'B', 'Vorbereitung', 'Préparation', 'Preparazione'),
  ('ebkp_h', 'C', 'Konstruktion Gebäude', 'Construction du bâtiment', 'Costruzione edificio'),
  ('ebkp_h', 'D', 'Technik Gebäude', 'Installations techniques du bâtiment', 'Impianti tecnici edificio'),
  ('ebkp_h', 'D01', 'Elektroanlage', 'Installation électrique', 'Impianto elettrico'),
  ('ebkp_h', 'D05', 'Wärmetechnische Anlage', 'Installation thermique', 'Impianto termico'),
  ('ebkp_h', 'D07', 'Lufttechnische Anlage', 'Installation aéraulique', 'Impianto aeraulico'),
  ('ebkp_h', 'D08', 'Wassertechnische Anlage (Sanitär)', 'Installation sanitaire', 'Impianto sanitario'),
  ('ebkp_h', 'D09', 'Transportanlage', 'Installation de transport', 'Impianto di trasporto'),
  ('ebkp_h', 'E', 'Äussere Wandbekleidung Gebäude', 'Revêtement de façade', 'Rivestimento esterno pareti'),
  ('ebkp_h', 'F', 'Bedachung Gebäude', 'Toiture', 'Copertura'),
  ('ebkp_h', 'G', 'Ausbau Gebäude', 'Aménagement intérieur', 'Finiture interne'),
  ('ebkp_h', 'H', 'Nutzungsspezifische Anlage Gebäude', 'Installation spécifique à l''utilisation', 'Impianto specifico all''utilizzazione'),
  ('ebkp_h', 'I', 'Umgebung Gebäude', 'Abords du bâtiment', 'Esterni edificio'),
  ('ebkp_h', 'J', 'Ausstattung Gebäude', 'Équipement du bâtiment', 'Arredo edificio'),
  ('ebkp_h', 'V', 'Planungskosten', 'Frais de planification', 'Costi di progettazione'),
  ('ebkp_h', 'W', 'Nebenkosten zu Erstellung', 'Frais secondaires', 'Costi secondari'),
  ('ebkp_h', 'Y', 'Reserve, Teuerung', 'Réserve, renchérissement', 'Riserva, rincaro'),
  ('ebkp_h', 'Z', 'Mehrwertsteuer', 'Taxe sur la valeur ajoutée', 'Imposta sul valore aggiunto');

insert into public.cost_plan_items (template_id, code, name, sort)
select t.id, s.code, jsonb_build_object('de', s.de, 'fr', s.fr, 'it', s.it), s.ord
  from seed s
  join public.cost_plan_templates t on t.key = s.template;

-- Parent = the longest other code of the same list that is a prefix of this code.
update public.cost_plan_items i
   set parent_id = (
     select p.id from public.cost_plan_items p
      where p.template_id = i.template_id and p.id <> i.id and i.code like p.code || '%'
      order by length(p.code) desc
      limit 1
   );

-- Existing projects use BKP.
update public.projects set cost_plan_template_id = (select id from public.cost_plan_templates where key = 'bkp');

drop table seed;
