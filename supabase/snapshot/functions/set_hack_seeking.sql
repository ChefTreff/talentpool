create or replace function set_hack_seeking(p_seeking boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_ed uuid := hack_edition(null); v_app uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select id into v_app from hack_application where person_id = v_me and edition_id = v_ed and status = 'accepted';
  if v_app is null then raise exception 'not_participant' using errcode = '42501'; end if;
  if coalesce(p_seeking, false) and my_hack_team_id(v_ed) is not null then
    raise exception 'already_in_team' using errcode = 'P0001';
  end if;
  update hack_application set seeking_team = coalesce(p_seeking, false) where id = v_app;
  perform log_audit('hack.seeking', 'hack_application', v_app::text, null, jsonb_build_object('seeking', coalesce(p_seeking, false)));
end $$;
