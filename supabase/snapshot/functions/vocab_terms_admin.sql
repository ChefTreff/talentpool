create or replace function vocab_terms_admin(p_vocabulary text DEFAULT NULL::text)
 RETURNS TABLE(vocabulary text, key text, label_de text, label_en text, sort_order integer, active boolean, parent_vocabulary text, parent_key text, usage integer, kinder integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select t.vocabulary, t.key, t.label_de, t.label_en, t.sort_order, t.active,
           t.parent_vocabulary, t.parent_key,
           vocab_term_usage(t.vocabulary, t.key),
           (select count(*)::integer from vocab_term k
             where k.parent_vocabulary = t.vocabulary and k.parent_key = t.key)
      from vocab_term t
     where p_vocabulary is null or t.vocabulary = p_vocabulary
     order by t.vocabulary, t.sort_order, t.key;
end $$;
