create or replace function my_hack_requests(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(request_id uuid, direction text, status text, team_id uuid, team_name text, person_first_name text, message text, created_at timestamp with time zone, mine_to_answer boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_ed uuid := hack_edition(p_edition_id); v_team uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_team := my_hack_team_id(v_ed);
  return query
    select r.id, r.direction, r.status, t.id, t.name, p.first_name, r.message, r.created_at,
           (r.status = 'pending' and ((r.direction = 'to_person' and r.person_id = v_me)
                                      or (r.direction = 'to_team' and hack_is_captain(r.team_id))))
      from hack_join_request r
      join hack_team t on t.id = r.team_id
      join person p on p.id = r.person_id
     where r.edition_id = v_ed
       and (r.person_id = v_me or (v_team is not null and r.team_id = v_team))
     order by (r.status = 'pending') desc, r.created_at desc;
end $$;
