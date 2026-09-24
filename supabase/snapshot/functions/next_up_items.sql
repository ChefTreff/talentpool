create or replace function next_up_items()
 RETURNS TABLE(id uuid, word_de text, word_en text, title_de text, title_en text, teaser_de text, teaser_en text, link_url text, starts_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select n.id, n.word_de, n.word_en, n.title_de, n.title_en, n.teaser_de, n.teaser_en,
           n.link_url, n.starts_at
      from next_up_item n
     where n.active
       and (n.visible_from is null or n.visible_from <= now())
       and (n.visible_until is null or n.visible_until > now())
     order by n.sort_order, n.starts_at nulls last, n.created_at;
end $$;
