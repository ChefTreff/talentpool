create or replace function cancel_hospitality(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_b hospitality_booking%rowtype; v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_next uuid;
begin
  select * into v_b from hospitality_booking where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_b.profile_id;
  if not coalesce((v_sp.person_id = v_me or v_sp.assistant_person_id = v_me or can_manage_speaker(v_sp.id) or is_staff()), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_b.status = 'cancelled' then return; end if;
  update hospitality_booking set status = 'cancelled', cancelled_at = now() where id = p_booking_id;
  if v_b.status in ('requested', 'confirmed') then
    select id into v_next from hospitality_booking where quota_id = v_b.quota_id and status = 'waitlisted' order by created_at limit 1;
    if v_next is not null then update hospitality_booking set status = 'requested' where id = v_next; end if;
  end if;
  if not exists (select 1 from hospitality_booking b where b.profile_id = v_sp.id and b.status <> 'cancelled') and v_sp.hospitality_status in ('requested', 'booked') then
    update speaker_profile set hospitality_status = 'eligible' where id = v_sp.id;
  end if;
  perform log_audit('hospitality.cancel', 'hospitality_booking', p_booking_id::text, jsonb_build_object('status', v_b.status), jsonb_build_object('promoted', v_next));
end $$;
