create or replace function invite_assistant(p_profile_id uuid, p_email text, p_first_name text DEFAULT NULL::text, p_last_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_email citext := nullif(btrim(p_email), '')::citext; v_aid uuid; v_old uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not (v_sp.person_id = v_me or can_manage_speaker(p_profile_id)) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_email is null then raise exception 'email_required' using errcode = '22023'; end if;
  if is_suppressed(v_email::text) then raise exception 'suppressed' using errcode = 'P0001'; end if;

  select pe.person_id into v_aid from person_email pe join person p on p.id = pe.person_id where pe.email = v_email and p.deleted_at is null limit 1;
  if v_aid is null then
    insert into person (first_name, last_name, source_first, tier)
    values (nullif(btrim(p_first_name), ''), nullif(btrim(p_last_name), ''), 'speaker_portal', 'lead') returning id into v_aid;
    insert into person_email (person_id, email, is_primary, verified) values (v_aid, v_email, true, false);
  end if;
  if v_aid = v_sp.person_id then raise exception 'assistant_is_speaker' using errcode = '23514'; end if;

  v_old := v_sp.assistant_person_id;
  update speaker_profile set assistant_person_id = v_aid where id = p_profile_id;
  if v_old is not null and v_old <> v_aid and not exists (select 1 from speaker_profile s where s.assistant_person_id = v_old and s.edition_id = v_sp.edition_id) then
    update role_assignment set valid_to = greatest(now(), valid_from + interval '1 second')
     where person_id = v_old and role = 'speaker_assistant' and scope_type = 'edition' and edition_id = v_sp.edition_id and (valid_to is null or valid_to > now());
  end if;
  insert into role_assignment (person_id, role, scope_type, edition_id, granted_by, note)
  values (v_aid, 'speaker_assistant', 'edition', v_sp.edition_id, v_me, 'assistant of ' || v_sp.id::text)
  on conflict (person_id, role, scope_type,
               coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(edition_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(portal, ''))
  do update set valid_to = null, granted_by = v_me;

  perform queue_mail('assistant_invite', v_aid,
    jsonb_build_object('speaker_name', (select btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) from person p where p.id = v_sp.person_id),
                       'edition_name', (select e.name from event e where e.id = v_sp.edition_id)),
    'speaker_profile', v_sp.id);
  perform log_audit('speaker.assistant_invite', 'speaker_profile', p_profile_id::text, jsonb_build_object('assistant', v_old), jsonb_build_object('assistant', v_aid));
  return v_aid;
end $$;
