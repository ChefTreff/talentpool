create or replace function manager_speakers(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, person_id uuid, first_name text, last_name text, title text, email text, job_title text, organization_name text, speaker_type text, pipeline_status text, owner_person_id uuid, owner_name text, reception_eligible boolean, travel_costs_covered boolean, travel_costs_approved boolean, hospitality_status text, hotel_tier text, pass_type text, lounge_access boolean, invited_at timestamp with time zone, confirmed_at timestamp with time zone, declined_at timestamp with time zone, decline_reason text, assistant_name text, sessions jsonb, next_open jsonb, updated_at timestamp with time zone, internal_notes text, category text, topic_cluster text, topic_role text, priority text, recommended_format text, contact_via text, outreach_channel text, stage_candidates jsonb, open_tasks integer, next_task jsonb, last_activity_at timestamp with time zone, stage_guest boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not (has_role('speaker_manager') or has_role('admin') or has_role('area_lead_speaker') or has_role('programme_team')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select sp.id, sp.person_id, p.first_name, p.last_name, p.title,
           (select pe.email::text from person_email pe where pe.person_id = p.id and pe.is_primary),
           sp.job_title, sp.organization_name, sp.speaker_type, sp.pipeline_status,
           sp.owner_person_id, (select btrim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, '')) from person o where o.id = sp.owner_person_id),
           sp.reception_eligible, sp.travel_costs_covered, (sp.travel_costs_approved_at is not null),
           sp.hospitality_status, sp.hotel_tier, sp.pass_type, sp.lounge_access, sp.invited_at,
           sp.confirmed_at, sp.declined_at, sp.decline_reason,
           (select string_agg(x.name, ', ' order by x.name) from (
              select nullif(btrim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), '') as name
                from person a where a.id = sp.assistant_person_id
              union
              select nullif(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '')
                from speaker_contact c where c.profile_id = sp.id and c.has_access
            ) x where x.name is not null),
           coalesce((select jsonb_agg(jsonb_build_object('session_id', se.id, 'title_de', se.title_de, 'title_en', se.title_en,
                                                          'publish_status', se.publish_status, 'start_at', sl.start_at, 'stage_name', st.name)
                                       order by sl.start_at nulls last)
                     from session_speaker ss join session se on se.id = ss.session_id join event e on e.id = se.event_id
                     left join slot sl on sl.id = se.slot_id left join stage st on st.id = sl.stage_id
                     where ss.person_id = sp.person_id and (e.edition_id = sp.edition_id or e.id = sp.edition_id)), '[]'::jsonb),
           speaker_next_steps(sp.id)->'open',
           sp.updated_at, sp.internal_notes,
           -- LEAD-039: Einordnung und Bühnen in Frage.
           sp.category, sp.topic_cluster, sp.topic_role, sp.priority, sp.recommended_format,
           sp.contact_via, sp.outreach_channel,
           coalesce((select jsonb_agg(jsonb_build_object('stage_id', st.id, 'name', st.name)
                                      order by st.sort_order, st.name)
                       from speaker_stage_candidate c join stage st on st.id = c.stage_id
                      where c.profile_id = sp.id), '[]'::jsonb),
           -- LEAD-039 Schnitt 2: Verlauf — offene Aufgaben, die früheste als
           -- nächster Schritt, und wann zuletzt etwas geschah (eine Aufgabe zählt
           -- erst, wenn sie erledigt ist).
           (select count(*)::integer from speaker_activity a
             where a.profile_id = sp.id and a.kind = 'task' and a.done_at is null),
           (select jsonb_build_object('id', a.id, 'body', a.body, 'due_on', a.due_on,
                                      'assignee_person_id', a.assignee_person_id,
                                      'assignee_name', (select nullif(btrim(coalesce(z.first_name, '') || ' ' || coalesce(z.last_name, '')), '')
                                                          from person z where z.id = a.assignee_person_id))
              from speaker_activity a
             where a.profile_id = sp.id and a.kind = 'task' and a.done_at is null
             order by a.due_on, a.created_at
             limit 1),
           (select max(case when a.kind = 'task' then a.done_at else a.occurred_at end)
              from speaker_activity a where a.profile_id = sp.id),
           -- SPK-070: vom Partner angelegter Gast (0188) — die Listen kennzeichnen
           -- ihn und blenden ihn auf Wunsch aus.
           sp.stage_guest
    from speaker_profile sp
    join person p on p.id = sp.person_id
    left join vocab_term v on v.vocabulary = 'speaker_pipeline' and v.key = sp.pipeline_status
    where (p_edition_id is null or sp.edition_id = p_edition_id)
      and p.deleted_at is null
      and can_manage_speaker(sp.id)
    order by v.sort_order nulls last, p.last_name nulls last, p.first_name nulls last;
end $$;
