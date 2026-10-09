create or replace function shuttle_lock_text(p_profile_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(
           to_char(shuttle_lock_at(p_profile_id) at time zone coalesce((select e.timezone from speaker_profile sp join event e on e.id = sp.edition_id
                                                                          where sp.id = p_profile_id), 'Europe/Berlin'), 'YYYY-MM-DD HH24:MI'),
           'null')
$$;
