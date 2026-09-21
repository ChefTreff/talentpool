create or replace function vivenu_editions()
 RETURNS TABLE(edition_id uuid, slug text, name text, vivenu_event_id text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null and not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select e.id, e.slug, e.name, e.vivenu_event_id
      from event e where e.is_edition and e.vivenu_event_id is not null
      order by e.start_date desc nulls last;
end $$;
