create or replace function immutable_unaccent(text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
 SET search_path TO 'public', 'extensions'
AS $$ select extensions.unaccent('extensions.unaccent', $1) $$;
