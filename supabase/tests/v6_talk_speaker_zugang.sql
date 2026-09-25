-- Smoke-Test (Speaker eines gebuchten Slots: eigener Zugang oder Verwaltet-Fall, PART-091). Nummer offen.
-- Wegwerf-Organisationen, -Personen und -Sessions, echte Partnerrollen des angemeldeten Kontos, alles
-- zurückgerollt. Belegt:
--   01 eigener Zugang: reguläres Profil (`lead`, Partner als Anleger), kein Kontakt, keine Regel, keine Mail;
--   02 verwaltet: Kontakt `partner` = Operations-Kontakt mit Zugang und Einwilligung von heute, Rolle
--      `speaker_assistant` der Edition, Regel `mail_via_contact_id` gesetzt, genau eine Mail
--      `partner_speaker_contact` an den Kontakt, keine an den Speaker;
--   03 derselbe verwaltete Speaker auf einem zweiten Slot: kein zweiter Kontakt, keine zweite Mail;
--   04 verwaltet für jemanden, der schon eigenen Zugang hat: P0001 `speaker_has_access`, Regel bleibt leer;
--   05 verwaltet ohne Operations-Kontakt: P0001 `no_ops_contact`, nichts angelegt;
--   06 Operations-Kontakt als Speaker verwaltet: 23514 `contact_is_speaker`;
--   07 `partner_speakers` nennt den Kontakt nur beim verwalteten Speaker;
--   08 die Regel zeigt nur auf Kontakte dieses Profils (23503), Entfernen des Kontakts hebt nur die Regel auf;
--   09 Gäste: kein Talk-Slot mehr (42501), eine alte Talk-Zuordnung lässt sich abnehmen, die Standbühne geht
--      weiter (Vorbedingung);
--   10 alte Signatur weg, neue für `authenticated`, nicht für `anon`; `partner_speakers` ebenso;
--   11 Vokabular `partner` und die Vorlage in beiden Sprachen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_summit uuid; v_tz text; v_day uuid; v_datum date;
  v_org uuid; v_org2 uuid; v_ops uuid; v_talk uuid; v_talk2 uuid; v_talk_b uuid;
  v_p1 uuid; v_p2 uuid; v_kontakt uuid; v_person2 uuid; v_n integer; v_m integer; v_txt text; v_b boolean;
  v_buehne uuid; v_slot uuid; v_stand uuid; v_gast uuid; v_gast_person uuid; v_c record;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  if v_pid is null then raise exception 'VORBEDINGUNG: keine Person mit Konto'; end if;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id, e.timezone into v_summit, v_tz from event e
   where e.edition_id = v_ed and e.format_tag = 'summit' order by e.start_date limit 1;
  select ed.id, ed.day_date into v_day, v_datum from event_day ed where ed.event_id = v_summit order by ed.sort_order limit 1;
  if v_summit is null or v_day is null then raise exception 'VORBEDINGUNG: Summit mit Tagen fehlt'; end if;

  -- Organisation A mit Operations-Kontakt, Organisation B ohne; das Konto ist in beiden Kontakt (`additional`).
  insert into organization (legal_name) values ('ZZ 091 GmbH') returning id into v_org;
  insert into organization (legal_name) values ('ZZ 091 ohne Ops GmbH') returning id into v_org2;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited'), (v_org2, v_ed, 'invited');
  insert into person (first_name, last_name) values ('ZZ', 'Ops') returning id into v_ops;
  insert into person_email (person_id, email, is_primary) values (v_ops, 'zz-091-ops@example.org', true);
  insert into org_membership (person_id, org_id, roles) values (v_ops, v_org, '{primary_ops}');
  insert into org_membership (person_id, org_id, roles) values (v_pid, v_org, '{additional}'), (v_pid, v_org2, '{additional}');
  insert into role_assignment (person_id, role, scope_type, scope_id) values
    (v_pid, 'partner_contact', 'org', v_org), (v_pid, 'partner_contact', 'org', v_org2),
    (v_pid, 'standbuehne_editor', 'org', v_org);
  insert into session (event_id, format, title_de, partner_org_id, publish_status, tags)
    values (v_summit, 'talk', 'ZZ 091 Talk', v_org, 'draft', '{}') returning id into v_talk;
  insert into session (event_id, format, title_de, partner_org_id, publish_status, tags)
    values (v_summit, 'panel', 'ZZ 091 Panel', v_org, 'draft', '{}') returning id into v_talk2;
  insert into session (event_id, format, title_de, partner_org_id, publish_status, tags)
    values (v_summit, 'talk', 'ZZ 091 Talk B', v_org2, 'draft', '{}') returning id into v_talk_b;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  if not partner_can_edit(v_org) then raise exception 'VORBEDINGUNG: Konto darf die Organisation nicht bearbeiten'; end if;

  -- 01 Eigener Zugang
  v_p1 := partner_add_speaker(v_talk, 'zz-091-eins@example.org', 'ZZ', 'Eins');
  select count(*)::integer into v_n from speaker_contact where profile_id = v_p1;
  select count(*)::integer into v_m from mail_log ml join speaker_profile sp on sp.person_id = ml.person_id where sp.id = v_p1;
  insert into t_res select '01_eigener_zugang',
    case when sp.pipeline_status = 'lead' and sp.created_by_org_id = v_org and sp.mail_via_contact_id is null and not sp.stage_guest
              and v_n = 0 and v_m = 0
         then 'Profil lead, kein Kontakt, keine Regel, keine Mail (richtig)'
         else 'unerwartet: ' || sp.pipeline_status || ', Kontakte ' || v_n || ', Mails ' || v_m || ', Regel ' || coalesce(sp.mail_via_contact_id::text, 'leer') end
    from speaker_profile sp where sp.id = v_p1;

  -- 02 Verwaltet
  v_p2 := partner_add_speaker(v_talk, 'zz-091-zwei@example.org', 'ZZ', 'Zwei', true);
  select sp.person_id, sp.mail_via_contact_id into v_person2, v_kontakt from speaker_profile sp where sp.id = v_p2;
  select * into v_c from speaker_contact where id = v_kontakt;
  select count(*)::integer into v_n from mail_log where person_id = v_ops and template_key = 'partner_speaker_contact' and related_id = v_p2;
  select count(*)::integer into v_m from mail_log where person_id = v_person2;
  select exists (select 1 from role_assignment where person_id = v_ops and role = 'speaker_assistant' and edition_id = v_ed and valid_to is null) into v_b;
  insert into t_res values ('02_verwaltet',
    case when v_c.kind = 'partner' and v_c.person_id = v_ops and v_c.has_access and v_c.consent_at = current_date
              and v_b and v_n = 1 and v_m = 0 and is_speaker_assistant(v_p2, v_ops)
         then 'Kontakt partner mit Zugang, Rolle, Regel, eine Mail an den Kontakt, keine an den Speaker (richtig)'
         else 'unerwartet: Kontakt ' || coalesce(v_c.kind, 'keiner') || ', Rolle ' || v_b || ', Mails Kontakt ' || v_n || ', Mails Speaker ' || v_m end);

  -- 03 Zweiter Slot für denselben verwalteten Speaker
  perform partner_add_speaker(v_talk2, 'zz-091-zwei@example.org', 'ZZ', 'Zwei', true);
  select count(*)::integer into v_n from speaker_contact where profile_id = v_p2;
  select count(*)::integer into v_m from mail_log where person_id = v_ops and template_key = 'partner_speaker_contact';
  insert into t_res values ('03_zweiter_slot',
    case when v_n = 1 and v_m = 1 and exists (select 1 from session_speaker where session_id = v_talk2 and person_id = v_person2)
         then 'zugeordnet, kein zweiter Kontakt, keine zweite Mail (richtig)' else 'unerwartet: Kontakte ' || v_n || ', Mails ' || v_m end);

  -- 04 Verwaltet für jemanden mit eigenem Zugang
  begin
    perform partner_add_speaker(v_talk2, 'zz-091-eins@example.org', 'ZZ', 'Eins', true);
    insert into t_res values ('04_schon_zugang', 'ALLOWED (BUG): Kommunikation eines Speakers umgeleitet');
  exception
    when sqlstate 'P0001' then insert into t_res values ('04_schon_zugang',
      case when sqlerrm = 'speaker_has_access' and (select mail_via_contact_id from speaker_profile where id = v_p1) is null
           then 'speaker_has_access, Regel bleibt leer (richtig)' else 'P0001 ' || sqlerrm end);
    when others then insert into t_res values ('04_schon_zugang', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 05 Ohne Operations-Kontakt
  begin
    perform partner_add_speaker(v_talk_b, 'zz-091-drei@example.org', 'ZZ', 'Drei', true);
    insert into t_res values ('05_ohne_ops', 'ALLOWED (BUG): verwaltet ohne Operations-Kontakt');
  exception
    when sqlstate 'P0001' then insert into t_res values ('05_ohne_ops',
      case when sqlerrm = 'no_ops_contact' and not exists (select 1 from person_email where email = 'zz-091-drei@example.org')
           then 'no_ops_contact, nichts angelegt (richtig)' else 'P0001 ' || sqlerrm end);
    when others then insert into t_res values ('05_ohne_ops', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 06 Operations-Kontakt als verwalteter Speaker
  begin
    perform partner_add_speaker(v_talk2, 'zz-091-ops@example.org', 'ZZ', 'Ops', true);
    insert into t_res values ('06_ops_als_speaker', 'ALLOWED (BUG)');
  exception
    when sqlstate '23514' then insert into t_res values ('06_ops_als_speaker',
      case when sqlerrm = 'contact_is_speaker' then 'contact_is_speaker (richtig)' else '23514 ' || sqlerrm end);
    when others then insert into t_res values ('06_ops_als_speaker', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 07 Hinweis in der Liste
  select count(*)::integer into v_n from partner_speakers(v_org, v_ed) x where x.profile_id = v_p2 and x.mail_contact_name = 'ZZ Ops';
  select count(*)::integer into v_m from partner_speakers(v_org, v_ed) x where x.profile_id = v_p1 and x.mail_contact_name is not null;
  insert into t_res values ('07_partner_speakers',
    case when v_n >= 1 and v_m = 0 then 'Kontakt nur beim verwalteten Speaker (richtig)' else 'unerwartet: verwaltet ' || v_n || ', eigener ' || v_m end);

  -- 08 Fremdschlüssel: nur Kontakte dieses Profils; Entfernen hebt nur die Regel auf
  begin
    update speaker_profile set mail_via_contact_id = v_kontakt where id = v_p1;
    insert into t_res values ('08a_fremder_kontakt', 'ALLOWED (BUG): Regel zeigt auf Kontakt eines anderen Profils');
  exception
    when sqlstate '23503' then insert into t_res values ('08a_fremder_kontakt', '23503 (richtig)');
    when others then insert into t_res values ('08a_fremder_kontakt', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
  delete from speaker_contact where id = v_kontakt;
  insert into t_res select '08b_kontakt_entfernt',
    case when sp.mail_via_contact_id is null then 'Regel aufgehoben, Profil bleibt (richtig)' else 'unerwartet: Regel steht noch' end
    from speaker_profile sp where sp.id = v_p2;

  -- 09 Gäste: nur noch Standbühne
  insert into person (first_name, last_name) values ('ZZ', 'Gast') returning id into v_gast_person;
  -- Wie `partner_add_stage_guest` (0188): ohne Lounge, Reception, Reisekosten und Hospitality.
  insert into speaker_profile (person_id, edition_id, created_by_org_id, stage_guest, stage_guest_consent_at,
                               partner_editable_until_login, lounge_access)
    values (v_gast_person, v_ed, v_org, true, now(), true, false) returning id into v_gast;
  begin
    perform partner_assign_stage_guest(v_talk, v_gast, true);
    insert into t_res values ('09a_gast_talk', 'ALLOWED (BUG): Gast auf einem Talk');
  exception
    when sqlstate '42501' then insert into t_res values ('09a_gast_talk', '42501 (richtig)');
    when others then insert into t_res values ('09a_gast_talk', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
  insert into session_speaker (session_id, person_id, role, confirmed) values (v_talk, v_gast_person, 'speaker', true);
  begin
    perform partner_assign_stage_guest(v_talk, v_gast, false);
    insert into t_res values ('09b_alt_abnehmen',
      case when not exists (select 1 from session_speaker where session_id = v_talk and person_id = v_gast_person)
           then 'alte Talk-Zuordnung abgenommen (richtig)' else 'unerwartet: Zuordnung steht noch' end);
  exception when others then
    insert into t_res values ('09b_alt_abnehmen', 'BUG: ' || sqlstate || ' ' || sqlerrm);
  end;
  insert into stage (event_id, name, type, partner_org_id, active)
    values (v_summit, 'ZZ 091 Standbühne', 'partner_booth', v_org, true) returning id into v_buehne;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
    values (v_buehne, v_day, (v_datum + time '14:00') at time zone v_tz, (v_datum + time '14:20') at time zone v_tz, 'content', 'open')
    returning id into v_slot;
  insert into session (event_id, slot_id, format, title_de, host_org_id, publish_status, tags)
    values (v_summit, v_slot, 'talk', 'ZZ 091 Stand', v_org, 'draft', '{}') returning id into v_stand;
  begin
    perform partner_assign_stage_guest(v_stand, v_gast, true);
    insert into t_res values ('09c_standbuehne',
      case when exists (select 1 from session_speaker where session_id = v_stand and person_id = v_gast_person)
           then 'Gast auf der Standbühne zugeordnet (richtig)' else 'unerwartet: keine Zuordnung' end);
  exception when others then
    insert into t_res values ('09c_standbuehne', 'VORBEDINGUNG/BUG: ' || sqlstate || ' ' || sqlerrm);
  end;
end $$;

insert into t_res
select '10_signaturen',
       case when to_regprocedure('partner_add_speaker(uuid, text, text, text)') is not null then 'BUG: alte Signatur steht noch'
            when not has_function_privilege('authenticated', 'partner_add_speaker(uuid, text, text, text, boolean)', 'execute')
              or not has_function_privilege('authenticated', 'partner_speakers(uuid, uuid)', 'execute')
              then 'BUG: authenticated darf nicht'
            when has_function_privilege('anon', 'partner_add_speaker(uuid, text, text, text, boolean)', 'execute')
              or has_function_privilege('anon', 'partner_speakers(uuid, uuid)', 'execute')
              then 'ALLOWED (BUG): anon'
            else 'alte Signatur weg, authenticated darf, anon nicht (richtig)' end;

insert into t_res
select '11_stammdaten',
       case when is_vocab_key('speaker_contact_kind', 'partner')
                 and (select count(*) from mail_template where key = 'partner_speaker_contact' and locale in ('de', 'en') and active) = 2
            then 'Vokabular partner, Vorlage DE und EN (richtig)' else 'unerwartet' end;

select * from t_res order by step;
rollback;
