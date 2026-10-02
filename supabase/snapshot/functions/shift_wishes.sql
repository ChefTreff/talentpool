create or replace function shift_wishes(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(shift_id uuid, person_id uuid, name text, rank integer, area_match boolean, assignment_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not is_volunteer_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_ed := volunteer_edition(p_edition_id);
  return query
    select w.shift_id, w.person_id, trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), w.rank,
           coalesce(s.area = any (v.areas), false),
           (select a.status from shift_assignment a where a.shift_id = w.shift_id and a.person_id = w.person_id)
      from shift_wish w
      join shift s on s.id = w.shift_id
      join person p on p.id = w.person_id and p.deleted_at is null
      join volunteer_profile v on v.person_id = w.person_id and v.edition_id = s.edition_id and v.status = 'accepted'
     where s.edition_id = v_ed
     order by s.start_at, w.rank;
end $$;
