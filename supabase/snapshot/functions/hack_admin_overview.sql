create or replace function hack_admin_overview(p_edition_id uuid DEFAULT NULL::uuid, p_language text DEFAULT 'en'::text)
 RETURNS TABLE(team_id uuid, team_name text, status text, members integer, captain text, challenge_id uuid, challenge_title text, submitted_at timestamp with time zone, scores integer, avg_total numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select t.id, t.name, t.status,
           (select count(*)::integer from hack_team_member m where m.team_id = t.id),
           (select nullif(btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), '')
              from hack_team_member m join person p on p.id = m.person_id
             where m.team_id = t.id and m.is_captain limit 1),
           t.challenge_id, hack_text(c.title_de, c.title_en, p_language),
           s.submitted_at,
           (select count(*)::integer from hack_judging_score j where j.team_id = t.id),
           (select round(avg(j.total), 2) from hack_judging_score j where j.team_id = t.id)
      from hack_team t
      left join hack_challenge c on c.id = t.challenge_id
      left join hack_submission s on s.team_id = t.id
     where t.edition_id = hack_edition(p_edition_id) and t.status <> 'withdrawn'
     order by t.name;
end $$;
