create or replace function partner_contacts(p_org_id uuid)
 RETURNS TABLE(person_id uuid, first_name text, last_name text, title text, email text, contact_position text, roles text[], has_login boolean, invited_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select p.id, p.first_name, p.last_name, p.title,
           (select pe.email::text from person_email pe where pe.person_id = p.id and pe.is_primary),
           om.contact_position, om.roles, (p.auth_user_id is not null), om.invited_at
    from org_membership om join person p on p.id = om.person_id
    where om.org_id = p_org_id and p.deleted_at is null
    order by ('primary_ops' = any(om.roles)) desc, p.last_name nulls last, p.first_name nulls last;
end $$;
