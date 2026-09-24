create or replace function admin_section_overrides()
 RETURNS TABLE(id uuid, section text, role text, person_id uuid, person_name text, allowed boolean, note text, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select o.id, o.section, o.role, o.person_id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           o.allowed, o.note, o.updated_at
      from admin_section_override o
      left join person p on p.id = o.person_id
     order by o.section, o.role nulls last, p.last_name, p.first_name;
end $$;
