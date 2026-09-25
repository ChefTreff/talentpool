create or replace function has_role(p_role text, p_scope_type text DEFAULT NULL::text, p_scope_id uuid DEFAULT NULL::uuid, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select exists (
    select 1 from role_assignment ra
    where ra.person_id = current_person_id()
      and not exists (select 1 from person zp where zp.id = current_person_id() and zp.access_blocked_at is not null)
      and ra.role = p_role
      and ra.valid_from <= now()
      and (ra.valid_to is null or ra.valid_to > now())
      and (
           ra.scope_type = 'global'
        or p_scope_type is null
        or (ra.scope_type = p_scope_type
            and (p_scope_id is null or ra.scope_id = p_scope_id)
            and (p_edition_id is null or ra.edition_id = p_edition_id))
      )
  )
$$;
