create or replace function duplicate_candidates_admin(p_status text DEFAULT 'open'::text)
 RETURNS TABLE(id uuid, score numeric, signals jsonb, status text, person_a uuid, name_a text, email_a text, has_account_a boolean, created_a timestamp with time zone, person_b uuid, name_b text, email_b text, has_account_b boolean, created_b timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('duplicates') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status is not null and p_status not in ('open', 'confirmed_dupe', 'not_dupe') then
    raise exception 'invalid_state' using errcode = '22023', detail = p_status;
  end if;
  return query
    select d.id, d.score, d.signals, d.status,
           a.id, nullif(btrim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), ''),
           (select pe.email::text from person_email pe where pe.person_id = a.id and pe.is_primary),
           a.auth_user_id is not null, a.created_at,
           b.id, nullif(btrim(coalesce(b.first_name, '') || ' ' || coalesce(b.last_name, '')), ''),
           (select pe.email::text from person_email pe where pe.person_id = b.id and pe.is_primary),
           b.auth_user_id is not null, b.created_at
      from potential_duplicate d
      join person a on a.id = d.person_id_a
      join person b on b.id = d.person_id_b
     where (p_status is null or d.status = p_status)
     order by d.score desc, d.created_at
     limit 500;
end $$;
