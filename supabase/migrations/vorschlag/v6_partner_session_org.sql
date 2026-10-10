-- 00NN · Session auf gebrandeter Bühne und Organisation: der Helfer `session_partner_org` — ableiten statt speichern (PART-148, Plan-Entscheidung 10.10.2026: Option B)
-- Vorschlag des Partner-Chats, noch nicht angewendet. Nummer und Zeitstempel vergibt die Architektur-Session beim Anwenden.
--
-- Anlass: Das Team legt Sessions auf einer gebrandeten Bühne (`stage.kind = 'branded'`: main/side mit Partner) ohne `partner_org_id` an. Für sie griffen nur die Speaker-Wege (0293, PART-138:
-- `partner_add_speaker` und `partner_speakers` leiten die Organisation selbst aus der Bühne ab); die Liste (`partner_format_sessions`) und das Pflegen der Texte (`partner_update_session`)
-- kannten die Organisation einer Session nur über `session.partner_org_id` und ließen sie aus. Plan hat **B** gewählt: nichts speichern — kein Backfill, kein Marker, kein Recht, das beim
-- Verlassen der Bühne stehen bleibt, das Board (Session-Anlage, Speaker-Chat) bleibt unberührt. Die Oberfläche (Texte pflegen, „Veröffentlichen anfragen“, Reiter) kommt mit (c), einem eigenen PR.
--
-- Was die Migration tut (ein neuer Helfer, vier bestehende Funktionen — jede von der Live-Fassung im Snapshot aus, nur die genannten Zeilen)
--   1  `session_partner_org(p_session_id)` — die Organisation einer Session für Partnerrechte: `session.partner_org_id`, sonst — nur an einer **gebrandeten** Bühne — die Organisation,
--      die die Bühne des Slots gebrandet hat; sonst NULL (Standbühne, Interview Table, Hauptbühne, ohne Slot: dort gelten Gäste und Formate wie bisher). Eine Session mit eigener Organisation
--      bleibt bei dieser, auch auf der Bühne einer anderen. Interner Helfer: kein Recht für `public`, `anon` und `authenticated` — die Funktionen unten sind Definer und rufen ihn als Eigentümer.
--   2  `partner_format_sessions` — die Liste nimmt `session_partner_org(se.id) = p_org_id` statt `se.partner_org_id = p_org_id`.
--   3  `partner_update_session` — das Recht an der Session hängt an `session_partner_org(p_session_id)` statt an `v_se.partner_org_id`.
--   4  `partner_add_speaker` und `partner_speakers` — die eigene Ableitung aus 0293 (inline) entfällt zugunsten des Helfers; **dasselbe Verhalten** (Regression: der Test von 0293, `v6_eure_buehne`, läuft
--      unverändert gegen diese Migration).
--
-- Bewusst **nicht** angefasst:
--   · `is_session_visible` — wer dort etwas tun darf (Editoren der Bühne), sieht die Programmpunkte schon über `can_edit_session`; eine Ausweitung auf Rollen ohne Bearbeitungsrecht zeigte auch
--     Entwürfe der Programmleitung und hätte keine Oberfläche.
--   · `session_change_notify` (LEAD-063) — Plan 10.10.: keine Änderungsmail für die gebrandete Bühne.
--   · `partner_request_publish` und `partner_withdraw_publish` — (c), eigener PR (`kind in ('booth','branded')`, Tabelle und Rückgabe).
--   · `partner_delete_session`, `partner_request_question`, `partner_set_session_questions`, `partner_copy_table_questions`, `partner_entitlement` — Sessions, die der Partner selbst anlegt (eigene
--     Organisation), und Zählungen gegen sein Kontingent: eine vom Team angelegte Session löscht der Partner nicht, und sie zählt nicht gegen seine Kontingente.
--   · `partner_stage_guests`, `partner_assign_stage_guest`, `partner_remove_stage_guest` — Gäste der Standbühne (PART-081), Vergleich bewusst über Bühne, Gastgeber und Session.
-- Der Quelltext-Test (`tests/part-148-session-partner-org.test.ts`) hält fest: jede `partner_*`-Funktion, die `session.partner_org_id` liest, nimmt den Helfer oder steht mit Grund in einer Ausnahmeliste.
set search_path = public, extensions;

-- ---------------------------------------------------------------- Helfer

create or replace function session_partner_org(p_session_id uuid)
returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(
           se.partner_org_id,
           (select st.partner_org_id from slot sl join stage st on st.id = sl.stage_id
             where sl.id = se.slot_id and st.kind = 'branded'))
    from session se
   where se.id = p_session_id
$$;

revoke execute on function session_partner_org(uuid) from public, anon, authenticated;
comment on function session_partner_org(uuid) is
  'Organisation einer Session für Partnerrechte (PART-148, Option B): session.partner_org_id, sonst die Organisation der gebrandeten Bühne des Slots, sonst NULL. Interner Helfer, nichts gespeichert.';

-- ---------------------------------------------------------------- Liste

