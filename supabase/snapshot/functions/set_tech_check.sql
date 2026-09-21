create or replace function set_tech_check(p_asset_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('pending', 'checked', 'issue') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update speaker_asset set tech_check_status = p_status, tech_check_note = nullif(btrim(p_note), ''),
         tech_checked_by = current_person_id(), tech_checked_at = now()
   where id = p_asset_id;
  if not found then raise exception 'asset_not_found' using errcode = 'P0002'; end if;
  perform log_audit('speaker.tech_check', 'speaker_asset', p_asset_id::text, null, jsonb_build_object('status', p_status, 'note', p_note));
end $$;
