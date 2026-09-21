create or replace function sponsoring_level_key(p_level text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select nullif(btrim(regexp_replace(lower(btrim(coalesce(p_level, ''))), '[^a-z0-9]+', '_', 'g'), '_'), '')
$$;
