create or replace function speaker_ticket_quotas(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(profile_id uuid, speaker_name text, pass_type text, lounge_access boolean, companion_quota integer, companions_active integer, own_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not coalesce(is_speaker_team(p_edition_id), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select sp.id,
           coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), '—'),
           sp.pass_type, sp.lounge_access, sp.companion_quota,
           (select count(*)::integer from ticket t where t.speaker_profile_id = sp.id and t.source = 'speaker_companion' and t.status <> 'cancelled'),
           (select t.status from ticket t where t.speaker_profile_id = sp.id and t.source = 'speaker' and t.status <> 'cancelled'
             order by t.created_at desc limit 1)
      from speaker_profile sp
      join person p on p.id = sp.person_id
     where speaker_is_confirmed(sp.pipeline_status)
       and not sp.stage_guest
       and (p_edition_id is null or sp.edition_id = p_edition_id)
     order by lower(coalesce(p.last_name, '')), lower(coalesce(p.first_name, '')), sp.id;
end $$;
