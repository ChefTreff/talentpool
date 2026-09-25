create or replace function my_roles()
 RETURNS TABLE(role text, scope_type text, scope_id uuid, edition_id uuid, portal text, valid_to timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select role, scope_type, scope_id, edition_id, portal, valid_to
  from role_assignment
  where person_id = current_person_id()
    and valid_from <= now()
    and (valid_to is null or valid_to > now())
    and not exists (select 1 from person zp where zp.id = current_person_id() and zp.access_blocked_at is not null)
$$;
