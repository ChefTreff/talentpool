create or replace function active_roles()
 RETURNS TABLE(role text, scope_type text, scope_id uuid, edition_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select role, scope_type, scope_id, edition_id
  from role_assignment
  where person_id = current_person_id()
    and valid_from <= now() and (valid_to is null or valid_to > now())
$$;
