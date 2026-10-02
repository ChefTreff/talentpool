create or replace function volunteers_without_safety_ack(p_edition_id uuid DEFAULT NULL::uuid)
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
     where v.edition_id = v_ed and v.status = 'accepted' and v.safety_ack_at is null
     order by p.last_name, p.first_name;
end $$;
