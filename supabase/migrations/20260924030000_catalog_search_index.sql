-- Fast catalogue search: a lower-case search text per entry with a trigram index, so "contains word"
-- searches in supplier catalogues (up to ~100k entries) do not scan the whole catalogue.

create extension if not exists pg_trgm with schema extensions;

alter table public.catalog_nodes
  add column search_text text generated always as (
    lower(
      coalesce(number, '') || ' ' || coalesce(article_number, '') || ' ' ||
      coalesce(short_text ->> 'de', '') || ' ' || coalesce(short_text ->> 'fr', '') || ' ' || coalesce(short_text ->> 'it', '')
    )
  ) stored;

create index catalog_nodes_search_idx on public.catalog_nodes using gin (search_text extensions.gin_trgm_ops);

-- Same result as before; the query is built per call so every word becomes an indexable LIKE condition.
create or replace function public.search_catalog_nodes(p_catalog_id uuid, p_query text, p_limit int default 200)
returns table (
  id uuid, parent_id uuid, kind public.node_kind, sort int, number text, article_number text,
  short_text jsonb, unit text, unit_price numeric, path text
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  conditions text := '';
  word text;
begin
  for word in
    select distinct w from regexp_split_to_table(lower(btrim(coalesce(p_query, ''))), '\s+') as w where w <> '' limit 10
  loop
    conditions := conditions || format(
      ' and n.search_text like %L', '%' || replace(replace(replace(word, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    );
  end loop;
  if conditions = '' then
    return;
  end if;

  return query execute format($query$
    with hits as (
      select n.*
        from public.catalog_nodes n
       where n.catalog_id = $1 and n.kind <> 'text' %s
       order by n.sort
       limit $2
    )
    select h.id, h.parent_id, h.kind, h.sort, h.number, h.article_number, h.short_text, h.unit, h.unit_price,
           (with recursive up as (
              select p.id, p.parent_id, p.short_text, 1 as depth from public.catalog_nodes p where p.id = h.parent_id
              union all
              select p.id, p.parent_id, p.short_text, up.depth + 1
                from public.catalog_nodes p join up on p.id = up.parent_id
            )
            select string_agg(coalesce(up.short_text ->> 'de', ''), ' › ' order by up.depth desc) from up)
      from hits h
     order by h.sort
  $query$, conditions)
  using p_catalog_id, least(greatest(p_limit, 1), 500);
end;
$$;
