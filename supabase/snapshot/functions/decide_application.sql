create or replace function decide_application(p_application_id uuid, p_status text, p_rank integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_a application%rowtype;
begin
  select * into v_a from application where id = p_application_id for update;
  if not found then
    raise exception 'application_not_found' using errcode = 'P0002';
  end if;
  if not can_decide_session(v_a.session_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_status not in ('shortlisted','accepted','waitlisted','declined') then
    raise exception 'invalid_decision' using errcode = '22023', detail = p_status;
  end if;
  if v_a.status in ('confirmed','attended','no_show','withdrawn') then
    raise exception 'not_decidable' using errcode = 'P0001', detail = v_a.status;
  end if;
  update application
     set status = p_status, rank = coalesce(p_rank, rank),
         decided_by = current_person_id(), decided_at = now(),
         confirm_by = case when p_status = 'accepted' and decisions_released(v_a.session_id)
                           then now() + make_interval(hours => (select confirm_by_hours from session where id = v_a.session_id))
                           else null end
   where id = p_application_id;
  perform log_audit('application.decide', 'application', p_application_id::text,
                    jsonb_build_object('status', v_a.status), jsonb_build_object('status', p_status, 'rank', p_rank));
end $$;
