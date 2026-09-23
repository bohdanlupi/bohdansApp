-- IGH supplier catalogues (DataExpert XML), imported with scripts/import-igh.mjs.
--
-- They live in the same tables as the own catalogue but are read-only in the app and are replaced
-- as a whole on re-import (matched by external_key "igh:<supplier no>:<catalogue no>").
-- Articles are positions with the supplier article number; the supplier's register becomes the group tree.
-- Supplier catalogues are much larger than own catalogues, so the app loads them one group at a time
-- (catalog_children) and searches them on the server (search_catalog_nodes).

alter table public.catalogs
  add column source       text not null default 'own' check (source in ('own', 'igh')),
  add column supplier     text,
  add column external_key text unique,
  add column version      text,
  add column valid_from   date,
  add column valid_to     date,
  add column imported_at  timestamptz;

alter table public.catalog_nodes add column article_number text;

create index catalog_nodes_parent_idx on public.catalog_nodes (catalog_id, parent_id, sort);

-- Children of a node (null = top level), with the number of their own children for the expand arrows.
create function public.catalog_children(p_catalog_id uuid, p_parent_id uuid, p_offset int default 0, p_limit int default 500)
returns table (
  id uuid, parent_id uuid, kind public.node_kind, sort int, number text, article_number text,
  short_text jsonb, unit text, unit_price numeric, child_count int
)
language sql stable security invoker set search_path = '' as $$
  select n.id, n.parent_id, n.kind, n.sort, n.number, n.article_number, n.short_text, n.unit, n.unit_price,
         (select count(*) from public.catalog_nodes c where c.catalog_id = n.catalog_id and c.parent_id = n.id)::int
    from public.catalog_nodes n
   where n.catalog_id = p_catalog_id
     and n.parent_id is not distinct from p_parent_id
   order by n.sort
  offset greatest(p_offset, 0)
   limit least(greatest(p_limit, 1), 1000);
$$;

-- Positions and groups whose number, article number or short text (any language) contain every word of
-- the query, in catalogue order, with the path of group titles above them.
create function public.search_catalog_nodes(p_catalog_id uuid, p_query text, p_limit int default 200)
returns table (
  id uuid, parent_id uuid, kind public.node_kind, sort int, number text, article_number text,
  short_text jsonb, unit text, unit_price numeric, path text
)
language sql stable security invoker set search_path = '' as $$
  with words as (
    select '%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
      from regexp_split_to_table(lower(btrim(p_query)), '\s+') as w
     where w <> ''
  ),
  hits as (
    select n.*
      from public.catalog_nodes n
     where n.catalog_id = p_catalog_id
       and n.kind <> 'text'
       and exists (select 1 from words)
       and not exists (
         select 1 from words
          where lower(concat_ws(' ', n.number, n.article_number,
                  n.short_text ->> 'de', n.short_text ->> 'fr', n.short_text ->> 'it')) not like words.pattern
       )
     order by n.sort
     limit least(greatest(p_limit, 1), 500)
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
   order by h.sort;
$$;

-- The given nodes with all their descendants, parents before children (for copying into an LV).
create function public.catalog_subtrees(p_ids uuid[])
returns setof public.catalog_nodes
language sql stable security invoker set search_path = '' as $$
  with recursive tree as (
    select n.* from public.catalog_nodes n where n.id = any (p_ids)
    union
    select c.* from public.catalog_nodes c join tree t on c.parent_id = t.id and c.catalog_id = t.catalog_id
  )
  select * from tree order by sort, id;
$$;

revoke all on function public.catalog_children, public.search_catalog_nodes, public.catalog_subtrees from public, anon;
grant execute on function public.catalog_children, public.search_catalog_nodes, public.catalog_subtrees to authenticated;
