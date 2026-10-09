create or replace function delete_slot(p_slot_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_slot   slot%rowtype;
  v_ev     uuid;
  v_se     session%rowtype;
  v_n      integer;
  v_before jsonb;
begin
  if current_person_id() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into v_slot from slot where id = p_slot_id for update;
  if not found then
    raise exception 'slot not found' using errcode = 'P0002';
  end if;
  select st.event_id into v_ev from stage st where st.id = v_slot.stage_id;
  -- Das Programm-Team löscht jede Art; auf einer Partnerbühne löscht, wer den Slot bearbeiten darf — nur Inhalts-Slots (R2: auch die vom
  -- Team angelegten). NULL-sicher: ohne ausdrückliches Ja kein Recht.
  if not coalesce(is_programme_editor(v_ev)
                  or (partner_window_binds(v_slot.stage_id) and can_edit_slot(p_slot_id) and v_slot.slot_type = 'content'), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_se from session where slot_id = p_slot_id;
  if found then
    if v_se.publish_status = 'published' then
      raise exception 'unpublish_first' using errcode = 'P0001';
    end if;
    -- Wer zugesagt hat, hat sich den Termin eingetragen (wie in partner_delete_session).
    select count(*)::integer into v_n from application a
     where a.session_id = v_se.id and a.status in ('accepted', 'confirmed');
    if v_n > 0 then
      raise exception 'slot_locked' using errcode = 'P0001', detail = v_n::text;
    end if;
  end if;
  v_before := jsonb_build_object('stage_id', v_slot.stage_id, 'event_day_id', v_slot.event_day_id,
                                 'start_at', v_slot.start_at, 'end_at', v_slot.end_at,
                                 'slot_type', v_slot.slot_type, 'status', v_slot.status, 'session_id', v_se.id);
  -- Die Session am Slot bleibt und geht zurück ins Backlog (session.slot_id → NULL), der Verlauf (slot_history) geht mit dem Slot.
  delete from slot where id = p_slot_id;
  perform log_audit('slot.delete', 'slot', p_slot_id::text, v_before, null);
end $$;
