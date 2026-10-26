-- Gebäudemodell plans: text labels of the plan page (room names, printed areas, dimensions from the PDF text layer, in
-- snapshot pixel coordinates) as suggestions in the tracing editor, and a smaller PNG preview for the plan PDF.
alter table public.building_plans
  add column labels        jsonb not null default '[]' check (jsonb_typeof(labels) = 'array'),
  add column preview_path  text;
