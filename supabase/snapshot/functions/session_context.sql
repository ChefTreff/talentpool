create or replace function session_context()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select jsonb_build_object(
    'person_id',          p.id,
    'first_name',         p.first_name,
    'preferred_language', p.preferred_language,
    'tier',               p.tier,
    'is_staff',           is_staff(),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'role', r.role, 'scope_type', r.scope_type, 'scope_id', r.scope_id,
        'edition_id', r.edition_id, 'portal', r.portal, 'valid_to', r.valid_to))
      from my_roles() r), '[]'::jsonb)
  )
  from person p
  where p.id = current_person_id()
$$;
