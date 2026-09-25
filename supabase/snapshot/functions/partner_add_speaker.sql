create or replace function partner_add_speaker(p_session_id uuid, p_email text, p_first_name text, p_last_name text, p_verwaltet boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_se session; v_oe org_edition; v_person uuid; v_prof uuid; v_email citext; v_n integer; v_owner uuid;
        v_neu boolean := false;
        -- PART-091: Verwaltet-Fall (Operations-Kontakt statt eigenem Zugang).
        v_prof_neu boolean := false; v_ops uuid; v_kontakt uuid; v_ed uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  if v_se.partner_org_id is null or not partner_can_edit(v_se.partner_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_se.format not in ('keynote', 'panel', 'talk', 'impulse', 'fireside_chat', 'masterclass') then
    raise exception 'invalid_format' using errcode = '22023', detail = v_se.format;
  end if;
  v_email := nullif(btrim(coalesce(p_email, '')), '')::citext;
  if v_email is null or v_email::text !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'invalid_email' using errcode = '22023', detail = coalesce(p_email, 'null');
  end if;

  -- Ein bestätigter Speaker in dieser Rolle bleibt, wo er ist.
  select count(*)::integer into v_n from session_speaker ss
   where ss.session_id = p_session_id and ss.role = 'speaker' and ss.confirmed;
  if v_n > 0 then raise exception 'slot_locked' using errcode = 'P0001', detail = 'speaker_confirmed'; end if;

  -- Person über die Mailadresse finden oder anlegen (Dublettenregel wie im Partner-Ingest).
  select pe.person_id into v_person from person_email pe where pe.email = v_email limit 1;
  if v_person is null then
    insert into person (first_name, last_name) values (nullif(btrim(p_first_name), ''), nullif(btrim(p_last_name), ''))
      returning id into v_person;
    insert into person_email (person_id, email, is_primary) values (v_person, v_email, true);
    -- Nur diese Person ist eine, die es ohne den Partner nicht gäbe. Nur sie darf er pflegen.
    v_neu := true;
  end if;

  select oe.* into v_oe from org_edition oe where oe.org_id = v_se.partner_org_id
     and oe.edition_id in (select coalesce(ev.edition_id, ev.id) from event ev where ev.id = v_se.event_id)
   limit 1;

  -- Betreuung: die Leitung der Bühne, sonst bleibt es offen und das Team teilt zu.
  select st.stage_lead_person_id into v_owner
    from slot sl join stage st on st.id = sl.stage_id where sl.id = v_se.slot_id;

  select sp.id into v_prof from speaker_profile sp
   where sp.person_id = v_person and sp.edition_id = coalesce(v_oe.edition_id, v_se.event_id);
  -- PART-081: ein Gast der Standbühne ist kein Speaker eines Talks — sonst stünde er ohne Zugang,
  -- Ticket und Lounge auf der Hauptbühne. Erst das Gastprofil entfernen.
  if v_prof is not null and exists (select 1 from speaker_profile where id = v_prof and stage_guest) then
    raise exception 'stage_guest' using errcode = 'P0001';
  end if;
  -- PART-091 (Konrad 25.09.): „Soll der Speaker einen eigenen Zugang erhalten, oder verwaltest du alles
  -- rund um den Slot?“ Verwaltet heisst: reguläres Profil ohne eigene Einladung, der Operations-Kontakt
  -- der Organisation bekommt den Speaker-Zugang, alle Speaker-Mails gehen an ihn.
  if coalesce(p_verwaltet, false) then
    -- Wer schon Speaker der Edition ist, hat seinen eigenen Zugang — dessen Kommunikation leitet kein
    -- Partner um. Nur ein Profil, das derselbe Partner schon verwaltet angelegt hat, darf weitere Slots bekommen.
    if v_prof is not null and not exists (select 1 from speaker_profile sp where sp.id = v_prof
                                            and sp.created_by_org_id = v_se.partner_org_id
                                            and sp.mail_via_contact_id is not null) then
      raise exception 'speaker_has_access' using errcode = 'P0001';
    end if;
    select om.person_id into v_ops from org_membership om join person p on p.id = om.person_id
     where om.org_id = v_se.partner_org_id and om.roles @> '{primary_ops}' and p.deleted_at is null
     limit 1;
    if v_ops is null then raise exception 'no_ops_contact' using errcode = 'P0001'; end if;
    if v_ops = v_person then raise exception 'contact_is_speaker' using errcode = '23514'; end if;
  end if;
  if v_prof is null then
    -- **`lead`, nicht `invited`** (Probelauf der Architektur-Session, 21.09.: 23514). Das
    -- Vokabular `speaker_pipeline` kennt lead, contacted, confirmed, onboarded, ready,
    -- published, attended, declined — `invited` war meine Erfindung und hätte am CHECK
    -- scheitern müssen, was sie auch tat.
    --
    -- `lead` ist auch inhaltlich der richtige Anfang: wen ein Partner für seine Session
    -- einträgt, hat aus Sicht des Speaker-Teams noch niemand kontaktiert. Die Einladung
    -- verschickt das Team, und zwar erst ab `confirmed` (Regel aus 0025) — stünde hier
    -- „eingeladen", behauptete der Status etwas, das noch nicht passiert ist.
    insert into speaker_profile (person_id, edition_id, pipeline_status, owner_person_id,
                                 created_by_org_id, partner_editable_until_login)
    values (v_person, coalesce(v_oe.edition_id, v_se.event_id), 'lead', v_owner,
            v_se.partner_org_id, v_neu)
    returning id into v_prof;
    v_prof_neu := true;
  end if;

  insert into session_speaker (session_id, person_id, role)
  values (p_session_id, v_person, 'speaker')
  on conflict do nothing;

  -- PART-091, Verwaltet-Fall beim ersten Anlegen: der Operations-Kontakt wird Kontakt mit Zugang
  -- (Assistenz-Mechanik aus 0148: `speaker_contact.has_access`, Rolle `speaker_assistant` der Edition)
  -- und Empfänger aller Speaker-Mails (`mail_via_contact_id`). Die Einwilligung bestätigt hier der Partner:
  -- es ist sein eigener Operations-Kontakt, dessen Daten wir ohnehin als Partner-Kontakt führen.
  if coalesce(p_verwaltet, false) and v_prof_neu then
    select sp.edition_id into v_ed from speaker_profile sp where sp.id = v_prof;
    insert into speaker_contact (profile_id, kind, person_id, first_name, last_name, email, has_access, consent_at)
    select v_prof, 'partner', p.id, p.first_name, p.last_name, pe.email, true, current_date
      from person p left join person_email pe on pe.person_id = p.id and pe.is_primary
     where p.id = v_ops
    returning id into v_kontakt;
    update speaker_profile set mail_via_contact_id = v_kontakt where id = v_prof;
    insert into role_assignment (person_id, role, scope_type, edition_id, granted_by, note)
    values (v_ops, 'speaker_assistant', 'edition', v_ed, current_person_id(), 'partner contact of ' || v_prof::text)
    on conflict (person_id, role, scope_type,
                 coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 coalesce(edition_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 coalesce(portal, ''))
    do update set valid_to = null, granted_by = current_person_id();
    perform queue_mail('partner_speaker_contact', v_ops,
      jsonb_build_object('speaker_name', (select btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
                                            from person p where p.id = v_person),
                         'edition_name', (select e.name from event e where e.id = v_ed)),
      'speaker_profile', v_prof);
  end if;

  -- `claimed` im Audit, damit im Nachhinein erkennbar ist, welcher Partner eine bestehende
  -- Person nur zugeordnet und welche er selbst angelegt hat.
  perform log_audit('partner.add_speaker', 'session', p_session_id::text, null,
                    jsonb_build_object('org_id', v_se.partner_org_id, 'person_id', v_person,
                                       'profile_id', v_prof, 'claimed', not v_neu,
                                       'verwaltet', coalesce(p_verwaltet, false), 'contact_id', v_kontakt));
  return v_prof;
end $$;
