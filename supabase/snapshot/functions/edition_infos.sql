create or replace function edition_infos(p_audience text, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(key text, label_de text, label_en text, value_de text, value_en text, sort_order integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not (my_kb_audiences() && array[p_audience]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by (current_date between e.start_date and e.end_date) desc,
                                           e.start_date desc limit 1))
    into v_ed;
  return query
    select i.key, i.label_de, i.label_en, i.value_de, i.value_en, i.sort_order
      from edition_info i
     where i.edition_id = v_ed and i.audience && array[p_audience]
     order by i.sort_order, i.key;
end $$;
