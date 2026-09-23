-- Group numbers in an LV can be set by hand (e.g. BKP codes: 24 › 242 › 242.0). null = automatic.
-- The app (src/lib/tree.ts) keeps a set number and numbers the following groups and the positions from it.

alter table public.lv_nodes
  add column custom_number text check (custom_number is null or custom_number ~ '^[0-9A-Za-z.\-]{1,20}$');
