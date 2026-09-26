create or replace function portal_links_admin()
 RETURNS TABLE(id uuid, key text, title_de text, title_en text, url text, audience text[], edition_id uuid, edition_slug text, sort_order integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select l.id, l.key, l.title_de, l.title_en, l.url, l.audience, l.edition_id, e.slug, l.sort_order
      from portal_link l left join event e on e.id = l.edition_id
     order by l.sort_order, l.key;
end $$;
