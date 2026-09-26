create or replace function portal_links_for(p_keys text[], p_audience text, p_edition_id uuid DEFAULT NULL::uuid)
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
  -- Dieselbe Edition wie bei den Videos: die laufende, sonst die jüngste.
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by (current_date between e.start_date and e.end_date) desc,
                                           e.start_date desc limit 1))
    into v_ed;
  return query
    select distinct on (l.key) l.key, l.title_de, l.title_en, l.url
      from portal_link l
     where l.key = any(p_keys)
       and l.audience && array[p_audience]
       and (l.edition_id = v_ed or l.edition_id is null)
     order by l.key, l.edition_id nulls last;
end $$;
