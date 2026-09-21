create or replace function catering_notes(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(audience text, diet text, note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not (is_production_team() or is_staff()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by (current_date between e.start_date and e.end_date) desc,
                                           e.start_date desc limit 1))
    into v_ed;
  return query
    select c.audience, coalesce(p.diet, 'keine_angabe'), p.diet_note
      from catering_people(v_ed) c join person p on p.id = c.person_id
     where nullif(btrim(coalesce(p.diet_note, '')), '') is not null
     order by c.audience, p.diet_note;
end $$;
