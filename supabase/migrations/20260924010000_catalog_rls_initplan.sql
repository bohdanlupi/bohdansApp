-- Supplier catalogues have up to ~100k entries. The generic policies call current_app_role() / can_write()
-- once per row, which made counting and searching catalogue entries take seconds. Wrapped in a sub-select
-- the function is evaluated once per statement (Postgres "initplan"); the rules themselves are unchanged.

drop policy "catalog_nodes: read for members" on public.catalog_nodes;
drop policy "catalog_nodes: insert for writers" on public.catalog_nodes;
drop policy "catalog_nodes: update for writers" on public.catalog_nodes;
drop policy "catalog_nodes: delete for writers" on public.catalog_nodes;

create policy "catalog_nodes: read for members" on public.catalog_nodes for select to authenticated
  using ((select public.current_app_role()) is not null);
create policy "catalog_nodes: insert for writers" on public.catalog_nodes for insert to authenticated
  with check ((select public.can_write()));
create policy "catalog_nodes: update for writers" on public.catalog_nodes for update to authenticated
  using ((select public.can_write())) with check ((select public.can_write()));
create policy "catalog_nodes: delete for writers" on public.catalog_nodes for delete to authenticated
  using ((select public.can_write()));
