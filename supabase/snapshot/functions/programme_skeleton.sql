create or replace function programme_skeleton(p_event_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ev uuid;
begin
  select coalesce(p_event_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ev;
  if v_ev is null then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  if not is_programme_editor(v_ev) then raise exception 'not allowed' using errcode = '42501'; end if;

  return jsonb_build_object(
    'event', (select jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug,
                                        'start_date', e.start_date, 'end_date', e.end_date,
                                        'timezone', e.timezone, 'venue', e.venue)
                from event e where e.id = v_ev),
    'days', coalesce((select jsonb_agg(jsonb_build_object(
                        'id', ed.id, 'day_date', ed.day_date, 'label_de', ed.label_de, 'label_en', ed.label_en,
                        'doors_open', ed.doors_open, 'programme_start', ed.programme_start,
                        'programme_end', ed.programme_end, 'sort_order', ed.sort_order,
                        'slots', (select count(*) from slot s where s.event_day_id = ed.id))
                      order by ed.day_date, ed.sort_order)
                from event_day ed where ed.event_id = v_ev), '[]'::jsonb),
    'stages', coalesce((select jsonb_agg(jsonb_build_object(
                        'id', st.id, 'name', st.name, 'slug', st.slug, 'type', st.type, 'room', st.room,
                        'capacity', st.capacity, 'changeover_min', st.changeover_min,
                        'default_duration_min', st.default_duration_min,
                        'partner_slot_quota', st.partner_slot_quota, 'partner_org_id', st.partner_org_id,
                        'partner_org_name', (select coalesce(o.communication_name, o.legal_name)
                                               from organization o where o.id = st.partner_org_id),
                        'stage_lead_person_id', st.stage_lead_person_id,
                        'stage_lead_name', (select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
                                              from person p where p.id = st.stage_lead_person_id),
                        'sort_order', st.sort_order, 'active', st.active,
                        'slots', (select count(*) from slot s where s.stage_id = st.id))
                      order by st.sort_order, st.name)
                from stage st where st.event_id = v_ev), '[]'::jsonb),
    'stage_days', coalesce((select jsonb_agg(jsonb_build_object(
                        'id', sd.id, 'stage_id', sd.stage_id, 'event_day_id', sd.event_day_id,
                        'open_from', sd.open_from, 'open_to', sd.open_to,
                        'slot_quota', sd.slot_quota, 'notes', sd.notes))
                from stage_day sd
                join stage st on st.id = sd.stage_id
                where st.event_id = v_ev), '[]'::jsonb),
    'tracks', coalesce((select jsonb_agg(jsonb_build_object(
                        'id', t.id, 'name_de', t.name_de, 'name_en', t.name_en, 'slug', t.slug,
                        'sort_order', t.sort_order,
                        'sessions', (select count(*) from session se where se.track_id = t.id))
                      order by t.sort_order, t.name_de)
                from track t where t.event_id = v_ev), '[]'::jsonb)
  );
end $$;
