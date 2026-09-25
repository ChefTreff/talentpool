create or replace function invite_speaker(p_profile_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_mail bigint; v_actor uuid := current_person_id();
begin
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  -- PART-081: Gäste der Standbühne bekommen keinen Speaker-Zugang.
  if v_sp.stage_guest then raise exception 'stage_guest' using errcode = 'P0001'; end if;
  if not can_manage_speaker(p_profile_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_sp.pipeline_status not in ('confirmed', 'onboarded', 'ready', 'published') then
    raise exception 'not_confirmed' using errcode = 'P0001', detail = v_sp.pipeline_status;
  end if;
  insert into role_assignment (person_id, role, scope_type, edition_id, granted_by, note)
  values (v_sp.person_id, 'speaker', 'edition', v_sp.edition_id, v_actor, 'speaker_profile')
  on conflict (person_id, role, scope_type,
               coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(edition_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(portal, ''))
  do update set valid_to = null;
  v_mail := queue_mail('speaker_invite', v_sp.person_id,
    jsonb_build_object('edition_name', (select e.name from event e where e.id = v_sp.edition_id),
                       'inviter_name', coalesce((select p.first_name from person p where p.id = v_actor), 'ChefTreff')),
    'speaker_profile', v_sp.id);
  update speaker_profile set invited_at = now() where id = p_profile_id;
  perform log_audit('speaker.invite', 'speaker_profile', p_profile_id::text, null, jsonb_build_object('mail_log_id', v_mail));
  return v_mail;
end $$;
