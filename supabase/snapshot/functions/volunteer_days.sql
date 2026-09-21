create or replace function volunteer_days(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, event_id uuid, day_date date, label_de text, label_en text, sort_order integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := volunteer_edition(p_edition_id);
  return query
    select d.id, d.event_id, d.day_date, d.label_de, d.label_en, d.sort_order
      from event_day d join event e on e.id = d.event_id
     where e.id = v_ed or e.edition_id = v_ed
     order by d.day_date, d.sort_order;
end $$;
