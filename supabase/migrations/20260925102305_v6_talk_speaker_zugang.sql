-- 0198 · Talk-Speaker: eigener Zugang oder Verwaltung durch den Ops-Kontakt, Gäste nur Standbühne (PART-091)
-- Angewendet von der Architektur-Session am 25.09.2026 als 20260925102305.
-- Speaker eines gebuchten Slots: eigener Zugang oder Kommunikation über den Operations-Kontakt (PART-091)
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: Korrektur Konrad 25.09. zu PART-088 (PART-091, P1). Gäste ohne Profil gibt es nur auf der
-- Standbühne (0188 bleibt, wie es ist). Speaker eines gebuchten Slots (Talk, Keynote, Panel …) werden
-- wie normale Speaker betreut. Beim Anlegen fragt die Talk-Seite: „Soll der Speaker einen eigenen Zugang
-- erhalten, oder verwaltest du alles rund um den Slot?“
--
-- * **Eigener Zugang:** reguläres Speaker-Profil, der Weg `partner_add_speaker` aus 0139 wie bisher —
--   Pipeline `lead`, die Einladung ins Speaker-Portal verschickt das Speaker-Team ab `confirmed`
--   (Regel aus 0025).
-- * **Verwaltet der Partner:** reguläres Profil ohne eigene Einladung. Der Operations-Kontakt der
--   Organisation (`org_membership.roles` mit `primary_ops`) bekommt den Speaker-Zugang über die
--   Assistenz-Mechanik aus 0148 (`speaker_contact` mit `has_access`, Rolle `speaker_assistant` der
--   Edition) und pflegt Session, Anreise und Technik im Speaker-Portal. Die **gesamte Kommunikation**
--   läuft über ihn: alle Speaker-Mails (Einladung, Erinnerungen, Ticket, Präsentation) gehen an den
--   Kontakt, der Speaker bekommt keine (Ergänzung Konrad 25.09.).
--
-- Die Empfängerregel steht **am Profil**: `speaker_profile.mail_via_contact_id` zeigt auf den Kontakt.
-- Ein zusammengesetzter Fremdschlüssel (`mail_via_contact_id`, `id`) → `speaker_contact (id, profile_id)`
-- stellt sicher, dass es ein Kontakt **dieses** Profils ist; wird der Kontakt entfernt, fällt nur die
-- Regel (`on delete set null (mail_via_contact_id)`). **Die Mail-Seite setzt der Speaker-Chat um**
-- (abgestimmt 25.09.): eine Weiche im Speaker-Weg (`speaker_mail_recipient`, `queue_speaker_mail`),
-- nicht in `queue_mail`, das auch Volunteers, Partner und Talente nutzen; `invite_speaker` entfällt bei
-- gesetzter Regel. Bis dahin ist die Regel gesetzt, wirkt aber noch nicht — vor `confirmed` geht an
-- einen neuen Speaker ohnehin keine Einladung.
--
-- Weiter:
-- * Vokabular `speaker_contact_kind` bekommt `partner` (Partner-Kontakt), damit der Kontakt im
--   Speaker-Portal und im Admin richtig heisst.
-- * Mail-Vorlage `partner_speaker_contact` (DE/EN) an den Operations-Kontakt statt `assistant_invite`
--   — deren Betreff „<Speaker> hat dich als Assistenz eingetragen“ stimmt hier nicht.
-- * `partner_speakers` liefert hinten `mail_contact_name` für den Hinweis im Portal („Die Kommunikation
--   läuft über <Kontakt>, bitte intern weitergeben“).
-- * `partner_assign_stage_guest`: Gäste bekommen keinen Talk-Slot mehr; eine Zuordnung aus der Zeit
--   davor lässt sich nur noch abnehmen. Die Standbühne bleibt unverändert.
--
-- Funktionen wortgleich aus dem Snapshot; `partner_add_speaker` und `partner_speakers` per drop +
-- create (neue Signatur bzw. Rückgabe), danach wieder `grant execute … to authenticated`.

set search_path = public, extensions;

-- ---------------------------------------------------------------- 1) Vokabular

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order) values
  ('speaker_contact_kind', 'partner', 'Partner-Kontakt', 'Partner contact', 6)
on conflict (vocabulary, key) do nothing;

-- ---------------------------------------------------------------- 2) Empfängerregel am Profil

-- Ziel des zusammengesetzten Fremdschlüssels: ein Kontakt gehört genau einem Profil.
alter table speaker_contact add constraint speaker_contact_id_profile_key unique (id, profile_id);

alter table speaker_profile add column mail_via_contact_id uuid;
alter table speaker_profile add constraint speaker_profile_mail_via_contact_fkey
  foreign key (mail_via_contact_id, id) references speaker_contact (id, profile_id)
  on delete set null (mail_via_contact_id);

comment on column speaker_profile.mail_via_contact_id is
  'PART-091: Empfängerregel „Kontakt statt Speaker“. Gesetzt, wenn der Partner alles rund um den Slot verwaltet: alle Speaker-Mails (Einladung, Erinnerungen, Ticket, Präsentation) gehen an diesen Kontakt (speaker_contact dieses Profils, mit has_access), der Speaker selbst bekommt keine. Leer = der Speaker direkt. Entfernen des Kontakts hebt die Regel auf.';

-- Gäste gibt es nur noch auf der Standbühne (der Kommentar aus 0188 nannte auch den Talk).
comment on column speaker_profile.stage_guest is
  'Vom Partner angelegter Gast der Standbühne (PART-081; seit PART-091 nur dort, nicht mehr am Talk): erscheint in der Event-App als Speaker am veröffentlichten Programmpunkt, bekommt keinen Speaker-Zugang, kein Onboarding, keine Kommunikation, kein Freiticket, keine Lounge. Einlass über ein Ticket aus dem Partner-Kontingent.';

