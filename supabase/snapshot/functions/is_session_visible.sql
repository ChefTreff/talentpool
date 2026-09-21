create or replace function is_session_visible(p_session_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select is_programme_reader()
      or is_speaker_of(p_session_id)
      or exists (select 1 from session se where se.id = p_session_id and se.publish_status = 'published')
$$;
