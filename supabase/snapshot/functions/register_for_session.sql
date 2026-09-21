create or replace function register_for_session(p_session_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_pid uuid := current_person_id();
  v_s   session%rowtype;
  v_n   integer;
  v_status text;
begin
  if v_pid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into v_s from session where id = p_session_id for update;
  if not found or v_s.publish_status <> 'published' then
    raise exception 'session_not_open' using errcode = 'P0002';
  end if;
  if v_s.access_mode <> 'registration' then
    raise exception 'session_not_registration' using errcode = '22023';
  end if;
  if v_s.application_deadline is not null and v_s.application_deadline < now() then
    raise exception 'deadline_passed' using errcode = 'P0001';
  end if;
  if v_s.ticket_required and not exists (
      select 1 from ticket t where t.event_id = v_s.event_id and t.person_id = v_pid and t.status = 'valid') then
    raise exception 'ticket_required' using errcode = 'P0001';
  end if;
  select count(*) into v_n from registration where session_id = p_session_id and status = 'confirmed';
  v_status := case when v_s.capacity is null or v_n < v_s.capacity then 'confirmed' else 'waitlisted' end;
  insert into registration (person_id, event_id, session_id, status, source, registered_at)
    values (v_pid, v_s.event_id, p_session_id, v_status, 'portal', now())
  on conflict (person_id, session_id) where session_id is not null do update
    set status = case when registration.status in ('cancelled','declined','no_response') then excluded.status
                      else registration.status end,
        registered_at = case when registration.status in ('cancelled','declined','no_response') then now()
                             else registration.registered_at end;
  return v_status;
end $$;
