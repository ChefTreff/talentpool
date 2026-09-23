create or replace function my_speaker_assets(p_profile_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, profile_id uuid, session_id uuid, kind text, storage_path text, filename text, mime text, size_bytes bigint, version integer, is_current boolean, late boolean, tech_check_status text, tech_check_note text, slides_release boolean, uploaded_by uuid, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select a.id, a.profile_id, a.session_id, a.kind, a.storage_path, a.filename, a.mime, a.size_bytes,
         a.version, a.is_current, a.late, a.tech_check_status, a.tech_check_note, a.slides_release, a.uploaded_by, a.created_at
  from speaker_asset a
  join speaker_profile sp on sp.id = a.profile_id
  where (p_profile_id is null or a.profile_id = p_profile_id)
    and (sp.person_id = current_person_id() or is_speaker_assistant(sp.id, current_person_id()) or can_manage_speaker(a.profile_id) or is_staff())
  order by a.kind, a.session_id, a.version desc
$$;
