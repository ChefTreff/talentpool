create or replace function set_side_event_status(p_side_event_id uuid, p_profile_id uuid, p_status text, p_guests integer DEFAULT NULL::integer, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id(); v_e side_event%rowtype; v_sp speaker_profile%rowtype; v_i side_event_invite%rowtype;
  v_guests integer; v_note text := nullif(btrim(p_note), ''); v_eigene integer := 0; v_frei integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_e from side_event where id = p_side_event_id;
  if not found then raise exception 'side_event_not_found' using errcode = 'P0002'; end if;
  if not is_speaker_team(v_e.edition_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('invited', 'yes', 'no') then
    raise exception 'invalid_side_event' using errcode = '22023', detail = 'status:' || coalesce(p_status, 'null');
  end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'too_long' using errcode = '22023', detail = 'note'; end if;

  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found or v_sp.edition_id <> v_e.edition_id or v_sp.stage_guest or not speaker_is_confirmed(v_sp.pipeline_status) then
    raise exception 'not_eligible' using errcode = 'P0001', detail = 'side_event';
  end if;

  select * into v_i from side_event_invite where side_event_id = p_side_event_id and profile_id = p_profile_id for update;
  v_guests := case when p_status = 'yes' then coalesce(p_guests, case when found then v_i.guests else 0 end) else 0 end;
  if v_guests < 0 or v_guests > 3 then
    raise exception 'invalid_side_event' using errcode = '22023', detail = 'guests:' || v_guests::text;
  end if;

  -- Auch das Team kann nicht mehr Plätze vergeben, als es gibt — erst die Obergrenze ändern.
  if p_status = 'yes' and v_e.capacity is not null then
    if v_i.profile_id is not null and v_i.status = 'yes' then v_eigene := 1 + v_i.guests; end if;
    v_frei := v_e.capacity - (side_event_taken(p_side_event_id) - v_eigene);
    if 1 + v_guests > v_frei then
      raise exception 'side_event_full' using errcode = 'P0001', detail = greatest(v_frei, 0)::text;
    end if;
  end if;

  if v_i.profile_id is null then
    insert into side_event_invite (side_event_id, profile_id, status, guests, note, via, invited_at, invited_by, responded_at)
    values (p_side_event_id, p_profile_id, p_status, v_guests, v_note, 'team', now(), v_me,
            case when p_status = 'invited' then null else now() end);
  else
    -- `p_note` null lässt den Hinweis stehen, ein leerer Text löscht ihn (das Team darf einen Hinweis entfernen, den es nicht braucht).
    update side_event_invite
       set status = p_status, guests = v_guests, note = case when p_note is null then note else v_note end, via = 'team',
           responded_at = case when p_status = 'invited' then null else now() end
     where side_event_id = p_side_event_id and profile_id = p_profile_id;
  end if;

  perform log_audit('side_event.status_set', 'side_event', p_side_event_id::text, null,
    jsonb_build_object('person_id', v_sp.person_id, 'status', p_status, 'guests', v_guests, 'via', 'team'));
  return jsonb_build_object('status', p_status, 'guests', v_guests, 'taken', side_event_taken(p_side_event_id));
end $$;
