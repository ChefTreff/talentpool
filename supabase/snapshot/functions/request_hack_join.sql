create or replace function request_hack_join(p_team_id uuid, p_message text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_t hack_team; v_id uuid; v_msg text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_t from hack_team where id = p_team_id and status <> 'withdrawn';
  if not found then raise exception 'team_not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from hack_application a where a.person_id = v_me and a.edition_id = v_t.edition_id and a.status = 'accepted') then
    raise exception 'not_participant' using errcode = '42501';
  end if;
  if my_hack_team_id(v_t.edition_id) is not null then raise exception 'already_in_team' using errcode = 'P0001'; end if;
  if not v_t.looking then raise exception 'team_not_looking' using errcode = 'P0001'; end if;
  if length(v_msg) > 300 then raise exception 'too_long' using errcode = '22023', detail = '300'; end if;
  if exists (select 1 from hack_join_request r where r.team_id = p_team_id and r.person_id = v_me and r.status = 'pending') then
    raise exception 'request_pending' using errcode = 'P0001';
  end if;
  insert into hack_join_request (team_id, person_id, edition_id, direction, message, created_by)
  values (p_team_id, v_me, v_t.edition_id, 'to_team', v_msg, v_me) returning id into v_id;
  perform log_audit('hack.join_requested', 'hack_team', p_team_id::text, null, jsonb_build_object('request_id', v_id));
  return v_id;
end $$;