-- ---------------------------------------------------------------- 3) Mail an den Operations-Kontakt

insert into mail_template (key, locale, version, subject, body_md, description, active)
select v.key, v.locale, v.version, v.subject, v.body_md, v.description, v.active from (values
  ('partner_speaker_contact', 'en', 1, 'You are the contact for {{speaker_name}} at {{edition_name}}',
   E'Hi {{first_name}},\n\n**{{speaker_name}}** is registered as speaker for your slot at **{{edition_name}}**, and your company handles everything around the slot. All communication about this speaker therefore goes through you: invitation, reminders, ticket and presentation arrive at this address. Please pass on what matters internally.\n\nIn the speaker portal you maintain profile, session details, presentation, travel and tech on the speaker''s behalf.\n\nSign in with this email address – no password needed: [Open speaker portal]({{portal_url}}/login)\n\nBest,\nChefTreff',
   'Operations-Kontakt eines Partners betreut einen Speaker (PART-091)', true),
  ('partner_speaker_contact', 'de', 1, 'Du betreust {{speaker_name}} bei {{edition_name}}',
   E'Hallo {{first_name}},\n\n**{{speaker_name}}** ist als Speaker für euren Slot bei **{{edition_name}}** eingetragen, und ihr kümmert euch um alles rund um den Slot. Die gesamte Kommunikation zu diesem Speaker läuft deshalb über dich: Einladung, Erinnerungen, Ticket und Präsentation kommen an diese Adresse. Bitte gib das Wichtige intern weiter.\n\nIm Speaker-Portal pflegst du stellvertretend Profil, Session-Details, Präsentation, Anreise und Technik.\n\nMelde dich mit dieser E-Mail-Adresse an – ohne Passwort: [Speaker-Portal öffnen]({{portal_url}}/login)\n\nViele Grüße\nChefTreff',
   'Operations-Kontakt eines Partners betreut einen Speaker (PART-091)', true)
) as v(key, locale, version, subject, body_md, description, active)
where not exists (select 1 from mail_template t where t.key = v.key and t.locale = v.locale);

-- ---------------------------------------------------------------- 4) partner_add_speaker (Live-Fassung + Verwaltet-Fall)

-- Neue Signatur: die alte mit vier Argumenten muss weg, sonst wäre ein Aufruf mit vier Argumenten
-- mehrdeutig (zweite Überladung mit Default).
drop function if exists partner_add_speaker(uuid, text, text, text);

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

grant execute on function partner_add_speaker(uuid, text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------- 5) partner_speakers (Live-Fassung + Kontakt)

-- Die Rückgabe bekommt eine Spalte hinten: `create or replace` kann das nicht, also drop + create.
drop function if exists partner_speakers(uuid, uuid);

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
      left join session se on se.id = ss.session_id and se.partner_org_id = p_org_id
     where sp.created_by_org_id = p_org_id
       and sp.edition_id = v_oe.edition_id
       -- PART-081: Gäste der Standbühne stehen in ihrer eigenen Liste (partner_stage_guests).
       and not sp.stage_guest
     order by se.title_de nulls last, pe.last_name, pe.first_name;
end $$;

grant execute on function partner_speakers(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- 6) partner_assign_stage_guest (Live-Fassung, Talk-Weg nur noch abnehmen)

create or replace function partner_assign_stage_guest(p_session_id uuid, p_profile_id uuid, p_assign boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_se session; v_stage stage; v_sp speaker_profile; v_buehne boolean; v_talk boolean;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found or not v_sp.stage_guest then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  select st.* into v_stage from slot sl join stage st on st.id = sl.stage_id where sl.id = v_se.slot_id;
  -- Standbühne: nur die Bühne der Organisation, der der Gast gehört, und nur mit dem Recht auf diesen Slot.
  v_buehne := v_stage.id is not null and v_stage.type = 'partner_booth'
              and v_stage.partner_org_id = v_sp.created_by_org_id
              and coalesce(can_edit_slot(v_se.slot_id), false);
  -- PART-091 (Konrad 25.09.): Gäste gibt es nur auf der Standbühne. Einen Talk-Slot bekommt ein Gast
  -- nicht mehr (Speaker eines gebuchten Slots laufen über partner_add_speaker); eine Zuordnung aus der
  -- Zeit davor lässt sich nur noch abnehmen.
  v_talk := not v_buehne and not coalesce(p_assign, false)
            and v_se.partner_org_id = v_sp.created_by_org_id
            and partner_can_edit(v_sp.created_by_org_id);
  if not (v_buehne or v_talk)
     or not exists (select 1 from event ev where ev.id = v_se.event_id
                     and (ev.id = v_sp.edition_id or ev.edition_id = v_sp.edition_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if coalesce(p_assign, false) then
    insert into session_speaker (session_id, person_id, role, sort_order, confirmed)
    values (p_session_id, v_sp.person_id, 'speaker',
            coalesce((select max(ss.sort_order) + 1 from session_speaker ss where ss.session_id = p_session_id), 0), true)
    on conflict (session_id, person_id, role) do nothing;
  else
    delete from session_speaker where session_id = p_session_id and person_id = v_sp.person_id and role = 'speaker';
  end if;
  perform log_audit(case when coalesce(p_assign, false) then 'partner.stage_guest_assign' else 'partner.stage_guest_unassign' end,
                    'session', p_session_id::text, null,
                    jsonb_build_object('org_id', v_sp.created_by_org_id, 'profile_id', v_sp.id,
                                       'weg', case when v_buehne then 'standbuehne' else 'talk' end));
end $$;

select harden_definer_functions();
