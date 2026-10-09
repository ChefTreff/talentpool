create or replace function shuttle_lock_at(p_profile_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select d.due_at
    from speaker_profile sp
    join deadline d on d.edition_id = sp.edition_id and d.key = 'shuttle_lock_from'
   where sp.id = p_profile_id
$$;
