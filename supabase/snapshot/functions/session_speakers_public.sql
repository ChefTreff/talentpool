create or replace function session_speakers_public(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select case when is_session_visible(p_session_id) then coalesce((
    select jsonb_agg(jsonb_build_object(
             'person_id', ss.person_id,
             'role', ss.role,
             'first_name', p.first_name,
             'last_name', p.last_name,
             'employer_name', p.employer_name,
             'confirmed', ss.confirmed)
           order by ss.sort_order, p.last_name)
    from session_speaker ss
    join person p on p.id = ss.person_id
    where ss.session_id = p_session_id), '[]'::jsonb)
  else '[]'::jsonb end
$$;
