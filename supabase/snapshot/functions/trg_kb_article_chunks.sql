create or replace function trg_kb_article_chunks()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  perform kb_rebuild_chunks(new.id);
  return new;
end $$;
