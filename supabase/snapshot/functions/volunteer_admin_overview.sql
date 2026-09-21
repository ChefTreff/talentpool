create or replace function volunteer_admin_overview(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(profile_id uuid, person_id uuid, display_name text, email text, status text, shirt_size text, areas text[], day_prefs uuid[], availability jsonb, buddy_note text, notes_internal text, applied_at timestamp with time zone, decided_at timestamp with time zone, shifts_assigned integer, shifts_confirmed integer, birthdate date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not is_volunteer_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_ed := volunteer_edition(p_edition_id);
  return query
    select v.id, v.person_id, trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), pe.email::text,
           v.status, v.shirt_size, v.areas, v.day_prefs, v.availability, v.buddy_note, v.notes_internal, v.applied_at, v.decided_at,
           (select count(*)::integer from shift_assignment a where a.person_id = v.person_id and a.status = 'assigned'),
           (select count(*)::integer from shift_assignment a where a.person_id = v.person_id and a.status = 'confirmed'),
           p.birthdate
      from volunteer_profile v join person p on p.id = v.person_id
      left join person_email pe on pe.person_id = p.id and pe.is_primary
     where v.edition_id = v_ed
     order by v.applied_at;
end $$;
