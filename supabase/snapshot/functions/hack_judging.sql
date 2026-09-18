create or replace function hack_judging(p_edition_id uuid DEFAULT NULL::uuid, p_language text DEFAULT 'en'::text)
 RETURNS TABLE(team_id uuid, team_name text, challenge_title text, criteria jsonb, submission_url text, repo_url text, notes text, submitted_at timestamp with time zone, my_criteria jsonb, my_total numeric, my_note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_hack_judge() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select t.id, t.name, hack_text(c.title_de, c.title_en, p_language), coalesce(c.criteria, '[]'::jsonb),
           s.url, s.repo_url, s.notes, s.submitted_at,
           j.criteria, j.total, j.note
      from hack_team t
      left join hack_challenge c on c.id = t.challenge_id
      left join hack_submission s on s.team_id = t.id
      left join hack_judging_score j on j.team_id = t.id and j.judge_id = current_person_id()
     where t.edition_id = hack_edition(p_edition_id) and t.status <> 'withdrawn'
       -- Partner-Jury: nur die Teams der eigenen Challenge.
       and can_judge_hack_team(t.id)
     order by t.name;
end $$;
