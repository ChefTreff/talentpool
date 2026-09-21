create or replace function hotel_tier_rank(p_tier text)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce((select sort_order from vocab_term where vocabulary = 'hotel_tier' and key = p_tier), 0)
$$;
