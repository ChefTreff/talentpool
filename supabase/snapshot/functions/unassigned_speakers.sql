create or replace function unassigned_speakers(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(profile_id uuid, display_name text, job_title text, organization_name text, speaker_type text, pipeline_status text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not can_manage_speaker_leads() then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;
  return query
    select sp.id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           sp.job_title, sp.organization_name, sp.speaker_type, sp.pipeline_status, sp.created_at
      from speaker_profile sp
      join person p on p.id = sp.person_id
     where sp.edition_id = v_ed
       and sp.owner_person_id is null
       and sp.declined_at is null
       and p.deleted_at is null
     order by sp.created_at;
end $$;
