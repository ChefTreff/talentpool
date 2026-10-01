create or replace function award_current_edition()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select e.id from event e where e.is_edition order by e.start_date desc limit 1
$$;
