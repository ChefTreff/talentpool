create or replace function email_hash(p_email text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select encode(extensions.digest(lower(trim(p_email)), 'sha256'), 'hex')
$$;
