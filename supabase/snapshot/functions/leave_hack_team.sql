create or replace function leave_hack_team(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_team uuid; v_rest integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_team := my_hack_team_id(p_edition_id);
  if v_team is null then raise exception 'team_not_found' using errcode = 'P0002'; end if;
  delete from hack_team_member where team_id = v_team and person_id = v_me;
  update hack_application set team_id = null where person_id = v_me and team_id = v_team;

  -- Das letzte Mitglied nimmt das Team mit: ein leeres Team ist kein Team.
  select count(*) into v_rest from hack_team_member where team_id = v_team;
  if v_rest = 0 then
    update hack_team set status = 'withdrawn', updated_at = now() where id = v_team;
  else
    -- Ohne Kapitän wird das älteste Mitglied Kapitän.
    if not exists (select 1 from hack_team_member where team_id = v_team and is_captain) then
      update hack_team_member set is_captain = true
       where id = (select id from hack_team_member where team_id = v_team order by joined_at limit 1);
    end if;
  end if;
  perform log_audit('hack.team_left', 'hack_team', v_team::text, null, null);
end $$;
