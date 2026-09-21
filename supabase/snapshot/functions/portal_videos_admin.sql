create or replace function portal_videos_admin()
 RETURNS TABLE(id uuid, key text, title_de text, title_en text, url text, audience text[], edition_id uuid, edition_slug text, sort_order integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select v.id, v.key, v.title_de, v.title_en, v.url, v.audience, v.edition_id, e.slug, v.sort_order
      from portal_video v left join event e on e.id = v.edition_id
     order by v.sort_order, v.key;
end $$;
