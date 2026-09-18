create or replace function join_hack_team(p_code text, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_ed uuid; v_team hack_team; v_n integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := hack_edition(p_edition_id);
  if my_hack_team_id(v_ed) is not null then raise exception 'already_in_team' using errcode = 'P0001'; end if;

  select * into v_team from hack_team
   where edition_id = v_ed and upper(btrim(join_code)) = upper(btrim(p_code)) and status <> 'withdrawn';
  if not found then raise exception 'team_not_found' using errcode = 'P0002'; end if;

  select count(*) into v_n from hack_team_member where team_id = v_team.id;
  -- Maximum 8 (E5). Die Untergrenze gilt erst bei der Bestätigung — ein Team
  -- muss ja klein anfangen dürfen.
  if v_n >= 8 then raise exception 'team_full' using errcode = 'P0001', detail = '8'; end if;

  insert into hack_team_member (team_id, person_id, edition_id) values (v_team.id, v_me, v_ed);
  update hack_application set team_id = v_team.id where person_id = v_me and edition_id = v_ed;
  perform log_audit('hack.team_joined', 'hack_team', v_team.id::text, null, null);
  return v_team.id;
end $$;
