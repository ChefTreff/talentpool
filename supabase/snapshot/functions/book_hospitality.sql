create or replace function book_hospitality(p_quota_id uuid, p_details jsonb DEFAULT '{}'::jsonb, p_guests integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id(); v_q hospitality_quota%rowtype; v_sp speaker_profile%rowtype; v_reason text; v_status text; v_id uuid; v_need integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_q from hospitality_quota where id = p_quota_id for update;
  if not found or not v_q.active then raise exception 'quota_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = my_speaker_profile_id(v_q.edition_id) for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  v_reason := hospitality_block_reason(v_sp.id);
  if v_reason is not null then raise exception 'not_eligible' using errcode = 'P0001', detail = v_reason; end if;
  if v_q.kind = 'hotel' and hotel_tier_rank(v_q.tier) > hotel_tier_rank(v_sp.hotel_tier) then
    raise exception 'not allowed' using errcode = '42501', detail = 'hotel_tier';
  end if;
  if p_guests is null or p_guests < 1 or p_guests > 4 then raise exception 'invalid_guests' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_details, '{}'::jsonb)) <> 'object' then raise exception 'invalid_details' using errcode = '22023'; end if;
  if exists (select 1 from hospitality_booking b where b.profile_id = v_sp.id and b.status <> 'cancelled'
              and ((v_q.kind = 'hotel' and b.kind = 'hotel') or (v_q.kind = 'shuttle' and b.quota_id = v_q.id))) then
    raise exception 'already_booked' using errcode = 'P0001';
  end if;
  v_need := case when v_q.kind = 'hotel' then 1 else p_guests end;
  v_status := case when hospitality_used(v_q.id) + v_need <= v_q.capacity then 'requested' else 'waitlisted' end;
  insert into hospitality_booking (quota_id, profile_id, kind, status, guests, details, created_by)
  values (v_q.id, v_sp.id, v_q.kind, v_status, p_guests, coalesce(p_details, '{}'::jsonb), v_me)
  returning id into v_id;
  if v_sp.hospitality_status = 'eligible' then
    update speaker_profile set hospitality_status = 'requested' where id = v_sp.id;
  end if;
  perform log_audit('hospitality.book', 'hospitality_booking', v_id::text, null,
    jsonb_build_object('quota_id', v_q.id, 'kind', v_q.kind, 'status', v_status, 'guests', p_guests, 'profile_id', v_sp.id));
  return jsonb_build_object('id', v_id, 'status', v_status);
end $$;
