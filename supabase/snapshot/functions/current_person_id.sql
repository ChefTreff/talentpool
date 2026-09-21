create or replace function current_person_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  select id from person where auth_user_id = auth.uid()
$$;
