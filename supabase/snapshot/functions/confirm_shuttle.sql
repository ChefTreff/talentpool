create or replace function confirm_shuttle(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_b shuttle_booking%rowtype; v_ed uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  -- Erst die Fahrt, dann die Rechte: `is_speaker_team` ist editionsbezogen und
  -- weiss ohne die Buchung nicht, worueber es entscheiden soll.
  select * into v_b from shuttle_booking where id = p_booking_id for update;
  if not found then raise exception 'shuttle_not_found' using errcode = 'P0002'; end if;
  select sp.edition_id into v_ed from speaker_profile sp where sp.id = v_b.profile_id;
  if not is_speaker_team(v_ed) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_b.status <> 'requested' then
    raise exception 'shuttle_not_open' using errcode = 'P0001', detail = v_b.status;
  end if;

  update shuttle_booking
     set status = 'confirmed', confirmed_by = current_person_id(), confirmed_at = now()
   where id = p_booking_id;
  perform log_audit('speaker.shuttle_confirmed', 'shuttle_booking', p_booking_id::text,
    jsonb_build_object('status', v_b.status), jsonb_build_object('status', 'confirmed'));
end $$;
