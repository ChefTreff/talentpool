create or replace function assign_shift(p_shift_id uuid, p_person_id uuid, p_status text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_s shift; v_free integer; v_status text; v_id uuid; v_other record; v_locale text;
begin
  if not is_volunteer_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_s from shift where id = p_shift_id for update;
  if not found then raise exception 'shift_not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from person p where p.id = p_person_id and p.deleted_at is null) then
    raise exception 'person_not_found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from volunteer_profile v where v.person_id = p_person_id and v.edition_id = v_s.edition_id and v.status = 'accepted') then
    raise exception 'not_accepted' using errcode = 'P0001', detail = p_person_id::text;
  end if;
  if p_status is not null and p_status not in ('assigned', 'waitlisted') then
    raise exception 'invalid_status' using errcode = '22023', detail = p_status;
  end if;

  select s2.id, s2.area, s2.position into v_other
    from shift_assignment a join shift s2 on s2.id = a.shift_id
   where a.person_id = p_person_id and a.shift_id <> p_shift_id and a.status in ('assigned', 'confirmed')
     and tstzrange(s2.start_at, s2.end_at) && tstzrange(v_s.start_at, v_s.end_at)
   limit 1;
  if v_other.id is not null then
    raise exception 'shift_overlap' using errcode = 'P0001', detail = v_other.area || ' / ' || v_other.position;
  end if;

  v_free := v_s.capacity + v_s.overbook - shift_taken(p_shift_id);
  if p_status = 'assigned' and v_free <= 0 then
    raise exception 'shift_full' using errcode = 'P0001', detail = shift_taken(p_shift_id)::text || '/' || (v_s.capacity + v_s.overbook)::text;
  end if;
  v_status := coalesce(p_status, case when v_free > 0 then 'assigned' else 'waitlisted' end);

  insert into shift_assignment (shift_id, person_id, status, assigned_by)
  values (p_shift_id, p_person_id, v_status, current_person_id())
  on conflict (shift_id, person_id) do update
    set status = v_status, declined_at = null, decline_reason = null,
        confirmed_at = case when v_status = 'assigned' then null else shift_assignment.confirmed_at end
  returning id into v_id;

  if v_status = 'assigned' then
    select coalesce(p.preferred_language, 'de') into v_locale from person p where p.id = p_person_id;
    perform queue_mail('shift_assigned', p_person_id,
                       jsonb_build_object('area', v_s.area, 'position', v_s.position,
                                          'start_at', mail_fmt_ts(v_s.start_at, coalesce((select e.timezone from event e where e.id = v_s.edition_id), 'Europe/Berlin'), v_locale),
                                          'location', coalesce(v_s.location, '')),
                       'shift_assignment', v_id);
  end if;
  perform log_audit('volunteer.assign_shift', 'shift_assignment', v_id::text, null,
                    jsonb_build_object('shift_id', p_shift_id, 'person_id', p_person_id, 'status', v_status));
  return v_id;
end $$;
