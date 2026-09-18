create or replace function is_suppressed(p_email text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select exists (select 1 from suppression where email_hash = email_hash(p_email))
$$;
