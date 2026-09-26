create or replace function session_owner_candidates(p_event_id uuid)
 RETURNS TABLE(person_id uuid, name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not coalesce(is_programme_editor(p_event_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select p.id, nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
      from person p
     where p.id in (select l.person_id from event_stage_leads(p_event_id) l)
     order by p.last_name, p.first_name;
end $$;
