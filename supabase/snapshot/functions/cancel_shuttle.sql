create or replace function cancel_shuttle(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_b shuttle_booking%rowtype;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_b from shuttle_booking where id = p_booking_id for update;
  if not found then raise exception 'shuttle_not_found' using errcode = 'P0002'; end if;
  if not coalesce(can_request_shuttle(v_b.profile_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_b.status = 'cancelled' then return; end if;

  update shuttle_booking set status = 'cancelled', cancelled_at = now() where id = p_booking_id;
  perform log_audit('speaker.shuttle_cancelled', 'shuttle_booking', p_booking_id::text,
    jsonb_build_object('status', v_b.status), jsonb_build_object('status', 'cancelled'));
end $$;
