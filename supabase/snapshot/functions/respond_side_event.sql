create or replace function respond_side_event(p_side_event_id uuid, p_status text, p_guests integer DEFAULT 0, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id(); v_profile uuid; v_e side_event%rowtype; v_i side_event_invite%rowtype;
  v_guests integer := coalesce(p_guests, 0); v_note text := nullif(btrim(p_note), ''); v_eigene integer := 0; v_frei integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_status not in ('yes', 'no') then
    raise exception 'invalid_side_event' using errcode = '22023', detail = 'status:' || coalesce(p_status, 'null');
  end if;
  if v_guests < 0 or v_guests > 3 then
    raise exception 'invalid_side_event' using errcode = '22023', detail = 'guests:' || v_guests::text;
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'too_long' using errcode = '22023', detail = 'note';
  end if;

  select * into v_e from side_event where id = p_side_event_id;
  if not found or not v_e.published then raise exception 'side_event_not_found' using errcode = 'P0002'; end if;

  v_profile := my_speaker_profile_id(v_e.edition_id);
  if v_profile is null then raise exception 'side_event_not_invited' using errcode = 'P0001', detail = 'not_invited'; end if;
  select * into v_i from side_event_invite where side_event_id = p_side_event_id and profile_id = v_profile for update;
  if not found then raise exception 'side_event_not_invited' using errcode = 'P0001', detail = 'not_invited'; end if;
  -- Eine Zusage ist eine persönliche Entscheidung: nur der Speaker selbst, nicht seine Assistenz oder ein Kontakt mit Zugang.
  if not coalesce((select sp.person_id = v_me from speaker_profile sp where sp.id = v_profile), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_e.starts_at <= now() or (v_e.rsvp_deadline is not null and now() > v_e.rsvp_deadline) then
    raise exception 'side_event_closed' using errcode = 'P0001',
      detail = to_char(least(v_e.starts_at, coalesce(v_e.rsvp_deadline, v_e.starts_at)) at time zone 'Europe/Berlin', 'YYYY-MM-DD HH24:MI');
  end if;

  -- Die Obergrenze zählt Plätze; die eigene bisherige Zusage zählt beim Ändern nicht mit — sonst liesse sich eine Begleitung nie nachtragen.
  if p_status = 'yes' and v_e.capacity is not null then
    if v_i.status = 'yes' then v_eigene := 1 + v_i.guests; end if;
    v_frei := v_e.capacity - (side_event_taken(p_side_event_id) - v_eigene);
    if 1 + v_guests > v_frei then
      raise exception 'side_event_full' using errcode = 'P0001', detail = greatest(v_frei, 0)::text;
    end if;
  end if;

  update side_event_invite
     set status = p_status, guests = case when p_status = 'yes' then v_guests else 0 end,
         note = v_note, responded_at = now(), via = 'portal'
   where side_event_id = p_side_event_id and profile_id = v_profile;

  -- Ins Protokoll gehen Person, Stand und Platzzahl — nie der Freitext: was jemand als Hinweis schreibt, ist seine Sache.
  perform log_audit('side_event.responded', 'side_event', p_side_event_id::text, null,
    jsonb_build_object('person_id', v_me, 'status', p_status, 'guests', case when p_status = 'yes' then v_guests else 0 end, 'via', 'portal'));
  return jsonb_build_object('status', p_status, 'guests', case when p_status = 'yes' then v_guests else 0 end,
                            'taken', side_event_taken(p_side_event_id));
end $$;