create or replace function partner_format_sessions(p_org_id uuid, p_format text DEFAULT NULL::text, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, format text, title_de text, title_en text, description_de text, description_en text, language text, access_mode text, capacity integer, publish_status text, format_details jsonb, starts_at timestamp with time zone, ends_at timestamp with time zone, stage_name text, day_label_de text, applications_total integer, applications_accepted integer, is_host boolean, stage_id uuid, event_day_id uuid, return_note text, returned_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition;
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  return query
    select se.id, se.format, se.title_de, se.title_en, se.description_de, se.description_en,
           se.language, se.access_mode, se.capacity, se.publish_status, se.format_details,
           sl.start_at, sl.end_at, st.name, ed.label_de,
           (select count(*)::integer from application a where a.session_id = se.id),
           (select count(*)::integer from application a where a.session_id = se.id and a.status in ('accepted','confirmed')),
           (se.host_org_id = p_org_id),
           st.id, ed.id,
           -- PART-083: der offene Rückgabegrund der Programmleitung, falls es einen gibt.
           rr.note, rr.returned_at
      from session se
      join event ev on ev.id = se.event_id
      left join slot sl on sl.id = se.slot_id
      left join stage st on st.id = sl.stage_id
      left join event_day ed on ed.id = sl.event_day_id
      left join partner_session_return rr on rr.session_id = se.id
     -- PART-148: auch eine Session ohne Organisation auf einer Bühne, die diese Organisation gebrandet hat
     where session_partner_org(se.id) = p_org_id
       and (ev.id = v_oe.edition_id or ev.edition_id = v_oe.edition_id)
       and se.publish_status <> 'cancelled'
       and (p_format is null or se.format = p_format)
     order by sl.start_at nulls last, se.title_de;
end $$;;

-- ---------------------------------------------------------------- Texte pflegen

create or replace function partner_update_session(p_session_id uuid, p_fields jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_se session; v_org uuid; v_details jsonb; v_bad text; v_zurueck boolean := false;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  -- PART-148: die Organisation der Session — eigene, sonst die der gebrandeten Bühne
  v_org := session_partner_org(p_session_id);
  if v_org is null or not partner_can_edit(v_org) then raise exception 'not allowed' using errcode = '42501'; end if;

  select string_agg(k, ',') into v_bad from jsonb_object_keys(p_fields) k
   where k not in ('title_de','title_en','description_de','description_en','language','format_details');
  if v_bad is not null then
    raise exception 'not_editable' using errcode = 'P0001', detail = v_bad;
  end if;
  -- Eine Sprache je Session (SPK-052). `coalesce`, weil `NULL not in (…)` NULL
  -- ist und das `if` durchliesse — `{"language": null}` schrieb sonst NULL in eine
  -- Pflichtspalte und endete in 23502 statt in einer Meldung (Lehre aus 0118).
  if p_fields ? 'language' and coalesce((p_fields->>'language') not in ('de','en'), true) then
    -- `detail` darf nicht NULL sein (22004) — gerade beim Wert NULL, um den es hier geht.
    raise exception 'invalid_language' using errcode = '22023', detail = coalesce(p_fields->>'language', 'null');
  end if;

  v_details := case when p_fields ? 'format_details'
                    -- Auflage 6: die Organisation mitgeben, sonst prüft die Funktion nur die Form.
                    then check_format_details(v_se.format, p_fields->'format_details', v_org)
                    else v_se.format_details end;

  -- Auflage 4: Nur die Felder, die im veröffentlichten Programm stehen, lösen eine erneute
  -- Freigabe aus — und nur, wenn sie sich wirklich ändern. Wer denselben Titel noch einmal
  -- speichert, soll nicht aus dem Programm fallen.
  v_zurueck := v_se.publish_status = 'published' and (
       (p_fields ? 'title_de'       and nullif(btrim(p_fields->>'title_de'), '')       is distinct from v_se.title_de)
    or (p_fields ? 'title_en'       and nullif(btrim(p_fields->>'title_en'), '')       is distinct from v_se.title_en)
    or (p_fields ? 'description_de' and nullif(btrim(p_fields->>'description_de'), '') is distinct from v_se.description_de)
    or (p_fields ? 'description_en' and nullif(btrim(p_fields->>'description_en'), '') is distinct from v_se.description_en)
    or (p_fields ? 'language'       and (p_fields->>'language')                        is distinct from v_se.language));

  update session set
    title_de = case when p_fields ? 'title_de' then nullif(btrim(p_fields->>'title_de'), '') else title_de end,
    title_en = case when p_fields ? 'title_en' then nullif(btrim(p_fields->>'title_en'), '') else title_en end,
    description_de = case when p_fields ? 'description_de' then nullif(btrim(p_fields->>'description_de'), '') else description_de end,
    description_en = case when p_fields ? 'description_en' then nullif(btrim(p_fields->>'description_en'), '') else description_en end,
    language = case when p_fields ? 'language' then p_fields->>'language' else language end,
    format_details = v_details,
    publish_status = case when v_zurueck then 'review' else publish_status end,
    updated_by = current_person_id()
  where id = p_session_id;

  if v_zurueck and v_se.slot_id is not null then
    -- Der Slot zieht mit, wie bei der Ablehnung in `release_partner_session`: die Zeit bleibt
    -- reserviert, gilt aber nicht mehr als zugesagt.
    update slot set status = 'requested' where id = v_se.slot_id and status = 'final';
  end if;

  perform log_audit('partner.session_update', 'session', p_session_id::text,
                    jsonb_build_object('format_details', v_se.format_details,
                                       'publish_status', v_se.publish_status),
                    jsonb_build_object('fields', (select array_agg(k) from jsonb_object_keys(p_fields) k),
                                       'back_to_review', v_zurueck));
  return v_zurueck;
end $$;;

-- ---------------------------------------------------------------- Speaker eintragen

create or replace function partner_add_speaker(p_session_id uuid, p_email text, p_first_name text, p_last_name text, p_verwaltet boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_se session; v_org uuid; v_oe org_edition; v_person uuid; v_prof uuid; v_email citext; v_n integer; v_owner uuid;
        v_neu boolean := false;
        -- PART-091: Verwaltet-Fall (Operations-Kontakt statt eigenem Zugang).
        v_prof_neu boolean := false; v_ops uuid; v_kontakt uuid; v_ed uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  -- PART-138/148: die Organisation, für die der Partner hier eintragen darf — die der Session; hat die Session keine (das Team hat sie auf einer gebrandeten Bühne
  -- angelegt), die Organisation, die diese Bühne gebrandet hat (Helfer; früher an dieser Stelle inline).
  v_org := session_partner_org(p_session_id);
  if v_org is null or not partner_can_edit(v_org) then
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

  select oe.* into v_oe from org_edition oe where oe.org_id = v_org
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
                                            and sp.created_by_org_id = v_org
                                            and sp.mail_via_contact_id is not null) then
      raise exception 'speaker_has_access' using errcode = 'P0001';
    end if;
    select om.person_id into v_ops from org_membership om join person p on p.id = om.person_id
     where om.org_id = v_org and om.roles @> '{primary_ops}' and p.deleted_at is null
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
            v_org, v_neu)
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
                    jsonb_build_object('org_id', v_org, 'person_id', v_person,
                                       'profile_id', v_prof, 'claimed', not v_neu,
                                       'verwaltet', coalesce(p_verwaltet, false), 'contact_id', v_kontakt));
  return v_prof;
