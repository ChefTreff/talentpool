create or replace function hack_team_search(p_edition_id uuid DEFAULT NULL::uuid, p_language text DEFAULT 'en'::text)
 RETURNS TABLE(team_id uuid, team_name text, challenge_title text, track text, members integer, free_slots integer, looking_skills text[], looking_note text, my_request text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid := hack_edition(p_edition_id); v_me uuid := current_person_id();
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not hack_is_participant(v_ed) then raise exception 'not_participant' using errcode = '42501'; end if;
  return query
    select t.id, t.name, hack_text(c.title_de, c.title_en, p_language), c.track,
           x.n, 8 - x.n, t.looking_skills, t.looking_note,
           (select r.direction from hack_join_request r
             where r.team_id = t.id and r.person_id = v_me and r.status = 'pending' limit 1)
      from hack_team t
      left join hack_challenge c on c.id = t.challenge_id
      cross join lateral (select count(*)::integer as n from hack_team_member m where m.team_id = t.id) x
     where t.edition_id = v_ed and t.status <> 'withdrawn' and t.looking and x.n < 8
     order by t.name;
end $$;
