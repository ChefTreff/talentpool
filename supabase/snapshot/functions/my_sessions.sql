create or replace function my_sessions()
 RETURNS TABLE(session_id uuid, event_id uuid, event_name text, title_de text, title_en text, description_de text, description_en text, language text, format text, access_mode text, publish_status text, speaker_role text, confirmed boolean, start_at timestamp with time zone, end_at timestamp with time zone, stage_name text, room text, timezone text, co_speakers jsonb, latest_submission jsonb, on_behalf_of jsonb, tech jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select se.id, se.event_id, e.name, se.title_de, se.title_en, se.description_de, se.description_en,
         se.language, se.format, se.access_mode, se.publish_status, ss.role, ss.confirmed,
         sl.start_at, sl.end_at, st.name, st.room, e.timezone,
         coalesce((select jsonb_agg(jsonb_build_object('person_id', p2.id, 'first_name', p2.first_name, 'last_name', p2.last_name, 'role', ss2.role) order by ss2.sort_order)
                   from session_speaker ss2 join person p2 on p2.id = ss2.person_id
                   where ss2.session_id = se.id and ss2.person_id <> ss.person_id), '[]'::jsonb),
         (select to_jsonb(sub) from (
            select s.id, s.title, s.description, s.topics, s.language, s.notes, s.status, s.review_note, s.created_at, s.reviewed_at,
                   -- SPK-050: ob vor dieser Einreichung schon eine übernommen wurde.
                   exists (select 1 from session_submission s0
                            where s0.session_id = s.session_id and s0.status = 'approved'
                              and s0.created_at < s.created_at) as is_change
            from session_submission s where s.session_id = se.id order by s.created_at desc limit 1) sub),
         case when sp.person_id <> current_person_id()
              then jsonb_build_object('person_id', sp.person_id, 'first_name', p.first_name, 'last_name', p.last_name) end,
         coalesce(se.tech, '{}'::jsonb)
  from speaker_profile sp
  join person p on p.id = sp.person_id
  join session_speaker ss on ss.person_id = sp.person_id
  join session se on se.id = ss.session_id
  join event e on e.id = se.event_id and (e.edition_id = sp.edition_id or e.id = sp.edition_id)
  left join slot sl on sl.id = se.slot_id
  left join stage st on st.id = sl.stage_id
  where sp.person_id = current_person_id() or is_speaker_assistant(sp.id, current_person_id())
  order by sl.start_at nulls last, se.title_de
$$;
