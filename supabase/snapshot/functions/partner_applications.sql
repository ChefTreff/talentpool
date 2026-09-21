create or replace function partner_applications(p_session_id uuid)
 RETURNS TABLE(id uuid, person_id uuid, display_name text, status text, rank integer, answers jsonb, consent_share boolean, confirm_by timestamp with time zone, confirmed_at timestamp with time zone, decided_at timestamp with time zone, created_at timestamp with time zone, profile jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_org uuid; v_n integer;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not can_decide_session(p_session_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  select se.host_org_id into v_org from session se where se.id = p_session_id;
  select count(*) into v_n from application a where a.session_id = p_session_id;
  perform log_audit('application.partner_view', 'session', p_session_id::text, null,
                    jsonb_build_object('org_id', v_org, 'rows', v_n, 'team', is_application_team(p_session_id)));
  return query select * from applications_for_session(p_session_id);
end $$;
