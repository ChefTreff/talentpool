create or replace function create_slot(p_stage_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_slot_type text DEFAULT 'content'::text, p_session_id uuid DEFAULT NULL::uuid, p_source_ref text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_stage stage%rowtype;
  v_tz    text;
  v_day   event_day%rowtype;
  v_sd    stage_day%rowtype;
  v_id    uuid;
  v_win   record;
begin
  -- K-84: Standbühne und gebrandete Bühne der eigenen Organisation zählen mit (Helfer statt can_edit_stage — die Regie bleibt zu).
  if not can_edit_stage_slots(p_stage_id) then
    raise exception 'not allowed on this stage' using errcode = '42501';
  end if;
  if p_end <= p_start then
    raise exception 'end must be after start' using errcode = '22023';
  end if;
  -- K-84 (F2): wer auf einer Partnerbühne als Partner arbeitet, legt nur Inhalts-Slots an. Rahmen, feste Blöcke, Platzhalter und
  -- Partner-Blöcke setzt das Team.
  if p_slot_type is distinct from 'content' and partner_window_binds(p_stage_id) then
    raise exception 'slot_type_not_allowed' using errcode = 'P0001', detail = coalesce(p_slot_type, 'null');
  end if;
  select * into v_stage from stage where id = p_stage_id;
  select timezone into v_tz from event where id = v_stage.event_id;
  select * into v_day from event_day
    where event_id = v_stage.event_id and day_date = (p_start at time zone v_tz)::date;
  if not found then
    raise exception 'no event day for % on this stage', p_start using errcode = '22023';
  end if;

  -- ADM-085: Gültigkeitstage der Bühne und Sperrzeiten (nur Inhalts-Slots) — hart für alle, der Grund steht im detail.
  perform stage_slot_check(p_stage_id, p_start, p_end, p_slot_type);

  -- Tagesrahmen (LEAD-016): für Stage Leads hart, für das Programm-Team eine
  -- Warnung wie bisher. Ohne Rahmen keine Grenze (siehe Kopf). K-84 (R4): in Zeitpunkten gerechnet — ein Slot über Mitternacht besteht nicht.
  select * into v_sd from stage_day where stage_id = p_stage_id and event_day_id = v_day.id;
  if found and stage_frame_binds(p_stage_id)
     and slot_outside_window(p_start, p_end, v_day.day_date, v_sd.open_from, v_sd.open_to, v_tz) then
    raise exception 'outside_stage_day' using errcode = 'P0001',
      detail = coalesce(to_char(v_sd.open_from, 'HH24:MI'), '') || '–' || coalesce(to_char(v_sd.open_to, 'HH24:MI'), '');
  end if;
  -- PART-079/090, K-84: Partnerbühne (Standbühne und gebrandete Bühne) — Fenster = Öffnungszeiten der Bühne, sonst der Tagesrahmen. Für den
  -- Partner hart; das Programm-Team darf abweichen. In Zeitpunkten gerechnet (R5: derselbe Schlüssel für beide Arten).
  if partner_window_binds(p_stage_id) then
    select * into v_win from partner_booth_window(p_stage_id, v_day.id);
    if slot_outside_window(p_start, p_end, v_day.day_date, v_win.von, v_win.bis, v_tz) then
      raise exception 'outside_partner_window' using errcode = 'P0001',
        detail = coalesce(to_char(v_win.von, 'HH24:MI'), '') || '–' || coalesce(to_char(v_win.bis, 'HH24:MI'), '');
    end if;
  end if;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, source_ref, created_by, updated_by)
    values (p_stage_id, v_day.id, p_start, p_end, p_slot_type, p_source_ref, current_person_id(), current_person_id())
    returning id into v_id;
  if p_session_id is not null then
    update session set slot_id = v_id
      where id = p_session_id and slot_id is null and event_id = v_stage.event_id;
    if not found then
      raise exception 'session not attachable (already placed or other event)' using errcode = '22023';
    end if;
  end if;
  insert into slot_history (slot_id, changed_by, action, after)
    values (v_id, current_person_id(), 'create',
            jsonb_build_object('stage_id', p_stage_id, 'start_at', p_start, 'end_at', p_end, 'session_id', p_session_id));
  perform log_audit('slot.create', 'slot', v_id::text, null,
                    jsonb_build_object('stage_id', p_stage_id, 'start_at', p_start, 'end_at', p_end));
  return v_id;
end $$;
