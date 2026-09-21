-- Smoke-Test 0133 (Partner-RPCs „Eure Formate", Welle 6 A1 Teil 2). Belegt:
--   01 ohne gebuchtes Produkt darf niemand ein Side-Event anlegen (P0001 `no_entitlement`);
--   02 mit Produkt geht es, und der Slot trägt die Zeiten (Weg A) — die Session hat keine;
--   03 der Anspruch ist danach aufgebraucht: ein zweites Side-Event wird abgewiesen;
--   04 zwei Gespräche zur selben Zeit am selben Tisch ⇒ P0001 `slot_overlap`, ohne dass die
--      Funktion selbst prüft (der Ausschluss-Constraint tut es — der Gewinn von Weg A);
--   05 am Interview Table zählt der **Tisch**, nicht das Gespräch: ein zweiter Slot geht;
--   06 eine fremde Fläche wird abgewiesen (42501 `stage_not_yours`);
--   07 `format_details` nimmt nur die Schlüssel des jeweiligen Formats …
--   08 … prüft Längen, URL-Form und Vokabular der gesuchten Profile;
--   09 `partner_update_session` ändert nur die Whitelist — Zeiten, Kapazität und Status
--      weist es mit P0001 `not_editable` ab;
--   10 löschen geht, solange niemand zugesagt hat; mit Zusage ⇒ P0001 `slot_locked`;
--   11 Katalogfragen nur, wenn `partner_selectable` — sonst P0001 `question_not_selectable`;
--   12 eine beantragte Frage braucht einen Zweck und ist erst nach Freigabe sichtbar;
--      höchstens zwei je Session;
--   13 `partner_add_speaker` legt Person, Speaker-Profil (`invited`, `partner_editable…`) und
--      die Zuordnung an; ein bestätigter Speaker blockiert (P0001 `slot_locked`);
--   14 alle Helfer sind für `authenticated` gesperrt; fremde Organisation ⇒ 42501;
--   15 Einzelgespräch setzt Kapazität 1, Gruppengespräch nimmt die Angabe (Konrad, D1);
--   16 die Freigabe hebt Session und Slot, eine Ablehnung ohne Grund wird abgewiesen (D2);
--   17 der Export liefert **nur** Bewerbungen mit Einwilligung und protokolliert sich (D3);
--   18 der Datenschutzhinweis existiert in beiden Sprachen und nennt die Zweckbindung.
--
-- Die Auflagen der Architektur-Session vom 21.09. haben vier eigene Schritte:
--   19 **(Auflage 3, Sicherheitsgrenze)** eine per Mailadresse „geclaimte" **bestehende**
--      Person gibt dem Partner **kein** Pflegerecht; nur eine hier neu angelegte;
--   20 **(Auflage 4)** eine Textänderung an einer veröffentlichten Session schickt sie zurück
--      auf `review` und den Slot auf `requested`; `format_details` allein nicht, und derselbe
--      Titel noch einmal gespeichert auch nicht;
--   21 **(Auflage 4)** die zurückgeschickte Session steht in `partner_sessions_pending` —
--      auch als Keynote, denn der Formatfilter dort ist gefallen;
--   22 **(Auflage 6)** `image_asset_id` muss eine UUID sein und eine Datei **dieser**
--      Organisation; die Datei eines fremden Partners wird abgewiesen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_summit uuid; v_day uuid;
  v_org uuid; v_oe uuid; v_fremd uuid;
  v_s3 uuid; v_prof2 uuid; v_flag boolean; v_asset uuid; v_asset_fremd uuid; v_zurueck boolean;
  v_stage_side uuid; v_stage_table uuid; v_stage_fremd uuid;
  v_s1 uuid; v_s2 uuid; v_t1 uuid; v_grp uuid; v_q1 uuid; v_qcat uuid; v_prof uuid;
  v_n integer; v_txt text; v_txt2 text; v_start timestamptz; v_j jsonb; v_person uuid;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_summit from event e where e.edition_id = v_ed and e.slug = 'summit-27';
  select id into v_day from event_day where event_id = v_summit order by sort_order limit 1;
  select (day_date + time '10:00') at time zone 'Europe/Berlin' into v_start from event_day where id = v_day;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- Aufbau: eine Organisation mit Flächen, aber zunächst ohne gebuchtes Produkt.
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  insert into organization (legal_name, communication_name, type) values ('ZZ Formate RPC GmbH', 'ZZRPC', 'corporate') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  insert into organization (legal_name, communication_name, type) values ('ZZ Fremd GmbH', 'ZZFremdF', 'corporate') returning id into v_fremd;
  insert into stage (event_id, name, type, partner_org_id, active) values (v_summit, 'ZZ Side-Ort', 'side_event_venue', v_org, true) returning id into v_stage_side;
  insert into stage (event_id, name, type, partner_org_id, active) values (v_summit, 'ZZ Tisch', 'interview_table', v_org, true) returning id into v_stage_table;
  insert into stage (event_id, name, type, partner_org_id, active) values (v_summit, 'ZZ Fremder Tisch', 'interview_table', v_fremd, true) returning id into v_stage_fremd;
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}');
  delete from role_assignment where person_id = v_pid and role = 'admin';

  -- 01 Ohne Produkt kein Side-Event
  begin
    perform partner_create_session(v_org, 'side_event', v_stage_side, v_day, v_start, v_start + interval '2 hours', 'ZZ Side-Event', 1, '{}'::jsonb, v_ed);
    insert into t_res values ('01_ohne_anspruch', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01_ohne_anspruch', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- Produkt buchen (Side Event I-81745 trägt seit 20260917190103 format_key = side_event)
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  insert into org_product (org_edition_id, product_sku, qty, status) values (v_oe, 'I-81745', 1, 'booked');
  delete from role_assignment where person_id = v_pid and role = 'admin';

  -- 02 Mit Produkt: Session entsteht, Zeiten stehen am Slot
  v_s1 := partner_create_session(v_org, 'side_event', v_stage_side, v_day, v_start, v_start + interval '2 hours',
                                 'ZZ Side-Event', null, jsonb_build_object('location_text', 'ZZ Bar am Hafen'), v_ed);
  select sl.start_at, se.publish_status into v_start, v_txt
    from session se join slot sl on sl.id = se.slot_id where se.id = v_s1;
  insert into t_res values ('02_angelegt_mit_slot',
    case when v_start is not null and v_txt = 'review'
         then 'Slot traegt die Zeit, Session wartet auf Freigabe (richtig)'
         else 'unerwartet ' || coalesce(v_start::text,'ohne Zeit') || '/' || coalesce(v_txt,'?') end);

  -- 03 Anspruch aufgebraucht
  begin
    perform partner_create_session(v_org, 'side_event', v_stage_side, v_day, v_start + interval '4 hours',
                                   v_start + interval '5 hours', 'ZZ Zweites', null, '{}'::jsonb, v_ed);
    insert into t_res values ('03_anspruch_aufgebraucht', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('03_anspruch_aufgebraucht', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 04/05 Interview Table: Tisch zaehlt, Ueberlappung nicht
  v_t1 := partner_create_session(v_org, 'interview_table', v_stage_table, v_day, v_start, v_start + interval '30 minutes',
                                 'ZZ Gespraech 1', 1, jsonb_build_object('job_title', 'ZZ Trainee'), v_ed);
  begin
    perform partner_create_session(v_org, 'interview_table', v_stage_table, v_day, v_start + interval '10 minutes',
                                   v_start + interval '40 minutes', 'ZZ Ueberlappt', 1, '{}'::jsonb, v_ed);
    insert into t_res values ('04_ueberlappung', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('04_ueberlappung', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  begin
    perform partner_create_session(v_org, 'interview_table', v_stage_table, v_day, v_start + interval '1 hour',
                                   v_start + interval '90 minutes', 'ZZ Gespraech 2', 1, '{}'::jsonb, v_ed);
    insert into t_res values ('05_zweiter_slot_am_tisch', 'geht ohne zweites Produkt (richtig)');
  exception when others then insert into t_res values ('05_zweiter_slot_am_tisch', 'ABGEWIESEN (BUG) ' || sqlstate || ' ' || sqlerrm); end;

  -- 06 Fremde Flaeche
  begin
    perform partner_create_session(v_org, 'interview_table', v_stage_fremd, v_day, v_start + interval '3 hours',
                                   v_start + interval '4 hours', 'ZZ Fremd', 1, '{}'::jsonb, v_ed);
    insert into t_res values ('06_fremde_flaeche', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('06_fremde_flaeche', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 07 Falscher Schluessel fuers Format
  begin
    perform partner_update_session(v_s1, jsonb_build_object('format_details', jsonb_build_object('job_title', 'ZZ')));
    insert into t_res values ('07_fremder_schluessel', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('07_fremder_schluessel', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 08 Laenge, URL, Vokabular
  begin
    perform partner_update_session(v_t1, jsonb_build_object('format_details',
      jsonb_build_object('job_posting_url', 'http://unsicher.example')));
    insert into t_res values ('08_url_form', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('08_url_form', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  begin
    perform partner_update_session(v_t1, jsonb_build_object('format_details',
      jsonb_build_object('target_profile', jsonb_build_object('career_level', jsonb_build_array('gibt_es_nicht')))));
    insert into t_res values ('08b_vokabular', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('08b_vokabular', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 09 Whitelist der Felder
  begin
    perform partner_update_session(v_t1, jsonb_build_object('capacity', 9));
    insert into t_res values ('09_kapazitaet_gesperrt', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('09_kapazitaet_gesperrt', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  perform partner_update_session(v_t1, jsonb_build_object('title_de', 'ZZ Neuer Titel', 'description_de', 'ZZ Text'));
  select title_de into v_txt from session where id = v_t1;
  insert into t_res values ('09b_titel_aenderbar',
    case when v_txt = 'ZZ Neuer Titel' then 'geaendert (richtig)' else 'unerwartet ' || coalesce(v_txt,'leer') end);

  -- 10 Loeschen mit und ohne Zusage
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  insert into person (first_name, last_name) values ('ZZ', 'Bewerber') returning id into v_person;
  insert into application (session_id, person_id, status) values (v_t1, v_person, 'accepted');
  delete from role_assignment where person_id = v_pid and role = 'admin';
  begin
    perform partner_delete_session(v_t1);
    insert into t_res values ('10_loeschen_mit_zusage', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('10_loeschen_mit_zusage', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  perform partner_delete_session(v_s1);
  select publish_status into v_txt from session where id = v_s1;
  insert into t_res values ('10b_loeschen_ohne_zusage',
    case when v_txt = 'cancelled' then 'abgesagt (richtig)' else 'unerwartet ' || coalesce(v_txt,'leer') end);

  -- 11 Katalogfragen nur mit Freigabe
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  insert into question_catalog (key, label_de, label_en, type, partner_selectable)
    values ('zz_frage_offen', 'ZZ waehlbar', 'ZZ selectable', 'text', true) returning id into v_qcat;
  insert into question_catalog (key, label_de, label_en, type, partner_selectable)
    values ('zz_frage_zu', 'ZZ nicht waehlbar', 'ZZ not selectable', 'text', false) returning id into v_q1;
  delete from role_assignment where person_id = v_pid and role = 'admin';
  v_n := partner_set_session_questions(v_t1, array[v_qcat]);
  insert into t_res values ('11_katalogfrage',
    case when v_n = 1 then 'waehlbare Frage gesetzt (richtig)' else 'unerwartet ' || v_n end);
  begin
    perform partner_set_session_questions(v_t1, array[v_q1]);
    insert into t_res values ('11b_gesperrte_frage', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('11b_gesperrte_frage', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 12 Antrag braucht Zweck, hoechstens zwei
  begin
    perform partner_request_question(v_t1, 'ZZ Ohne Zweck', null, 'text', null);
    insert into t_res values ('12_antrag_ohne_zweck', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('12_antrag_ohne_zweck', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  perform partner_request_question(v_t1, 'ZZ Frage A', null, 'text', 'ZZ Zweck A');
  perform partner_request_question(v_t1, 'ZZ Frage B', null, 'text', 'ZZ Zweck B');
  begin
    perform partner_request_question(v_t1, 'ZZ Frage C', null, 'text', 'ZZ Zweck C');
    insert into t_res values ('12b_hoechstens_zwei', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('12b_hoechstens_zwei', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  select count(*)::integer into v_n from session_question
   where session_id = v_t1 and question_id is null and approved_at is null;
  insert into t_res values ('12c_antraege_ohne_freigabe',
    case when v_n = 2 then 'zwei beantragt, keine freigegeben (richtig)' else 'unerwartet ' || v_n end);

  -- 13 Talk: Speaker eintragen
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  insert into session (event_id, format, title_de, partner_org_id)
    values (v_summit, 'keynote', 'ZZ Keynote', v_org) returning id into v_s2;
  delete from role_assignment where person_id = v_pid and role = 'admin';
  v_prof := partner_add_speaker(v_s2, 'zz-speaker@example.org', 'ZZ', 'Redner');
  select pipeline_status, partner_editable_until_login, created_by_org_id into v_txt, v_j, v_person
    from (select pipeline_status, to_jsonb(partner_editable_until_login) as partner_editable_until_login, created_by_org_id
            from speaker_profile where id = v_prof) x;
  insert into t_res values ('13_speaker_angelegt',
    case when v_txt = 'invited' and v_j = 'true'::jsonb and v_person = v_org
         then 'invited, partner darf pflegen, Org vermerkt (richtig)'
         else 'unerwartet ' || coalesce(v_txt,'?') || '/' || coalesce(v_j::text,'?') end);

  -- 19 Auflage 3: eine **bestehende** Person, nur per Mailadresse getroffen, gibt dem Partner
  --    kein Pflegerecht. Vorher genuegte die Kenntnis der Adresse, um Stammdaten eines
  --    fremden Menschen pflegen zu duerfen.
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  insert into session (event_id, format, title_de, partner_org_id)
    values (v_summit, 'panel', 'ZZ Panel fuer Bestandsperson', v_org) returning id into v_s3;
  delete from role_assignment where person_id = v_pid and role = 'admin';
  -- Eine Person, die es schon gibt (hier: die Testperson selbst) — der Partner tippt nur ihre Adresse.
  v_prof2 := partner_add_speaker(v_s3, v_email, 'ZZ', 'Egal');
  select partner_editable_until_login, created_by_org_id into v_flag, v_person
    from speaker_profile where id = v_prof2;
  insert into t_res values ('19_bestandsperson_kein_pflegerecht',
    case when v_flag is not true then 'kein Pflegerecht an fremden Stammdaten (richtig)'
         else 'ALLOWED (BUG): geclaimt und pflegbar' end);
  insert into t_res values ('19b_org_trotzdem_vermerkt',
    case when v_person = v_org then 'created_by_org_id gesetzt (richtig — Zuordnung ja, Pflege nein)'
         else 'unerwartet ' || coalesce(v_person::text, 'null') end);

  update session_speaker set confirmed = true where session_id = v_s2;
  begin
    perform partner_add_speaker(v_s2, 'zz-anderer@example.org', 'ZZ', 'Anderer');
    insert into t_res values ('13b_bestaetigter_speaker', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('13b_bestaetigter_speaker', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 15 Einzel- gegen Gruppengespraech (Konrad, D1)
  select capacity into v_n from session where id = v_t1;
  insert into t_res values ('15_einzelgespraech',
    case when v_n = 1 then 'Kapazitaet 1 ohne Angabe (richtig)' else 'unerwartet ' || coalesce(v_n::text,'null') end);
  begin
    v_grp := partner_create_session(v_org, 'interview_table', v_stage_table, v_day,
                                    v_start + interval '2 hours', v_start + interval '150 minutes',
                                    'ZZ Gruppe', 6, jsonb_build_object('interview_mode', 'group'), v_ed);
    select capacity into v_n from session where id = v_grp;
    insert into t_res values ('15b_gruppengespraech',
      case when v_n = 6 then 'Kapazitaet 6 uebernommen (richtig)' else 'unerwartet ' || coalesce(v_n::text,'null') end);
  exception when others then
    insert into t_res values ('15b_gruppengespraech', 'FEHLGESCHLAGEN ' || sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform partner_update_session(v_t1, jsonb_build_object('format_details',
      jsonb_build_object('interview_mode', 'gibt_es_nicht')));
    insert into t_res values ('15c_modus_erfunden', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('15c_modus_erfunden', 'abgewiesen ' || sqlstate); end;

  -- 16 Freigabe (Konrad, D2)
  begin
    perform release_partner_session(v_t1, true, null);
    insert into t_res values ('16_freigabe_ohne_rolle', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('16_freigabe_ohne_rolle', 'abgewiesen ' || sqlstate); end;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  begin
    perform release_partner_session(v_t1, false, null);
    insert into t_res values ('16b_ablehnung_ohne_grund', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('16b_ablehnung_ohne_grund', 'abgewiesen ' || sqlstate); end;
  perform release_partner_session(v_t1, true, null);
  select se.publish_status, sl.status into v_txt, v_txt2
    from session se left join slot sl on sl.id = se.slot_id where se.id = v_t1;
  insert into t_res values ('16c_freigabe',
    case when v_txt = 'published' and v_txt2 = 'final' then 'Session published, Slot final (richtig)'
         else 'unerwartet ' || coalesce(v_txt,'?') || '/' || coalesce(v_txt2,'?') end);
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';

  -- 17 Export (Konrad, D3): nur mit Einwilligung
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  update application set consent_share = false where session_id = v_t1;
  delete from role_assignment where person_id = v_pid and role = 'admin';
  select count(*)::integer into v_n from export_session_applications(v_t1);
  insert into t_res values ('17_export_ohne_einwilligung',
    case when v_n = 0 then 'keine Zeile (richtig)' else 'ALLOWED (BUG): ' || v_n || ' Zeilen' end);
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  update application set consent_share = true where session_id = v_t1;
  delete from role_assignment where person_id = v_pid and role = 'admin';
  select count(*)::integer into v_n from export_session_applications(v_t1);
  insert into t_res values ('17b_export_mit_einwilligung',
    case when v_n = 1 then 'eine Zeile (richtig)' else 'unerwartet ' || v_n end);
  select count(*)::integer into v_n from audit_log
   where action = 'partner.application_export' and object_id = v_t1::text;
  insert into t_res values ('17c_export_protokolliert',
    case when v_n >= 2 then 'jeder Abruf im Protokoll (richtig)' else 'unerwartet ' || v_n end);

  -- 18 Datenschutzhinweis
  insert into t_res values ('18_hinweis_zweisprachig',
    case when export_privacy_notice('de') like '%Zweck%' and export_privacy_notice('en') like '%controller%'
         then 'beide Sprachen mit Zweckbindung (richtig)' else 'FEHLT' end);

  -- 14 Fremde Organisation
  begin
    perform partner_create_session(v_fremd, 'interview_table', v_stage_fremd, v_day, v_start + interval '6 hours',
                                   v_start + interval '7 hours', 'ZZ Fremd', 1, '{}'::jsonb, v_ed);
    insert into t_res values ('14_fremde_org', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('14_fremde_org', 'abgewiesen ' || sqlstate); end;
end $$;

-- 20-22 Auflagen 4 und 6: Freigabe nach Textaenderung, und das Hintergrundbild.
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_summit uuid; v_org uuid; v_oe uuid;
  v_fremd uuid; v_oe_fremd uuid; v_se uuid; v_slot uuid; v_stage uuid; v_day uuid;
  v_asset uuid; v_asset_fremd uuid; v_zurueck boolean; v_txt text; v_n integer; v_start timestamptz;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_summit from event e where e.edition_id = v_ed order by e.start_date limit 1;
  select ed.id into v_day from event_day ed where ed.event_id = v_summit order by ed.sort_order limit 1;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  insert into organization (legal_name) values ('ZZ Auflagen GmbH') returning id into v_org;
  insert into organization (legal_name) values ('ZZ Fremde GmbH') returning id into v_fremd;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_fremd, v_ed, 'invited') returning id into v_oe_fremd;

  -- Eine veroeffentlichte Session mit Slot, wie nach einer Freigabe.
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  -- Pflegerecht kommt aus org_membership, nicht aus role_assignment (`partner_can_edit`).
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}');
  insert into stage (event_id, name, type) values (v_summit, 'ZZ Tisch Auflage', 'interview_table')
    returning id into v_stage;
  select (ed.day_date + time '16:00') at time zone 'Europe/Berlin' into v_start
    from event_day ed where ed.id = v_day;
  insert into slot (stage_id, event_day_id, start_at, end_at, status)
    values (v_stage, v_day, v_start, v_start + interval '30 minutes', 'final')
    returning id into v_slot;
  insert into session (event_id, format, title_de, partner_org_id, slot_id, publish_status)
    values (v_summit, 'interview_table', 'ZZ Vorher', v_org, v_slot, 'published') returning id into v_se;
  -- Zwei Dateien: eine eigene, eine fremde.
  insert into partner_asset (org_edition_id, kind, storage_path, filename)
    values (v_oe, 'logo', 'zz/eigen.png', 'eigen.png') returning id into v_asset;
  insert into partner_asset (org_edition_id, kind, storage_path, filename)
    values (v_oe_fremd, 'logo', 'zz/fremd.png', 'fremd.png') returning id into v_asset_fremd;
  delete from role_assignment where person_id = v_pid and role = 'admin';

  -- 20 Textaenderung schickt zurueck zur Freigabe.
  v_zurueck := partner_update_session(v_se, jsonb_build_object('title_de', 'ZZ Nachher'));
  select publish_status into v_txt from session where id = v_se;
  insert into t_res values ('20_titel_zurueck_zur_freigabe',
    case when v_zurueck and v_txt = 'review' then 'review, Rueckgabe true (richtig)'
         else 'ALLOWED (BUG): ' || coalesce(v_txt, 'null') || ', Rueckgabe ' || coalesce(v_zurueck::text, 'null') end);
  select status into v_txt from slot where id = v_slot;
  insert into t_res values ('20b_slot_wieder_angefragt',
    case when v_txt = 'requested' then 'requested (richtig)' else 'unerwartet ' || coalesce(v_txt, 'null') end);

  -- 21 Und sie steht in der Warteschlange des Teams.
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'partner_team', 'global');
  select count(*)::integer into v_n from partner_sessions_pending(v_ed) q where q.session_id = v_se;
  insert into t_res values ('21_in_der_warteschlange',
    case when v_n = 1 then 'sichtbar (richtig)'
         else 'ALLOWED (BUG): aus dem Programm verschwunden, ohne in der Liste zu stehen' end);
  delete from role_assignment where person_id = v_pid and role = 'partner_team';

  -- 20c Derselbe Titel noch einmal und eine reine format_details-Aenderung schicken **nicht** zurueck.
  update session set publish_status = 'published' where id = v_se;
  update slot set status = 'final' where id = v_slot;
  v_zurueck := partner_update_session(v_se, jsonb_build_object('title_de', 'ZZ Nachher'));
  select publish_status into v_txt from session where id = v_se;
  insert into t_res values ('20c_gleicher_titel_bleibt',
    case when not v_zurueck and v_txt = 'published' then 'bleibt veroeffentlicht (richtig)'
         else 'unerwartet ' || coalesce(v_txt, 'null') end);
  v_zurueck := partner_update_session(v_se, jsonb_build_object(
    'format_details', jsonb_build_object('job_title', 'ZZ Stelle')));
  select publish_status into v_txt from session where id = v_se;
  insert into t_res values ('20d_format_details_ohne_freigabe',
    case when not v_zurueck and v_txt = 'published' then 'bleibt veroeffentlicht (richtig — D2 meint das Programm)'
         else 'unerwartet ' || coalesce(v_txt, 'null') end);

  -- 22 Auflage 6: das Hintergrundbild.
  begin
    perform partner_update_session(v_se, jsonb_build_object(
      'format_details', jsonb_build_object('image_asset_id', 'kein-uuid')));
    insert into t_res values ('22_bild_form', 'ALLOWED (BUG): Freitext als Bild-ID');
  exception when sqlstate '22023' then
    insert into t_res values ('22_bild_form', '22023 bei Freitext (richtig)');
  end;
  begin
    perform partner_update_session(v_se, jsonb_build_object(
      'format_details', jsonb_build_object('image_asset_id', v_asset_fremd::text)));
    insert into t_res values ('22b_fremde_datei', 'ALLOWED (BUG): fremder Upload im eigenen Programmpunkt');
  exception when sqlstate '22023' then
    insert into t_res values ('22b_fremde_datei', '22023 bei fremder Datei (richtig)');
  end;
  perform partner_update_session(v_se, jsonb_build_object(
    'format_details', jsonb_build_object('image_asset_id', v_asset::text)));
  select format_details->>'image_asset_id' into v_txt from session where id = v_se;
  insert into t_res values ('22c_eigene_datei',
    case when v_txt = v_asset::text then 'eigene Datei uebernommen (richtig)'
         else 'unerwartet ' || coalesce(v_txt, 'null') end);
end $$;

-- 14b Helfer nicht fuer die API
insert into t_res
select '14b_helfer_gesperrt',
       case when has_function_privilege('authenticated', 'partner_entitlement(uuid, text)', 'execute')
              or has_function_privilege('authenticated', 'check_format_details(text, jsonb, uuid)', 'execute')
              or has_function_privilege('authenticated', 'format_detail_keys(text)', 'execute')
              or has_function_privilege('authenticated', 'session_needs_release(uuid)', 'execute')
            then 'ALLOWED (BUG)' else 'alle vier gesperrt (richtig)' end;

select * from t_res order by step;
rollback;
