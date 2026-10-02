create or replace function invite_hack_person(p_person_id uuid, p_message text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_ed uuid := hack_edition(null); v_team uuid; v_id uuid;
        v_msg text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_team := my_hack_team_id(v_ed);
  if v_team is null then raise exception 'not_my_team' using errcode = 'P0001'; end if;
  if not hack_is_captain(v_team) then raise exception 'not_captain' using errcode = '42501'; end if;
  if not exists (select 1 from hack_application a where a.person_id = p_person_id and a.edition_id = v_ed
                  and a.status = 'accepted' and a.seeking_team)
     or exists (select 1 from hack_team_member m where m.person_id = p_person_id and m.edition_id = v_ed) then
    raise exception 'person_not_seeking' using errcode = 'P0001';
  end if;
  if length(v_msg) > 300 then raise exception 'too_long' using errcode = '22023', detail = '300'; end if;
  if exists (select 1 from hack_join_request r where r.team_id = v_team and r.person_id = p_person_id and r.status = 'pending') then
    raise exception 'request_pending' using errcode = 'P0001';
  end if;
  insert into hack_join_request (team_id, person_id, edition_id, direction, message, created_by)
  values (v_team, p_person_id, v_ed, 'to_person', v_msg, v_me) returning id into v_id;
  perform log_audit('hack.person_invited', 'hack_team', v_team::text, null, jsonb_build_object('request_id', v_id));
  return v_id;
end $$;
