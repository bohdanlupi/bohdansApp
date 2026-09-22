-- Views defined with `table.*` keep the column list from their creation time. Recreate them so they
-- include the columns added in 20260923100000_cost_plans.sql.

drop view public.lv_list;
create view public.lv_list with (security_invoker = true) as
select
  l.*,
  coalesce((
    select sum(round(coalesce(n.quantity, 0) * coalesce(n.unit_price, 0), 2))
      from public.lv_nodes n
     where n.lv_id = l.id and n.kind in ('position', 'r_position') and not n.is_optional
  ), 0)::numeric(14, 2) as estimate_total,
  (select count(*) from public.lv_nodes n where n.lv_id = l.id and n.kind in ('position', 'r_position'))::int
    as position_count
from public.lvs l;

drop view public.project_list;
create view public.project_list with (security_invoker = true) as
select
  p.*,
  (select string_agg(c.name, ', ' order by c.name)
     from public.project_participants pp
     join public.companies c on c.id = pp.company_id
    where pp.project_id = p.id and pp.role = 'client') as client_names,
  lower(concat_ws(' ',
    p.number, p.name, p.street, p.zip, p.city,
    (select string_agg(c.name, ' ')
       from public.project_participants pp
       join public.companies c on c.id = pp.company_id
      where pp.project_id = p.id)
  )) as search_text
from public.projects p;

revoke all on public.lv_list, public.project_list from anon;
grant select on public.lv_list, public.project_list to authenticated;
