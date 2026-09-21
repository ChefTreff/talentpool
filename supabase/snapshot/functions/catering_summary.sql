create or replace function catering_summary(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(audience text, diet text, anzahl integer)
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
    select c.audience, coalesce(p.diet, 'keine_angabe'), count(*)::integer
      from catering_people(v_ed) c join person p on p.id = c.person_id
     group by c.audience, coalesce(p.diet, 'keine_angabe')
     order by c.audience, coalesce(p.diet, 'keine_angabe');
end $$;
