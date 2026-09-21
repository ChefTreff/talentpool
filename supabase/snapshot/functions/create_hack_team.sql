create or replace function create_hack_team(p_name text, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_ed uuid; v_id uuid; v_code text; v_try integer := 0;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := hack_edition(p_edition_id);
  if nullif(btrim(p_name), '') is null then
    raise exception 'invalid_name' using errcode = '22023', detail = 'Teamname fehlt';
  end if;
  if my_hack_team_id(v_ed) is not null then
    raise exception 'already_in_team' using errcode = 'P0001';
  end if;

  loop
    v_code := hack_join_code();
    exit when not exists (select 1 from hack_team t where t.edition_id = v_ed and t.join_code = v_code);
    v_try := v_try + 1;
    if v_try > 20 then raise exception 'join_code_exhausted' using errcode = 'P0001'; end if;
  end loop;

  insert into hack_team (edition_id, name, join_code, created_by)
  values (v_ed, btrim(p_name), v_code, v_me) returning id into v_id;
  insert into hack_team_member (team_id, person_id, edition_id, is_captain) values (v_id, v_me, v_ed, true);
  perform log_audit('hack.team_created', 'hack_team', v_id::text, null, jsonb_build_object('name', p_name));
  return v_id;
end $$;
