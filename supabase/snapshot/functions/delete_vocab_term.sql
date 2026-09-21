create or replace function delete_vocab_term(p_vocabulary text, p_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_before jsonb; v_usage integer; v_kinder integer;
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  select to_jsonb(t) into v_before from vocab_term t
   where t.vocabulary = p_vocabulary and t.key = p_key;
  if v_before is null then
    raise exception 'term_not_found' using errcode = 'P0002',
      detail = coalesce(p_vocabulary, '?') || ':' || coalesce(p_key, '?');
  end if;

  select count(*)::integer into v_kinder from vocab_term k
   where k.parent_vocabulary = p_vocabulary and k.parent_key = p_key;
  if v_kinder > 0 then
    raise exception 'has_children' using errcode = 'P0001', detail = v_kinder::text;
  end if;

  v_usage := vocab_term_usage(p_vocabulary, p_key);
  if v_usage is null then
    raise exception 'usage_unknown' using errcode = 'P0001', detail = p_vocabulary;
  end if;
  if v_usage > 0 then
    raise exception 'in_use' using errcode = 'P0001', detail = v_usage::text;
  end if;

  delete from vocab_term where vocabulary = p_vocabulary and key = p_key;
  perform log_audit('vocab.delete', 'vocab_term', p_vocabulary || ':' || p_key, v_before, null);
end $$;
