create or replace function kb_article_by_slug(p_slug text, p_audience text, p_language text DEFAULT 'de'::text, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, slug text, title text, body_md text, phase text, roles text[], language text, edition_id uuid, updated_at timestamp with time zone, is_overlay boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  return query select * from kb_articles(p_audience, p_language, p_edition_id) k where k.slug = p_slug;
end $$;
