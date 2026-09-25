create or replace function can_manage_speaker(p_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select exists (
    select 1 from speaker_profile sp
    where sp.id = p_profile_id
      and (
        is_speaker_team(sp.edition_id)
        or (has_role('speaker_manager') and (
              sp.owner_person_id = current_person_id()
              or sp.created_by = current_person_id()
              -- PORT3 / L1: kein Edition-Zweig mehr — Stage Leads verwalten
              -- die Speaker ihrer Bühnen (Sessions der Edition des Profils).
              or exists (
                select 1
                from session_speaker ss
                join session se on se.id = ss.session_id
                join event ev on ev.id = se.event_id and coalesce(ev.edition_id, ev.id) = sp.edition_id
                join slot sl on sl.id = se.slot_id
                left join stage_day sd on sd.stage_id = sl.stage_id and sd.event_day_id = sl.event_day_id
                where ss.person_id = sp.person_id
                  and (is_stage_lead_of(sl.stage_id)
                       or has_role('speaker_manager', 'slot', sl.id)
                       or (sd.id is not null and has_role('speaker_manager', 'stage_day', sd.id)))
              )))
      )
  )
$$;