end $$;;

-- ---------------------------------------------------------------- Speaker der Organisation

create or replace function partner_speakers(p_org_id uuid, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(profile_id uuid, person_id uuid, session_id uuid, session_title text, display_name text, can_edit boolean, confirmed boolean, pipeline_status text, first_name text, last_name text, title text, job_title text, organization_name text, bio_short_de text, bio_short_en text, bio_long_de text, bio_long_en text, linkedin_url text, socials jsonb, photo_asset_id uuid, mail_contact_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition;
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  return query
    select sp.id, sp.person_id, se.id, se.title_de,
           btrim(concat_ws(' ', pe.first_name, pe.last_name)),
           sp.partner_editable_until_login, coalesce(ss.confirmed, false), sp.pipeline_status,
           -- Ab hier nur, solange das Pflegerecht gilt. Sonst sind es fremde Stammdaten.
           case when sp.partner_editable_until_login then pe.first_name end,
           case when sp.partner_editable_until_login then pe.last_name end,
           case when sp.partner_editable_until_login then pe.title end,
           case when sp.partner_editable_until_login then sp.job_title end,
           case when sp.partner_editable_until_login then sp.organization_name end,
           case when sp.partner_editable_until_login then sp.bio_short_de end,
           case when sp.partner_editable_until_login then sp.bio_short_en end,
           case when sp.partner_editable_until_login then sp.bio_long_de end,
           case when sp.partner_editable_until_login then sp.bio_long_en end,
           case when sp.partner_editable_until_login then pe.linkedin_url end,
           case when sp.partner_editable_until_login then sp.socials end,
           case when sp.partner_editable_until_login then sp.photo_asset_id end,
           -- PART-091: über wen die Kommunikation läuft (Verwaltet-Fall) — der eigene Operations-Kontakt
           -- des Partners, keine fremden Daten. Leer = der Speaker direkt.
           (select nullif(btrim(concat_ws(' ', coalesce(pc.first_name, c.first_name), coalesce(pc.last_name, c.last_name))), '')
              from speaker_contact c left join person pc on pc.id = c.person_id
             where c.id = sp.mail_via_contact_id)
      from speaker_profile sp
      join person pe on pe.id = sp.person_id
      left join session_speaker ss on ss.person_id = sp.person_id
      -- PART-138/148: auch eine Session ohne Organisation auf einer Bühne, die diese Organisation gebrandet hat (das Team legt sie dort an) — Helfer statt der Ableitung an dieser Stelle
      left join session se on se.id = ss.session_id and session_partner_org(se.id) = p_org_id
     where sp.created_by_org_id = p_org_id
       and sp.edition_id = v_oe.edition_id
       -- PART-081: Gäste der Standbühne stehen in ihrer eigenen Liste (partner_stage_guests).
       and not sp.stage_guest
     order by se.title_de nulls last, pe.last_name, pe.first_name;
end $$;;

select harden_definer_functions();
