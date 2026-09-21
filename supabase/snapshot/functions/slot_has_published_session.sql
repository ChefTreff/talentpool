create or replace function slot_has_published_session(p_slot_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select exists (select 1 from session se where se.slot_id = p_slot_id and se.publish_status = 'published')
$$;
