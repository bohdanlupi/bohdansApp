-- Atomic CSV import of addresses (all rows or nothing).
--
-- import_rows: [{ name, name2, street, po_box, zip, city, country, phone, email, website, uid_number, notes,
--          contact_salutation ('mr'|'ms'|null), contact_first_name, contact_last_name, contact_function,
--          contact_phone, contact_mobile, contact_email }]
-- Rows with the same company name + zip (case-insensitive) share one company; a company that already
-- exists with that name + zip gets the contacts added. Rows without a company name are skipped.
-- Runs as the caller (RLS applies).
create or replace function public.import_addresses(
  import_rows jsonb,
  company_language public.app_language,
  company_categories text[],
  company_trades text[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r jsonb;
  v_company_id uuid;
  v_first_name text;
  v_last_name text;
  new_companies int := 0;
  new_contacts int := 0;
  skipped int := 0;
begin
  if not public.can_write() then
    raise exception 'Only admins and planners may import addresses' using errcode = '42501';
  end if;

  for r in select value from jsonb_array_elements(import_rows) loop
    if coalesce(btrim(r ->> 'name'), '') = '' then
      skipped := skipped + 1;
      continue;
    end if;

    select c.id into v_company_id
      from public.companies c
     where lower(btrim(c.name)) = lower(btrim(r ->> 'name'))
       and coalesce(btrim(c.zip), '') = coalesce(btrim(r ->> 'zip'), '')
     order by c.created_at
     limit 1;

    if v_company_id is null then
      insert into public.companies (
        name, name2, street, po_box, zip, city, country, phone, email, website, uid_number, notes,
        language, categories, trades
      ) values (
        btrim(r ->> 'name'), r ->> 'name2', r ->> 'street', r ->> 'po_box', r ->> 'zip', r ->> 'city',
        coalesce(nullif(r ->> 'country', ''), 'CH'), r ->> 'phone', r ->> 'email', r ->> 'website',
        r ->> 'uid_number', r ->> 'notes', company_language, company_categories, company_trades
      )
      returning id into v_company_id;
      new_companies := new_companies + 1;
    end if;

    -- last_name is required; a lone first name is stored as last name.
    v_first_name := nullif(btrim(r ->> 'contact_first_name'), '');
    v_last_name := nullif(btrim(r ->> 'contact_last_name'), '');
    if v_last_name is null and v_first_name is not null then
      v_last_name := v_first_name;
      v_first_name := null;
    end if;

    if v_last_name is not null then
      insert into public.contacts (
        company_id, salutation, first_name, last_name, function, phone, mobile, email
      ) values (
        v_company_id, r ->> 'contact_salutation', v_first_name, v_last_name, r ->> 'contact_function',
        r ->> 'contact_phone', r ->> 'contact_mobile', r ->> 'contact_email'
      );
      new_contacts := new_contacts + 1;
    end if;
  end loop;

  return jsonb_build_object('companies', new_companies, 'contacts', new_contacts, 'skipped', skipped);
end;
$$;

revoke all on function public.import_addresses(jsonb, public.app_language, text[], text[]) from public, anon;
grant execute on function public.import_addresses(jsonb, public.app_language, text[], text[]) to authenticated;
