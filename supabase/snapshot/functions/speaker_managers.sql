create or replace function speaker_managers()
 RETURNS TABLE(person_id uuid, display_name text, email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not (has_role('admin') or has_role('area_lead_speaker') or has_role('programme_team')
          or has_role('speaker_manager')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select p.id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           (select pe.email::text from person_email pe where pe.person_id = p.id and pe.is_primary)
      from person p
     where p.deleted_at is null and is_speaker_manager(p.id)
     order by 2 nulls last;
end $$;
