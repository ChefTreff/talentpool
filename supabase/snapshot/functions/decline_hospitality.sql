create or replace function decline_hospitality(p_booking_id uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_b hospitality_booking%rowtype;
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_b from hospitality_booking where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found' using errcode = 'P0002'; end if;
  update hospitality_booking set status = 'cancelled', cancelled_at = now(), team_note = coalesce(nullif(btrim(p_note), ''), team_note) where id = p_booking_id;
  perform log_audit('hospitality.decline', 'hospitality_booking', p_booking_id::text, jsonb_build_object('status', v_b.status), jsonb_build_object('note', p_note));
end $$;
