create or replace function is_programme_reader()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select is_staff() or has_role('speaker_manager') or has_role('standbuehne_editor')
$$;
