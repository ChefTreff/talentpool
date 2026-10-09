create or replace function shuttle_locked(p_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(shuttle_lock_at(p_profile_id) <= now(), false)
$$;
