create or replace function publish_kb_article(p_id uuid, p_published boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_audience text[];
begin
  select a.audience into v_audience from kb_article a where a.id = p_id;
  if v_audience is null then raise exception 'article_not_found' using errcode = 'P0002'; end if;
  if not can_edit_kb_all(v_audience) then raise exception 'not allowed' using errcode = '42501'; end if;
  update kb_article
     set status = case when p_published then 'published' else 'draft' end,
         published_at = case when p_published then now() else null end,
         updated_by = current_person_id(), updated_at = now()
   where id = p_id;
  perform log_audit(case when p_published then 'kb.published' else 'kb.unpublished' end,
                    'kb_article', p_id::text, null, null);
end $$;
