-- Number of entries per catalogue, kept up to date by statement-level triggers. Counting ~200k supplier
-- catalogue rows on every visit of the catalogue list was too slow on the small database instance.

alter table public.catalogs add column entry_count integer not null default 0;

create function public.catalog_nodes_count_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.catalogs c
     set entry_count = c.entry_count + d.n
    from (select catalog_id, count(*)::int as n from new_rows group by catalog_id) d
   where c.id = d.catalog_id;
  return null;
end;
$$;

create function public.catalog_nodes_count_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.catalogs c
     set entry_count = greatest(c.entry_count - d.n, 0)
    from (select catalog_id, count(*)::int as n from old_rows group by catalog_id) d
   where c.id = d.catalog_id;
  return null;
end;
$$;

revoke all on function public.catalog_nodes_count_insert, public.catalog_nodes_count_delete from public, anon, authenticated;

create trigger catalog_nodes_count_insert
  after insert on public.catalog_nodes
  referencing new table as new_rows
  for each statement execute function public.catalog_nodes_count_insert();

create trigger catalog_nodes_count_delete
  after delete on public.catalog_nodes
  referencing old table as old_rows
  for each statement execute function public.catalog_nodes_count_delete();

update public.catalogs c
   set entry_count = (select count(*) from public.catalog_nodes n where n.catalog_id = c.id);
