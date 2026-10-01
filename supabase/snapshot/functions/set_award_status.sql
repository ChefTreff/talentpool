create or replace function set_award_status(p_application_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_alt text;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('initiatives') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('submitted', 'accepted', 'rejected', 'finalist', 'winner') then
    raise exception 'invalid_state' using errcode = '22023', detail = coalesce(p_status, 'null');
  end if;
  select a.status into v_alt from award_application a where a.id = p_application_id for update;
  if not found then raise exception 'application_not_found' using errcode = 'P0002'; end if;
  update award_application set status = p_status, decided_by = current_person_id(), decided_at = now()
   where id = p_application_id;
  perform log_audit('award.status', 'award_application', p_application_id::text,
                    jsonb_build_object('status', v_alt), jsonb_build_object('status', p_status));
end $$;
