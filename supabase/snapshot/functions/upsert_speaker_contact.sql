create or replace function upsert_speaker_contact(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_sp speaker_profile%rowtype; v_me uuid := current_person_id();
  v_id uuid := nullif(p_data->>'id', '')::uuid; v_alt speaker_contact%rowtype;
  v_kind text; v_email citext; v_vor text; v_nach text; v_tel text;
  v_access boolean; v_consent date; v_pid uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile
   where id = coalesce(nullif(p_data->>'profile_id', '')::uuid, my_speaker_profile_id(null))
   for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce((v_sp.person_id = v_me or can_manage_speaker(v_sp.id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_id is not null then
    select * into v_alt from speaker_contact where id = v_id and profile_id = v_sp.id for update;
    if not found then raise exception 'contact_not_found' using errcode = 'P0002'; end if;
  end if;

  -- Erst ausrechnen, was nach dem Schreiben dastünde, dann prüfen: sonst
  -- scheitert eine reine Namenskorrektur an der Einwilligung (Lehre aus 0114,
  -- übernommen aus 0127).
  v_kind   := coalesce(nullif(btrim(coalesce(p_data->>'kind', '')), ''), v_alt.kind);
  v_vor    := nullif(btrim(coalesce(case when p_data ? 'first_name' then p_data->>'first_name' else v_alt.first_name end, '')), '');
  v_nach   := nullif(btrim(coalesce(case when p_data ? 'last_name'  then p_data->>'last_name'  else v_alt.last_name  end, '')), '');
  v_tel    := nullif(btrim(coalesce(case when p_data ? 'phone'      then p_data->>'phone'      else v_alt.phone      end, '')), '');
  v_email  := nullif(btrim(coalesce(case when p_data ? 'email'      then p_data->>'email'      else v_alt.email::text end, '')), '')::citext;
  v_access := coalesce(case when p_data ? 'has_access' then (p_data->>'has_access')::boolean else v_alt.has_access end, false);
  v_consent := case when p_data ? 'consent_at'
                    then nullif(btrim(p_data->>'consent_at'), '')::date
                    else v_alt.consent_at end;

  if v_kind is null then raise exception 'invalid_contact_kind' using errcode = '22023', detail = 'null'; end if;
  if coalesce(v_vor, v_nach, v_email::text, v_tel) is null then
    raise exception 'contact_empty' using errcode = '22023';
  end if;
  if v_consent is null then
    -- Die Daten gehören einem Menschen, der hier kein Konto hat und nicht
    -- gefragt wurde. Ohne die Bestätigung der Speakerin speichern wir sie nicht.
    raise exception 'speaker_contact_consent_required' using errcode = '22023', detail = 'speaker_contact';
  end if;
  if v_access and v_email is null then
    raise exception 'contact_email_required' using errcode = '22023';
  end if;

  -- Zugang: Person suchen oder anlegen, wie `invite_assistant` es tat.
  v_pid := v_alt.person_id;
  if v_access then
    if is_suppressed(v_email::text) then raise exception 'suppressed' using errcode = 'P0001'; end if;
    select pe.person_id into v_pid from person_email pe join person p on p.id = pe.person_id
     where pe.email = v_email and p.deleted_at is null limit 1;
    if v_pid is null then
      insert into person (first_name, last_name, source_first, tier)
      values (v_vor, v_nach, 'speaker_portal', 'lead') returning id into v_pid;
      insert into person_email (person_id, email, is_primary, verified) values (v_pid, v_email, true, false);
    end if;
    if v_pid = v_sp.person_id then raise exception 'contact_is_speaker' using errcode = '23514'; end if;
  end if;

  if v_id is null then
    insert into speaker_contact (profile_id, kind, person_id, first_name, last_name, email, phone,
                                 has_access, consent_at)
    values (v_sp.id, v_kind, case when v_access then v_pid end, v_vor, v_nach, v_email, v_tel,
            v_access, v_consent)
    returning id into v_id;
  else
    update speaker_contact
       set kind = v_kind, person_id = case when v_access then v_pid else person_id end,
           first_name = v_vor, last_name = v_nach, email = v_email, phone = v_tel,
           has_access = v_access, consent_at = v_consent
     where id = v_id;
  end if;

  if v_access then
    insert into role_assignment (person_id, role, scope_type, edition_id, granted_by, note)
    values (v_pid, 'speaker_assistant', 'edition', v_sp.edition_id, v_me, 'contact of ' || v_sp.id::text)
    on conflict (person_id, role, scope_type,
                 coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 coalesce(edition_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 coalesce(portal, ''))
    do update set valid_to = null, granted_by = v_me;
    -- Einladung nur beim ersten Mal: ein zweiter Klick auf „Speichern" soll
    -- keine zweite Mail auslösen.
    if v_alt.id is null or not v_alt.has_access or v_alt.person_id is distinct from v_pid then
      perform queue_mail('assistant_invite', v_pid,
        jsonb_build_object('speaker_name', (select btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
                                              from person p where p.id = v_sp.person_id),
                           'edition_name', (select e.name from event e where e.id = v_sp.edition_id)),
        'speaker_profile', v_sp.id);
    end if;
  elsif v_alt.has_access and v_alt.person_id is not null then
    perform speaker_access_revoke(v_alt.person_id, v_sp.edition_id);
  end if;

  perform log_audit('speaker.contact_upsert', 'speaker_contact', v_id::text,
                    case when v_alt.id is null then null else to_jsonb(v_alt) - 'email' - 'phone' end,
                    jsonb_build_object('kind', v_kind, 'has_access', v_access));
  return v_id;
end $$;
