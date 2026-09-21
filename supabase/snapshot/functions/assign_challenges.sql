create or replace function assign_challenges(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid; v_team record; v_ch uuid; v_n integer := 0;
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_ed := hack_edition(p_edition_id);
  for v_team in
    select t.id from hack_team t
     where t.edition_id = v_ed and t.challenge_id is null and t.status <> 'withdrawn'
     order by t.created_at
  loop
    select c.id into v_ch from hack_challenge c
     where c.edition_id = v_ed and c.status = 'published'
     order by (select count(*) from hack_team x where x.challenge_id = c.id and x.status <> 'withdrawn'),
              c.sort_order, c.id
     limit 1;
    exit when v_ch is null;
    update hack_team set challenge_id = v_ch, updated_at = now() where id = v_team.id;
    v_n := v_n + 1;
  end loop;
  perform log_audit('hack.challenges_assigned', 'event', v_ed::text, null, jsonb_build_object('teams', v_n));
  return v_n;
end $$;
