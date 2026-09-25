create or replace function is_session_visible(p_session_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select is_programme_reader()
      or is_speaker_of(p_session_id)
      or exists (select 1 from session se where se.id = p_session_id
                  and (se.publish_status = 'published'
                       or (se.partner_org_id is not null and is_partner_of(se.partner_org_id))
                       or (se.host_org_id is not null and is_partner_of(se.host_org_id))
                       or is_standbuehne_editor_of(se.partner_org_id)
                       or is_standbuehne_editor_of(se.host_org_id)))
      or can_edit_session(p_session_id)
$$;
