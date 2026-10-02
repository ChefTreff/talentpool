create or replace function attended_event(p_event_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select current_person_id() is not null and (
    exists (select 1 from ticket t where t.event_id = p_event_id and t.person_id = current_person_id()
             and (t.checked_in_at is not null or t.status = 'checked_in'))
    or exists (select 1 from registration r where r.event_id = p_event_id and r.person_id = current_person_id()
                and r.status = 'attended'))
$$;
