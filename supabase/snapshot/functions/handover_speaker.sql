create or replace function handover_speaker(p_profile_id uuid, p_to_person_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_team boolean;
begin
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not can_manage_speaker(p_profile_id) then raise exception 'not allowed' using errcode = '42501'; end if;

  v_team := is_speaker_team(v_sp.edition_id);
  -- Weiterreichen, was man hat: wer nicht zum Team gehört, muss heute selbst
  -- die Betreuung haben. Sonst wäre es ein Zugriff, keine Übergabe.
  if not v_team and (v_sp.owner_person_id is distinct from v_me or p_to_person_id is null) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_to_person_id is not null then
    if not exists (select 1 from person p where p.id = p_to_person_id and p.deleted_at is null) then
      raise exception 'person_not_found' using errcode = 'P0002', detail = p_to_person_id::text;
    end if;
    if not is_speaker_manager(p_to_person_id) then
      raise exception 'invalid_owner' using errcode = '22023', detail = p_to_person_id::text;
    end if;
  end if;

  update speaker_profile set owner_person_id = p_to_person_id where id = p_profile_id;
  perform log_audit('speaker.handover', 'speaker_profile', p_profile_id::text,
                    jsonb_build_object('owner_person_id', v_sp.owner_person_id),
                    jsonb_build_object('owner_person_id', p_to_person_id));
end $$;
