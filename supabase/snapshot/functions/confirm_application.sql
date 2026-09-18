create or replace function confirm_application(p_application_id uuid, p_replace_conflicting boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_pid   uuid := current_person_id();
  v_a     application%rowtype;
  v_s     session%rowtype;
  v_slot  slot%rowtype;
  v_conf  uuid[];
begin
  select * into v_a from application where id = p_application_id and person_id = v_pid for update;
  if not found then
    raise exception 'application_not_found' using errcode = 'P0002';
  end if;
  if v_a.status not in ('accepted','promoted') then
    raise exception 'not_confirmable' using errcode = 'P0001', detail = v_a.status;
  end if;
  if not decisions_released(v_a.session_id) then
    raise exception 'not_released' using errcode = 'P0001';
  end if;
  if v_a.confirm_by is not null and v_a.confirm_by < now() then
    update application set status = 'expired' where id = p_application_id;
    raise exception 'confirm_deadline_passed' using errcode = 'P0001';
  end if;
  select * into v_s from session where id = v_a.session_id;
  if v_s.ticket_required and not exists (
      select 1 from ticket t where t.event_id = v_s.event_id and t.person_id = v_pid and t.status = 'valid') then
    raise exception 'ticket_required' using errcode = 'P0001';
  end if;
  if v_s.slot_id is not null then
    select * into v_slot from slot where id = v_s.slot_id;
    select array_agg(o.id) into v_conf
    from application o
    join session so on so.id = o.session_id
    join slot sl on sl.id = so.slot_id
    where o.person_id = v_pid and o.status = 'confirmed' and o.id <> p_application_id
      and tstzrange(sl.start_at, sl.end_at, '[)') && tstzrange(v_slot.start_at, v_slot.end_at, '[)');
    if v_conf is not null then
      if not p_replace_conflicting then
        raise exception 'collision' using errcode = 'P0001', detail = array_to_string(v_conf, ',');
      end if;
      update application set status = 'withdrawn' where id = any(v_conf);
    end if;
  end if;
  update application set status = 'confirmed', confirmed_at = now() where id = p_application_id;
  return jsonb_build_object('ok', true, 'replaced', coalesce(to_jsonb(v_conf), '[]'::jsonb));
end $$;
