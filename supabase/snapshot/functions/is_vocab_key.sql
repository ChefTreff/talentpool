create or replace function is_vocab_key(p_vocabulary text, p_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select exists (select 1 from vocab_term where vocabulary = p_vocabulary and key = p_key and active)
$$;
