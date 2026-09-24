create or replace function next_up_items_admin()
 RETURNS TABLE(id uuid, word_de text, word_en text, title_de text, title_en text, teaser_de text, teaser_en text, link_url text, starts_at timestamp with time zone, visible_from timestamp with time zone, visible_until timestamp with time zone, sort_order integer, active boolean, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not can_edit_next_up() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select n.id, n.word_de, n.word_en, n.title_de, n.title_en, n.teaser_de, n.teaser_en,
           n.link_url, n.starts_at, n.visible_from, n.visible_until, n.sort_order, n.active,
           n.updated_at
      from next_up_item n
     order by n.active desc, n.sort_order, n.starts_at nulls last, n.created_at;
end $$;
