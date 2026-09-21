create or replace function team_members()
 RETURNS TABLE(person_id uuid, display_name text, email text, has_account boolean, is_admin boolean, roles jsonb, since timestamp with time zone, admins integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_admins integer;
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;

  select count(distinct ra.person_id)::integer into v_admins
    from role_assignment ra
   where ra.role = 'admin' and ra.scope_type = 'global'
     and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now());

  return query
    select p.id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           (select pe.email::text from person_email pe where pe.person_id = p.id and pe.is_primary),
           p.auth_user_id is not null,
           bool_or(ra.role = 'admin'),
           jsonb_agg(jsonb_build_object(
             'id', ra.id, 'role', ra.role, 'scope_type', ra.scope_type,
             'scope_id', ra.scope_id, 'edition_id', ra.edition_id, 'portal', ra.portal,
             'valid_to', ra.valid_to,
             'scope_label', case
               when ra.scope_type = 'global' then null
               when ra.edition_id is not null then (select e.name from event e where e.id = ra.edition_id)
               when ra.scope_type = 'portal' then ra.portal
               when ra.scope_type = 'stage' then (select st.name from stage st where st.id = ra.scope_id)
               when ra.scope_type = 'org' then (select coalesce(o.communication_name, o.legal_name)
                                                  from organization o where o.id = ra.scope_id)
               else null end)
             order by ra.role) ,
           min(ra.valid_from),
           v_admins
      from person p
      join role_assignment ra on ra.person_id = p.id
     where p.deleted_at is null
       and ra.role = any (team_role_keys())
       and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())
     group by p.id, p.first_name, p.last_name, p.auth_user_id
     order by bool_or(ra.role = 'admin') desc, 2 nulls last;
end $$;
