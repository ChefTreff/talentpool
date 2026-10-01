create or replace function hack_applications_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(application_id uuid, person_id uuid, first_name text, last_name text, status text, skills text[], motivation text, team_pref text, github_url text, website_url text, behance_url text, team_name text, applied_at timestamp with time zone, decided_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid := hack_edition(p_edition_id);
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select a.id, p.id, p.first_name, p.last_name, a.status, a.skills, a.motivation, a.team_pref,
           a.github_url, a.website_url, a.behance_url, t.name, a.applied_at, a.decided_at
      from hack_application a
      join person p on p.id = a.person_id
      left join hack_team_member m on m.person_id = a.person_id
      left join hack_team t on t.id = m.team_id and t.edition_id = a.edition_id
     where a.edition_id = v_ed and p.deleted_at is null
     order by case a.status when 'applied' then 0 when 'accepted' then 1 else 2 end, a.applied_at;
end $$;
