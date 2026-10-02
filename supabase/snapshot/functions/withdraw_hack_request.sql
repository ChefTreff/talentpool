create or replace function withdraw_hack_request(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_r hack_join_request;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_r from hack_join_request where id = p_request_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- Zurückziehen darf, wer gefragt hat: die Person (to_team) oder der Kapitän (to_person).
  if not ((v_r.direction = 'to_team' and v_r.person_id = v_me)
          or (v_r.direction = 'to_person' and hack_is_captain(v_r.team_id))) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_r.status <> 'pending' then raise exception 'request_closed' using errcode = 'P0001'; end if;
  update hack_join_request set status = 'withdrawn', decided_by = v_me, decided_at = now() where id = v_r.id;
  perform log_audit('hack.join_withdrawn', 'hack_team', v_r.team_id::text, null, jsonb_build_object('request_id', v_r.id));
end $$;
