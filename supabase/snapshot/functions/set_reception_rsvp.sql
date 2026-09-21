create or replace function set_reception_rsvp(p_reception_id uuid, p_status text, p_guests integer DEFAULT 0, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id(); v_profile uuid; v_e speaker_reception%rowtype;
  v_guests integer := coalesce(p_guests, 0); v_belegt integer; v_eigene integer := 0; v_frei integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_status not in ('yes', 'no') then
    raise exception 'invalid_rsvp' using errcode = '22023', detail = coalesce(p_status, 'null');
  end if;
  if v_guests < 0 or v_guests > 3 then
    raise exception 'invalid_rsvp' using errcode = '22023', detail = 'guests:' || v_guests::text;
  end if;

  select * into v_e from speaker_reception where id = p_reception_id;
  if not found or not v_e.published then
    raise exception 'reception_not_found' using errcode = 'P0002';
  end if;

  v_profile := my_speaker_profile_id(v_e.edition_id);
  if v_profile is null
     or not coalesce((select sp.reception_eligible from speaker_profile sp where sp.id = v_profile), false) then
    raise exception 'reception_not_eligible' using errcode = 'P0001', detail = 'not_invited';
  end if;

  if v_e.rsvp_deadline is not null and now() > v_e.rsvp_deadline then
    raise exception 'reception_closed' using errcode = 'P0001',
      detail = to_char(v_e.rsvp_deadline, 'YYYY-MM-DD HH24:MI');
  end if;

  if p_status = 'yes' and v_e.capacity is not null then
    select coalesce(sum(1 + r.guests), 0)::integer into v_eigene
      from speaker_reception_rsvp r
     where r.reception_id = p_reception_id and r.profile_id = v_profile and r.status = 'yes';
    v_belegt := reception_taken(p_reception_id) - v_eigene;
    v_frei := v_e.capacity - v_belegt;
    if 1 + v_guests > v_frei then
      raise exception 'reception_full' using errcode = 'P0001', detail = greatest(v_frei, 0)::text;
    end if;
  end if;

  insert into speaker_reception_rsvp (reception_id, profile_id, status, guests, note, responded_at)
  values (p_reception_id, v_profile, p_status,
          case when p_status = 'yes' then v_guests else 0 end,
          nullif(btrim(p_note), ''), now())
  on conflict (reception_id, profile_id) do update
    set status = excluded.status, guests = excluded.guests,
        note = excluded.note, responded_at = now();

  -- Ins Protokoll gehen Status und Platzzahl, nicht der Freitext: was jemand
  -- als Hinweis schreibt (Unverträglichkeit, Begleitung), ist seine Sache.
  perform log_audit('speaker.reception_rsvp', 'speaker_reception', p_reception_id::text, null,
    jsonb_build_object('profile_id', v_profile, 'status', p_status, 'guests', v_guests));

  return jsonb_build_object('status', p_status, 'guests', v_guests,
                            'taken', reception_taken(p_reception_id));
end $$;
