create or replace function pending_submissions(p_event_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, session_id uuid, event_id uuid, session_title_de text, session_title_en text, session_description_de text, session_description_en text, session_language text, publish_status text, start_at timestamp with time zone, stage_name text, speaker_profile_id uuid, speaker_name text, title text, description text, topics text[], language text, notes text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select s.id, se.id, se.event_id, se.title_de, se.title_en, se.description_de, se.description_en, se.language, se.publish_status,
         sl.start_at, st.name,
         s.speaker_profile_id, (select btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) from person p where p.id = s.submitted_by),
         s.title, s.description, s.topics, s.language, s.notes, s.created_at
  from session_submission s
  join session se on se.id = s.session_id
  left join slot sl on sl.id = se.slot_id
  left join stage st on st.id = sl.stage_id
  where s.status = 'submitted'
    and (p_event_id is null or se.event_id = p_event_id)
    and (can_edit_session(se.id) or can_manage_speaker(s.speaker_profile_id))
  order by s.created_at
$$;
