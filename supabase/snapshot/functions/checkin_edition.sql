create or replace function checkin_edition()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select r.edition_id
    from role_assignment r
    join event e on e.id = r.edition_id and e.is_edition
   where r.person_id = current_person_id()
     and r.role = 'checkin_operator'
     and r.scope_type = 'edition'
     and r.valid_from <= now()
     and (r.valid_to is null or r.valid_to > now())
   order by (current_date between e.start_date and e.end_date) desc, e.start_date desc
   limit 1
$$;
