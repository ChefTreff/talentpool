create or replace function volunteers_without_wish(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(person_id uuid, name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not is_volunteer_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_ed := volunteer_edition(p_edition_id);
  return query
    select v.person_id, trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
      from volunteer_profile v join person p on p.id = v.person_id and p.deleted_at is null
     where v.edition_id = v_ed and v.status = 'accepted'
       and not exists (select 1 from shift_wish w join shift s on s.id = w.shift_id
                        where w.person_id = v.person_id and s.edition_id = v_ed)
     order by p.last_name, p.first_name;
end $$;
