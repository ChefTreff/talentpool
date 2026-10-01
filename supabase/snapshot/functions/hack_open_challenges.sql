create or replace function hack_open_challenges(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(deliverable_id uuid, org_name text, title text, submitted_at timestamp with time zone, track text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid := hack_edition(p_edition_id);
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select d.id, coalesce(o.communication_name, o.legal_name),
           coalesce(nullif(d.answers->>'title_en', ''), nullif(d.answers->>'title_de', '')),
           d.submitted_at,
           hack_track_key(d.answers->>'track')
      from deliverable d
      join deliverable_template tp on tp.id = d.template_id and tp.key = 'hackathon_challenge'
      join org_edition oe on oe.id = d.org_edition_id and oe.edition_id = v_ed
      join organization o on o.id = oe.org_id
     where d.status = 'submitted'
     order by d.submitted_at nulls last;
end $$;
