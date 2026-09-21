create or replace function portal_video_for(p_key text, p_audience text, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(key text, title_de text, title_en text, url text)
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
    select v.key, v.title_de, v.title_en, v.url
      from portal_video v
     where v.key = p_key
       and v.audience && array[p_audience]
       and (v.edition_id = v_ed or v.edition_id is null)
     order by v.edition_id nulls last
     limit 1;
end $$;
