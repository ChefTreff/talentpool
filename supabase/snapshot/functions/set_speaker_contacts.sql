create or replace function set_speaker_contacts(p_profile_id uuid, p_lead uuid, p_buddy uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not can_edit_edition_contacts() then raise exception 'not allowed' using errcode = '42501'; end if;
  select sp.edition_id into v_ed from speaker_profile sp where sp.id = p_profile_id;
  if v_ed is null then raise exception 'profile_not_found' using errcode = 'P0002', detail = p_profile_id::text; end if;
  perform check_edition_contact(p_lead, v_ed, 'speaker_lead');
  perform check_edition_contact(p_buddy, v_ed, 'speaker_buddy');
  update speaker_profile set lead_contact_id = p_lead, buddy_contact_id = p_buddy, updated_at = now()
   where id = p_profile_id;
  perform log_audit('edition_contact.assign_speaker', 'speaker_profile', p_profile_id::text, null,
                    jsonb_build_object('lead', p_lead, 'buddy', p_buddy));
end $$;
