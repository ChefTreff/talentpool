create or replace function hack_join_code()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                           (floor(random() * 32) + 1)::integer, 1), '')
    from generate_series(1, 6)
$$;
