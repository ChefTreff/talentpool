create or replace function hack_track_key(p_value text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select t.key from vocab_term t
   where t.vocabulary = 'hack_track' and t.active
     and lower(btrim(p_value)) in (lower(t.key), lower(t.label_en), lower(t.label_de))
   order by t.sort_order limit 1
$$;
