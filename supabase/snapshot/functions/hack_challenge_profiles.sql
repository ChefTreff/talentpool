create or replace function hack_challenge_profiles(p_edition_id uuid DEFAULT NULL::uuid, p_language text DEFAULT 'en'::text)
 RETURNS TABLE(challenge_id uuid, title text, org_name text, study_fields text[], skills text[], profile text, can_edit boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select c.id, hack_text(c.title_de, c.title_en, p_language), coalesce(o.communication_name, o.legal_name),
           c.target_study_fields, c.target_skills, c.target_profile,
           (is_hack_team() or (c.org_id is not null and partner_can_edit(c.org_id)))
      from hack_challenge c
      left join organization o on o.id = c.org_id
     where c.edition_id = hack_edition(p_edition_id) and c.status = 'published'
     order by c.sort_order, hack_text(c.title_de, c.title_en, p_language);
end $$;
