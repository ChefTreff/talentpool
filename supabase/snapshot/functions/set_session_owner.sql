create or replace function set_session_owner(p_session_id uuid, p_person_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_se session%rowtype;
begin
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  if not coalesce(is_programme_editor(v_se.event_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_person_id is not null
     and not exists (select 1 from event_stage_leads(v_se.event_id) l where l.person_id = p_person_id) then
    raise exception 'owner_not_lead' using errcode = '22023';
  end if;
  -- Nichts geändert, nichts zu protokollieren.
  if v_se.owner_person_id is not distinct from p_person_id then return p_person_id; end if;
  update session set owner_person_id = p_person_id where id = p_session_id;
  perform log_audit('session.owner', 'session', p_session_id::text,
                    jsonb_build_object('owner_person_id', v_se.owner_person_id),
                    jsonb_build_object('owner_person_id', p_person_id));
  return p_person_id;
end $$;
