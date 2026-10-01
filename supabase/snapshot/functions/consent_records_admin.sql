create or replace function consent_records_admin(p_person_id uuid DEFAULT NULL::uuid, p_type text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_query text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, person_id uuid, person_name text, email text, consent_type text, version text, granted boolean, granted_at timestamp with time zone, revoked_at timestamp with time zone, source text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('consents') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_state is not null and p_state not in ('granted', 'declined', 'revoked') then
    raise exception 'invalid_state' using errcode = '22023', detail = p_state;
  end if;

  return query
    select c.id, c.person_id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           (select pe.email::text from person_email pe where pe.person_id = c.person_id and pe.is_primary),
           c.consent_type, c.version, c.granted, c.granted_at, c.revoked_at, c.source,
           count(*) over ()
      from consent_record c
      join person p on p.id = c.person_id
     where (p_person_id is null or c.person_id = p_person_id)
       and (p_type is null or c.consent_type = p_type)
       and (p_state is null
            or (p_state = 'revoked' and c.revoked_at is not null)
            or (p_state = 'granted' and c.granted and c.revoked_at is null)
            or (p_state = 'declined' and not c.granted and c.revoked_at is null))
       and (v_q is null
            or (coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) ilike '%' || v_q || '%'
            or exists (select 1 from person_email pe where pe.person_id = c.person_id and pe.email::text ilike '%' || v_q || '%'))
     order by coalesce(c.revoked_at, c.granted_at) desc, c.id
     limit greatest(1, least(coalesce(p_limit, 50), 200)) offset greatest(0, coalesce(p_offset, 0));
end $$;
