create or replace function remove_speaker_contact(p_contact_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_c speaker_contact%rowtype; v_sp speaker_profile%rowtype; v_me uuid := current_person_id();
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_c from speaker_contact where id = p_contact_id for update;
  if not found then raise exception 'contact_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_c.profile_id;
  if not coalesce((v_sp.person_id = v_me or can_manage_speaker(v_sp.id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  delete from speaker_contact where id = p_contact_id;
  if v_c.has_access then perform speaker_access_revoke(v_c.person_id, v_sp.edition_id); end if;
  perform log_audit('speaker.contact_remove', 'speaker_contact', p_contact_id::text,
                    jsonb_build_object('kind', v_c.kind, 'has_access', v_c.has_access), null);
end $$;
