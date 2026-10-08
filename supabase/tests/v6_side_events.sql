-- Smoke-Test v6_side_events (Vorschlag, ADM-077 / SPK-091, Plan-Auflagen 05.10.2026): aus der Reception wird eine Einladungsliste.
-- Mit echtem Rollenwechsel (Team ⇄ Speaker ⇄ service_role); vor jedem Abschnitt steht, wer handelt.
--   01 Form: drei Tabellen ohne Grants und mit RLS, die sieben alten Funktionen sind weg, Abschnitt `sideEvents` für drei Rollen (`reception`
--      für keine), Vokabular, Prüfregeln (Status, Begleitung, Token-Form, Token eindeutig), EXECUTE-Rechte (nur der Link-Weg ist service_role).
--   02 Team legt an: Pflichtfelder, Kapazität > 0, Ende nicht vor Beginn, Teilupdate lässt Unerwähntes stehen, die Edition eines bestehenden
--      Events ist nicht überschreibbar; als Speaker (keine Rolle) sind alle fünf Team-Funktionen 42501, ohne Anmeldung 28000.
--   03 Einladen: nur bestätigte Speaker (kein Gast, keine gelöschte Person), Duplikate zählen einmal; eine Zeile `invited` mit Hash (nie Klartext),
--      eine wartende Mail je Einladung (Token passt zum Hash); nicht veröffentlicht ⇒ `side_event_not_published`; doppelte Einladung ohne Resend
--      wird übersprungen; Resend **ersetzt** den Token in der wartenden Mail (keine zweite); nach dem Versand kommt eine neue; unterdrückte Adresse
--      ⇒ `no_mail`, Token nicht im Protokoll. Audit ohne E-Mail und ohne Token.
--   04 Speaker (keine Rolle): ohne Einladung **nichts sichtbar** (veröffentlichtes Event ohne Einladung, Entwurf mit Einladung), Antwort darauf
--      ⇒ `side_event_not_invited`/`side_event_not_found`; Zusage mit Begleitung, Hinweis nie im Audit, Statusprüfung, Begleitung 0–3, Hinweis ≤ 500;
--      eigene Plätze zählen beim Ändern nicht mit; Absage gibt Plätze frei und bleibt als Zeile; Assistenz sieht, antwortet aber nicht (42501);
--      nach der Antwortfrist ⇒ `side_event_closed` und `closed=true`.
--   05 Team von Hand: Zeile neu angelegt (via team), `invited` setzt die Antwortzeit zurück, Begleitung 0–3, Hinweis ≤ 500, Gäste/Unbestätigte
--      ⇒ `not_eligible`; Audit mit person_id, ohne E-Mail.
--   06 Der Link (service_role): Lesen **ändert nichts**; Antwort der Seite enthält nur Event-Daten (keine Person); Zusage setzt via=email, Audit mit
--      person_id und Antwortzeit, ohne Adresse und ohne Token; **idempotent**; Kapazität zählt nur Zusagen plus Begleitung (`full` schreibt nichts,
--      Absage gibt den Platz frei, auch das Team stößt an die Grenze); unbekannt/zu kurz/falsche Zeichen/falscher Status ⇒ `invalid`; abgelaufen
--      (Eventbeginn) und unveröffentlicht ⇒ `invalid`; Antwortfrist ⇒ `closed`; ein angemeldeter Nutzer ⇒ 42501; Ratenbegrenzung je Quelle (60/h),
--      Versuche werden gezählt, alte weggeräumt; ohne gültige Quelle ⇒ `invalid`; der alte Token ist nach dem Resend tot.
--   07 Admin-Übersicht: Zahlen je Event; **mit** Event-Id zusätzlich die Einladungen mit Namen, ohne Event-Id keine Namen.
--   08 Löschweg: `anonymize_person` leert Hinweis und Token-Hash, lässt Status und Anzahl stehen; ein anderer Speaker bleibt unberührt; der Link ist tot.
--   09 Löschen: mit Zusagen ⇒ `has_guests`, sonst weg samt Einladungen, Audit ohne E-Mail.
begin;
create temp table t_res (step text, result text) on commit drop;
-- Erwartung je Schritt als Muster: `99_auswertung` am Ende sagt „ok“ oder nennt die Schritte, die abweichen. Negativfälle
-- schreiben außerdem selbst `ALLOWED (BUG)`, wenn etwas durchgeht, das nicht darf.
create temp table t_erw (step text, muster text) on commit drop;
insert into t_erw values
  ('01_tabellen_ohne_grants', '^side_event=false/false side_event_attempt=false/false side_event_invite=false/false rls=true/true/true$'),
  ('01_umbenannt', '^alt weg=true side_event_id=true reception_id=false$'),
  ('01_alte_funktionen_weg', '^0 von 7 noch da$'),
  ('01_abschnitt_umgezogen', '^sideEvents=admin,area_lead_speaker,programme_team reception=-$'),
  ('01_vokabular', '^invited,yes,no$'),
  ('01_pruefregeln', '^status=23514 guests=23514 via=23514 token_form=23514$'),
  ('01_execute_rechte', '^my_side_events=false/true side_events_admin=false/true upsert_side_event=false/true delete_side_event=false/true respond_side_event=false/true invite_to_side_event=false/true set_side_event_status=false/true side_event_taken=false/false link=false/false/true$'),

  ('02_anlegen', '^published=true capacity=3 created_by_ich=true edition_ok=true$'),
  ('02_pflichtfelder', '^rejected 22023 fields_required detail=title_de, title_en, location, starts_at$'),
  ('02_kapazitaet_0', '^rejected 22023 invalid_side_event detail=capacity:0$'),
  ('02_ende_vor_beginn', '^rejected 22023 invalid_side_event detail=ends_at$'),
  ('02_teilupdate', '^location=Neuer Ort title=ZZ Side Event capacity=3 published=true$'),
  ('02_edition_nicht_ueberschreibbar', '^edition_unveraendert=true$'),
  ('02_audit_angelegt', '^[1-9][0-9]* Eintraege ohne_email=true$'),
  ('02_upsert_als_speaker', '^rejected 42501'),
  ('02_loeschen_als_speaker', '^rejected 42501'),
  ('02_einladen_als_speaker', '^rejected 42501'),
  ('02_status_als_speaker', '^rejected 42501'),
  ('02_uebersicht_als_speaker', '^rejected 42501'),
  ('02_ohne_anmeldung', '^rejected 28000 not authenticated'),

  ('03_einladen', '^invited=3 resent=0 skipped=4 nur_not_eligible=true no_mail=0$'),
  ('03_einladung_zeile', '^invited via=team hash64=true von_mir=true mailed=true ohne_antwort=true guests=0$'),
  ('03_mails_wartend', '^3 wartend token_form=true hash_passt=true related=true$'),
  ('03_token_nirgends_im_klartext', '^3 Tokens in_einladung=0 im_audit=0$'),
  ('03_audit_eingeladen', '^3 Eintraege person_id=true ohne_email=true$'),
  ('03_nicht_veroeffentlicht', '^rejected P0001 side_event_not_published'),
  ('03_leere_liste', '^rejected 22023 fields_required detail=profile_ids$'),
  ('03_zu_viele', '^rejected 22023 invalid_side_event detail=profile_ids:201$'),
  ('03_entwurf_von_hand', '^invited$'),
  ('03_nochmal_ohne_resend', '^invited=0 resent=0 grund=already_invited mails_s1=1$'),
  ('03_resend_wartende_mail', '^resent=1 neuer_hash=true mails_s1=1 wartende_mail_traegt_neuen_token=true alter_token_ungleich=true$'),
  ('03_resend_nach_versand', '^resent=1 mails=2 wartend=1 versendete_ohne_token=true neuer_token_passt=true$'),
  ('03_unterdrueckte_adresse', '^invited=1 no_mail=1 mail=suppressed token_im_protokoll=false token_hash_leer=true mailed_at_leer=true$'),

  ('04_nur_eingeladene_sichtbar', '^1 Zeile\(n\) ZZ Side Event status=invited taken=0 free=3 closed=false$'),
  ('04_nicht_eingeladen_antwort', '^rejected P0001 side_event_not_invited detail=not_invited$'),
  ('04_entwurf_antwort', '^rejected P0002 side_event_not_found'),
  ('04_zusage_mit_begleitung', '^yes guests=1 taken=2$'),
  ('04_zeile_nach_zusage', '^via=portal ohne_antwortzeit=false note=true$'),
  ('04_audit_antwort', '^person_id=true status=yes guests=1 via=portal ohne_hinweis=true ohne_email=true$'),
  ('04_status_maybe', '^rejected 22023 invalid_side_event detail=status:maybe$'),
  ('04_status_invited', '^rejected 22023 invalid_side_event detail=status:invited$'),
  ('04_begleitung_4', '^rejected 22023 invalid_side_event detail=guests:4$'),
  ('04_begleitung_minus_1', '^rejected 22023 invalid_side_event detail=guests:-1$'),
  ('04_hinweis_zu_lang', '^rejected 22023 too_long detail=note$'),
  ('04_eigene_plaetze_zaehlen_nicht', '^yes guests=2 taken=3$'),
  ('04_zu_viele_fuer_kapazitaet', '^rejected P0001 side_event_full detail=3$'),
  ('04_absage_gibt_plaetze_frei', '^no guests=0 taken=0 zeilen=1 my_status=no$'),
  ('04_wieder_zusagen', '^yes guests=1 taken=2$'),
  ('04_assistenz_sieht', '^1 Zeile\(n\) ZZ Side Event 4$'),
  ('04_assistenz_antwortet_nicht', '^rejected 42501'),
  ('04_nach_antwortfrist', '^rejected P0001 side_event_closed detail=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}$'),
  ('04_nach_antwortfrist_closed_true', '^closed=true my_status=yes$'),

  ('05_von_hand_neue_zeile', '^no guests=0 via=team invited_by_mir=true mit_antwortzeit=true$'),
  ('05_invited_setzt_antwort_zurueck', '^invited ohne_antwortzeit=true$'),
  ('05_zusage_mit_begleitung_unbegrenzt', '^yes guests=3 taken=4$'),
  ('05_hinweis_setzen_lassen_loeschen', '^gesetzt=Hinweis A unveraendert=Hinweis A geloescht=NULL$'),
  ('05_begleitung_4', '^rejected 22023 invalid_side_event detail=guests:4$'),
  ('05_status_maybe', '^rejected 22023 invalid_side_event detail=status:maybe$'),
  ('05_status_null', '^rejected 22023 invalid_side_event detail=status:null$'),
  ('05_hinweis_zu_lang', '^rejected 22023 too_long detail=note$'),
  ('05_nicht_bestaetigt', '^rejected P0001 not_eligible detail=side_event$'),
  ('05_stage_guest', '^rejected P0001 not_eligible detail=side_event$'),
  ('05_profil_fehlt', '^rejected P0001 not_eligible detail=side_event$'),
  ('05_audit_status_gesetzt', '^[1-9][0-9]* Eintraege person_id=true via=team ohne_email=true$'),

  ('06_lesen_aendert_nichts', '^ok status=yes event=ZZ Side Event audit_gleich=true antwort_gleich=true$'),
  ('06_keine_personendaten', '^event,state,status \| address,ends_at,location,starts_at,title_de,title_en keine_person_im_text=true$'),
  ('06_zusage', '^ok status=yes via=email guests=0 antwortzeit=true$'),
  ('06_audit_link', '^person_id=true via=email antwortzeit=true ohne_email=true ohne_token=true$'),
  ('06_idempotent', '^ok status=yes audit_gleich=true$'),
  ('06_voll_schreibt_nichts', '^full status=invited zeile_unveraendert=true$'),
  ('06_team_stoesst_an_grenze', '^rejected P0001 side_event_full detail=0$'),
  ('06_absage_gibt_platz_frei', '^ok status=no guests=0 taken=2$'),
  ('06_danach_passt_es', '^ok status=yes taken=3$'),
  ('06_unbekannt_kurz_zeichen_null', '^invalid/invalid/invalid/invalid$'),
  ('06_falscher_status', '^invalid/invalid$'),
  ('06_abgelaufen', '^invalid/invalid status_unveraendert=invited$'),
  ('06_unveroeffentlicht', '^invalid wieder_sichtbar=ok$'),
  ('06_antwortfrist', '^closed status=yes/closed status_unveraendert=yes$'),
  ('06_als_angemeldeter_nutzer', '^rejected 42501'),
  ('06_ratenbegrenzung', '^rate_limited versuche_gleich=true andere_quelle=ok$'),
  ('06_versuche_gezaehlt', '^\+1/\+1 je Aufruf$'),
  ('06_alte_versuche_weg', '^0 alte$'),
  ('06_quelle_ohne_form', '^invalid/invalid$'),
  ('06_alter_token_tot', '^invalid neuer_token=ok$'),

  ('07_zahlen_je_event', '^taken=3 yes=2 no=1 offen=0 eingeladen=3 invites_null=true$'),
  ('07_modus_a_ohne_namen', '^namen_im_text=false$'),
  ('07_modus_b_mit_namen', '^1 Event 3 Einladungen namen=true zusagen_zuerst=true note_key=true$'),
  ('07_modus_b_ueber_event_id', '^edition_gefunden=true$'),

  ('08_hinweis_und_token_weg', '^note=NULL token=NULL status=yes guests=0 vorher_hinweis_und_token=true$'),
  ('08_anderer_speaker_unberuehrt', '^note=bleibt token=true status=no$'),
  ('08_link_tot', '^invalid$'),

  ('09_loeschen_mit_zusagen', '^rejected 22023 invalid_side_event detail=has_guests:2$'),
  ('09_loeschen_ohne_zusagen', '^geloescht einladungen_danach=0 audit=1 ohne_email=true$'),
  ('09_loeschen_fehlt', '^rejected P0002 side_event_not_found');

-- Hilfen: Abweisung als Text; Antwort des Links als Kurztext; neuer Speaker mit Person, Adresse und Profil.
create function pg_temp.abgewiesen(p_sql text) returns text language plpgsql as $$
declare v_detail text;
begin
  execute p_sql;
  return 'ALLOWED (BUG)';
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return 'rejected ' || sqlstate || ' ' || sqlerrm || ' detail=' || coalesce(v_detail, '-');
end $$;

create function pg_temp.kurz(j jsonb) returns text language sql as $$
  select (j ->> 'state') || coalesce(' status=' || (j ->> 'status'), '') || coalesce(' event=' || (j -> 'event' ->> 'title_de'), '')
$$;

create function pg_temp.neuer_speaker(p_ed uuid, p_by uuid, p_nachname text, p_status text default 'confirmed') returns uuid language plpgsql as $$
declare v_p uuid; v_sp uuid;
begin
  insert into person (first_name, last_name) values ('ZZ', p_nachname) returning id into v_p;
  insert into person_email (person_id, email, is_primary) values (v_p, 'zz-se-' || lower(p_nachname) || '-' || v_p::text || '@example.com', true);
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at, created_by)
    values (v_p, p_ed, 'panelist', p_status, case when p_status = 'lead' then null else now() end, p_by) returning id into v_sp;
  return v_sp;
end $$;

do $$
declare
  v_ed uuid; v_pid uuid; v_uid uuid; v_email text; v_claims_team text; v_claims_service text;
  v_s1 uuid; v_s2 uuid; v_s3 uuid; v_s4 uuid; v_sg uuid; v_sd uuid; v_s5 uuid; v_s6 uuid; v_s7 uuid;
  v_p2 uuid; v_p3 uuid; v_p6 uuid; v_org uuid; v_gast_person uuid;
  v_e1 uuid; v_e2 uuid; v_e4 uuid; v_e5 uuid; v_start timestamptz;
  v_j jsonb; v_a jsonb; v_b jsonb; v_n integer; v_m integer; v_s text; v_ok boolean;
  v_t1 text; v_t1_alt text; v_t2 text; v_t3 text; v_t6 text; v_h_alt text; v_h_neu text; v_ip text; v_ip2 text; v_q text; v_audit_n integer;
  v_zeile jsonb; v_zeile2 jsonb;
begin
  -- Eine Testperson mit Konto, die in der Edition noch **kein** Speaker-Profil hat (sonst hinge der Test am Bestand).
  select e.id into v_ed from event e where e.is_edition order by e.start_date desc limit 1;
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null
     and not exists (select 1 from speaker_profile sp where sp.person_id = p.id and sp.edition_id = v_ed)
   limit 1;
  if v_pid is null then raise exception 'Testvoraussetzung: eine Person mit Konto ohne Speaker-Profil in der jüngsten Edition fehlt'; end if;
  v_claims_team := json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text;
  v_claims_service := json_build_object('role', 'service_role')::text;
  perform set_config('request.jwt.claims', v_claims_team, true);
  delete from role_assignment where person_id = v_pid;
  update person set first_name = 'ZZ', last_name = 'Speakerin' where id = v_pid;
  v_start := now() + interval '30 days';
  v_ip  := repeat('a', 64);
  v_ip2 := repeat('b', 64);

  -- === 01 · Form (als Owner) =====================================================================================
  insert into t_res values ('01_tabellen_ohne_grants',
    (select string_agg(t || '=' || has_table_privilege('anon', t, 'select, insert, update, delete')::text || '/' || has_table_privilege('authenticated', t, 'select, insert, update, delete')::text, ' ' order by t)
       from unnest(array['side_event', 'side_event_attempt', 'side_event_invite']) t)
    || ' rls=' || (select string_agg(c.relrowsecurity::text, '/' order by c.relname) from pg_class c where c.relname in ('side_event', 'side_event_attempt', 'side_event_invite') and c.relkind = 'r'));
  insert into t_res values ('01_umbenannt',
    'alt weg=' || (to_regclass('speaker_reception') is null and to_regclass('speaker_reception_rsvp') is null)::text
    || ' side_event_id=' || exists (select 1 from information_schema.columns where table_name = 'side_event_invite' and column_name = 'side_event_id')::text
    || ' reception_id=' || exists (select 1 from information_schema.columns where table_name = 'side_event_invite' and column_name = 'reception_id')::text);
  insert into t_res values ('01_alte_funktionen_weg',
    (select count(*)::text || ' von 7 noch da' from unnest(array['my_receptions(uuid)', 'set_reception_rsvp(uuid,text,integer,text)', 'receptions_admin(uuid)',
      'reception_guests(uuid)', 'upsert_reception(jsonb)', 'delete_reception(uuid)', 'reception_taken(uuid)']) f where to_regprocedure(f) is not null));
  insert into t_res values ('01_abschnitt_umgezogen',
    'sideEvents=' || (select coalesce(string_agg(role, ',' order by role), '-') from admin_section_role where section = 'sideEvents')
    || ' reception=' || (select coalesce(string_agg(role, ',' order by role), '-') from admin_section_role where section = 'reception'));
  insert into t_res values ('01_vokabular', (select string_agg(key, ',' order by sort_order) from vocab_term where vocabulary = 'side_event_status'));
  -- Prüfregeln: je ein Direktzugriff, der scheitern muss (Fixtures kommen weiter unten; hier genügt eine Zeile, die es gibt oder nicht — daher in 06/10 nochmal mit Daten)

  -- === 02 · Team legt an ==========================================================================================
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_speaker', 'global');
  v_e1 := upsert_side_event(jsonb_build_object('edition_id', v_ed, 'title_de', 'ZZ Side Event', 'title_en', 'ZZ Side Event EN', 'location', 'Elbphilharmonie',
            'address', 'Platz der Deutschen Einheit 4', 'starts_at', v_start, 'ends_at', v_start + interval '2 hours', 'capacity', 3, 'published', true,
            'description_de', 'Beschreibung'));
  v_e2 := upsert_side_event(jsonb_build_object('title_de', 'ZZ Entwurf', 'title_en', 'ZZ Draft', 'location', 'Irgendwo', 'starts_at', v_start + interval '1 day', 'published', false));
  v_e4 := upsert_side_event(jsonb_build_object('title_de', 'ZZ Side Event 4', 'title_en', 'ZZ Side Event 4 EN', 'location', 'Hafen', 'starts_at', v_start + interval '2 days',
            'ends_at', v_start + interval '2 days 3 hours', 'published', true));
  v_e5 := upsert_side_event(jsonb_build_object('title_de', 'ZZ Side Event 5', 'title_en', 'ZZ Side Event 5 EN', 'location', 'Speicherstadt', 'starts_at', v_start + interval '3 days',
            'ends_at', v_start + interval '3 days 2 hours', 'published', true));
  insert into t_res values ('02_anlegen', (select 'published=' || published::text || ' capacity=' || capacity::text || ' created_by_ich=' || (created_by = v_pid)::text || ' edition_ok=' || (edition_id = v_ed)::text
                                              from side_event where id = v_e1));
  insert into t_res values ('02_pflichtfelder', pg_temp.abgewiesen(format('select upsert_side_event(%L::jsonb)', '{"title_de":"x"}')));
  insert into t_res values ('02_kapazitaet_0', pg_temp.abgewiesen(format('select upsert_side_event(%L::jsonb)', jsonb_build_object('title_de', 'x', 'title_en', 'x', 'location', 'x', 'starts_at', v_start, 'capacity', 0)::text)));
  insert into t_res values ('02_ende_vor_beginn', pg_temp.abgewiesen(format('select upsert_side_event(%L::jsonb)', jsonb_build_object('title_de', 'x', 'title_en', 'x', 'location', 'x', 'starts_at', v_start, 'ends_at', v_start - interval '1 day')::text)));
  perform upsert_side_event(jsonb_build_object('id', v_e1, 'location', 'Neuer Ort'));
  insert into t_res values ('02_teilupdate', (select 'location=' || location || ' title=' || title_de || ' capacity=' || capacity::text || ' published=' || published::text from side_event where id = v_e1));
  perform upsert_side_event(jsonb_build_object('id', v_e1, 'edition_id', gen_random_uuid()));
  insert into t_res values ('02_edition_nicht_ueberschreibbar', 'edition_unveraendert=' || (select (edition_id = v_ed)::text from side_event where id = v_e1));
  insert into t_res values ('02_audit_angelegt', (select count(*)::text || ' Eintraege ohne_email=' || bool_and(not (coalesce(after::text, '') ~ '@'))::text from audit_log where action = 'side_event.saved' and object_id = v_e1::text));

  -- Fixtures: weitere Speaker (alle mit Adresse, damit die Mail ankommt)
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at, created_by)
    values (v_pid, v_ed, 'panelist', 'confirmed', now(), v_pid) returning id into v_s1;
  v_s2 := pg_temp.neuer_speaker(v_ed, v_pid, 'Zwei');
  v_s3 := pg_temp.neuer_speaker(v_ed, v_pid, 'Drei');
  v_s4 := pg_temp.neuer_speaker(v_ed, v_pid, 'Vier', 'lead');
  v_s5 := pg_temp.neuer_speaker(v_ed, v_pid, 'Fuenf');
  v_s6 := pg_temp.neuer_speaker(v_ed, v_pid, 'Sechs');
  v_s7 := pg_temp.neuer_speaker(v_ed, v_pid, 'Sieben');
  v_sd := pg_temp.neuer_speaker(v_ed, v_pid, 'Geloescht');
  select person_id into v_p2 from speaker_profile where id = v_s2;
  select person_id into v_p3 from speaker_profile where id = v_s3;
  select person_id into v_p6 from speaker_profile where id = v_s6;
  update person set deleted_at = now() where id = (select person_id from speaker_profile where id = v_sd);
  update speaker_profile set assistant_person_id = v_pid where id = v_s7;
  -- Fünf hat eine gesperrte Adresse: die Mail wird unterdrückt
  insert into suppression (email_hash, reason) select email_hash(pe.email::text), 'test' from person_email pe join speaker_profile sp on sp.person_id = pe.person_id where sp.id = v_s5;
  -- Ein Gast der Standbühne (Regel `speaker_profile_stage_guest_chk`: ohne Lounge, Reception, Reisekosten, Hospitality; von einer Organisation; mit Einwilligung)
  insert into person (first_name, last_name) values ('ZZ', 'Gast') returning id into v_gast_person;
  insert into person_email (person_id, email, is_primary) values (v_gast_person, 'zz-gast-' || v_gast_person::text || '@example.com', true);
  insert into organization (legal_name) values ('ZZ Gast GmbH') returning id into v_org;
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at, stage_guest, lounge_access, reception_eligible, travel_costs_covered,
                               hospitality_status, created_by_org_id, stage_guest_consent_at, created_by)
    values (v_gast_person, v_ed, 'panelist', 'confirmed', now(), true, false, false, false, 'none', v_org, now(), v_pid) returning id into v_sg;

  -- Ohne Rolle: alle fünf Team-Funktionen gesperrt (die Testperson ist jetzt Speakerin, nicht Team)
  delete from role_assignment where person_id = v_pid;
  insert into t_res values ('02_upsert_als_speaker', pg_temp.abgewiesen(format('select upsert_side_event(%L::jsonb)', jsonb_build_object('title_de', 'x', 'title_en', 'x', 'location', 'x', 'starts_at', v_start)::text)));
  insert into t_res values ('02_loeschen_als_speaker', pg_temp.abgewiesen(format('select delete_side_event(%L)', v_e1)));
  insert into t_res values ('02_einladen_als_speaker', pg_temp.abgewiesen(format('select invite_to_side_event(%L, array[%L]::uuid[])', v_e1, v_s2)));
  insert into t_res values ('02_status_als_speaker', pg_temp.abgewiesen(format('select set_side_event_status(%L, %L, %L)', v_e1, v_s2, 'yes')));
  insert into t_res values ('02_uebersicht_als_speaker', pg_temp.abgewiesen(format('select * from side_events_admin(%L)', v_ed)));
  perform set_config('request.jwt.claims', '', true);
  insert into t_res values ('02_ohne_anmeldung', pg_temp.abgewiesen('select * from my_side_events()'));
  perform set_config('request.jwt.claims', v_claims_team, true);

  -- === 03 · Einladen (Team) =======================================================================================
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_speaker', 'global');
  -- Duplikate zählen einmal; Lead, Gast, gelöschte Person und eine unbekannte Id werden übersprungen
  v_j := invite_to_side_event(v_e1, array[v_s1, v_s1, v_s2, v_s3, v_s4, v_sg, v_sd, gen_random_uuid()]);
  insert into t_res values ('03_einladen', 'invited=' || (v_j ->> 'invited') || ' resent=' || (v_j ->> 'resent') || ' skipped=' || jsonb_array_length(v_j -> 'skipped')::text
    || ' nur_not_eligible=' || (select bool_and(x ->> 'reason' = 'not_eligible') from jsonb_array_elements(v_j -> 'skipped') x)::text
    || ' no_mail=' || jsonb_array_length(v_j -> 'no_mail')::text);
  insert into t_res values ('03_einladung_zeile', (select i.status || ' via=' || i.via || ' hash64=' || (i.token_hash ~ '^[0-9a-f]{64}$')::text || ' von_mir=' || (i.invited_by = v_pid)::text
    || ' mailed=' || (i.mailed_at is not null)::text || ' ohne_antwort=' || (i.responded_at is null)::text || ' guests=' || i.guests::text
    from side_event_invite i where i.side_event_id = v_e1 and i.profile_id = v_s1));
  insert into t_res values ('03_mails_wartend', (select count(*)::text || ' wartend token_form=' || bool_and((m.meta -> 'vars' ->> 'side_event_token') ~ '^[A-Za-z0-9_-]{43}$')::text
    || ' hash_passt=' || bool_and(encode(extensions.digest(m.meta -> 'vars' ->> 'side_event_token', 'sha256'), 'hex') = i.token_hash)::text
    || ' related=' || bool_and(m.related_type = 'side_event')::text
    from mail_log m
    join speaker_profile sp on sp.person_id = m.person_id and sp.edition_id = v_ed
    join side_event_invite i on i.profile_id = sp.id and i.side_event_id = v_e1
   where m.template_key = 'side_event_invitation' and m.related_id = v_e1 and m.status = 'queued'));
  insert into t_res values ('03_token_nirgends_im_klartext', (select count(*)::text || ' Tokens in_einladung='
    || count(*) filter (where exists (select 1 from side_event_invite i where position(t.token in i::text) > 0))::text
    || ' im_audit=' || count(*) filter (where exists (select 1 from audit_log a where position(t.token in coalesce(a.after::text, '') || coalesce(a.before::text, '')) > 0))::text
    from (select m.meta -> 'vars' ->> 'side_event_token' as token from mail_log m where m.template_key = 'side_event_invitation' and m.related_id = v_e1 and m.status = 'queued') t));
  insert into t_res values ('03_audit_eingeladen', (select count(*)::text || ' Eintraege person_id=' || bool_and((a.after ->> 'person_id') is not null)::text || ' ohne_email=' || bool_and(not (a.after::text ~ '@'))::text
    from audit_log a where a.action = 'side_event.invited' and a.object_id = v_e1::text));
  insert into t_res values ('03_nicht_veroeffentlicht', pg_temp.abgewiesen(format('select invite_to_side_event(%L, array[%L]::uuid[])', v_e2, v_s1)));
  insert into t_res values ('03_leere_liste', pg_temp.abgewiesen(format('select invite_to_side_event(%L, array[]::uuid[])', v_e1)));
  insert into t_res values ('03_zu_viele', pg_temp.abgewiesen(format('select invite_to_side_event(%L, %L::uuid[])', v_e1, (select array_agg(gen_random_uuid()) from generate_series(1, 201)))));
  -- Das Team darf Einladungen zum Entwurf vorbereiten (von Hand), sichtbar wird er für den Speaker erst mit der Veröffentlichung
  insert into t_res values ('03_entwurf_von_hand', (set_side_event_status(v_e2, v_s1, 'invited') ->> 'status'));
  v_j := invite_to_side_event(v_e1, array[v_s1]);
  insert into t_res values ('03_nochmal_ohne_resend', 'invited=' || (v_j ->> 'invited') || ' resent=' || (v_j ->> 'resent') || ' grund=' || (v_j -> 'skipped' -> 0 ->> 'reason')
    || ' mails_s1=' || (select count(*)::text from mail_log where template_key = 'side_event_invitation' and related_id = v_e1 and person_id = v_pid));
  -- Resend: die wartende Mail bekommt den neuen Token, es entsteht keine zweite
  select token_hash into v_h_alt from side_event_invite where side_event_id = v_e1 and profile_id = v_s1;
  select meta -> 'vars' ->> 'side_event_token' into v_t1_alt from mail_log where template_key = 'side_event_invitation' and related_id = v_e1 and person_id = v_pid and status = 'queued';
  v_j := invite_to_side_event(v_e1, array[v_s1], true);
  select token_hash into v_h_neu from side_event_invite where side_event_id = v_e1 and profile_id = v_s1;
  select meta -> 'vars' ->> 'side_event_token' into v_t1 from mail_log where template_key = 'side_event_invitation' and related_id = v_e1 and person_id = v_pid and status = 'queued';
  insert into t_res values ('03_resend_wartende_mail', 'resent=' || (v_j ->> 'resent') || ' neuer_hash=' || (v_h_neu <> v_h_alt)::text
    || ' mails_s1=' || (select count(*)::text from mail_log where template_key = 'side_event_invitation' and related_id = v_e1 and person_id = v_pid)
    || ' wartende_mail_traegt_neuen_token=' || (encode(extensions.digest(v_t1, 'sha256'), 'hex') = v_h_neu)::text || ' alter_token_ungleich=' || (v_t1 <> v_t1_alt)::text);
  -- Nach dem Versand (der Versand entfernt den Token aus dem Protokoll) kommt bei einem Resend eine neue Mail
  update mail_log set status = 'sent', sent_at = now(), meta = meta #- '{vars,side_event_token}'
   where template_key = 'side_event_invitation' and related_id = v_e1 and person_id = v_p2;
  v_j := invite_to_side_event(v_e1, array[v_s2], true);
  select token_hash into v_h_neu from side_event_invite where side_event_id = v_e1 and profile_id = v_s2;
  insert into t_res values ('03_resend_nach_versand', 'resent=' || (v_j ->> 'resent')
    || ' mails=' || (select count(*)::text from mail_log where template_key = 'side_event_invitation' and related_id = v_e1 and person_id = v_p2)
    || ' wartend=' || (select count(*)::text from mail_log where template_key = 'side_event_invitation' and related_id = v_e1 and person_id = v_p2 and status = 'queued')
    || ' versendete_ohne_token=' || (select bool_and(not (meta -> 'vars' ? 'side_event_token'))::text from mail_log where template_key = 'side_event_invitation' and related_id = v_e1 and person_id = v_p2 and status = 'sent')
    || ' neuer_token_passt=' || (select (encode(extensions.digest(meta -> 'vars' ->> 'side_event_token', 'sha256'), 'hex') = v_h_neu)::text from mail_log where template_key = 'side_event_invitation' and related_id = v_e1 and person_id = v_p2 and status = 'queued'));
  -- Gesperrte Adresse: eingeladen ist sie trotzdem, aber ohne Link — und der Token steht nicht im Protokoll
  v_j := invite_to_side_event(v_e4, array[v_s5]);
  insert into t_res values ('03_unterdrueckte_adresse', 'invited=' || (v_j ->> 'invited') || ' no_mail=' || jsonb_array_length(v_j -> 'no_mail')::text
    || ' mail=' || (select m.status from mail_log m where m.template_key = 'side_event_invitation' and m.related_id = v_e4 and m.person_id = (select person_id from speaker_profile where id = v_s5))
    || ' token_im_protokoll=' || (select (m.meta -> 'vars' ? 'side_event_token')::text from mail_log m where m.template_key = 'side_event_invitation' and m.related_id = v_e4 and m.person_id = (select person_id from speaker_profile where id = v_s5))
    || ' token_hash_leer=' || (select (token_hash is null)::text from side_event_invite where side_event_id = v_e4 and profile_id = v_s5)
    || ' mailed_at_leer=' || (select (mailed_at is null)::text from side_event_invite where side_event_id = v_e4 and profile_id = v_s5));
  -- Für die späteren Abschnitte: Tokens aus den wartenden Mails, Einladungen zu Event 4 (Assistenz) und 5 (Ablauf)
  select meta -> 'vars' ->> 'side_event_token' into v_t2 from mail_log where template_key = 'side_event_invitation' and related_id = v_e1 and person_id = v_p2 and status = 'queued';
  select meta -> 'vars' ->> 'side_event_token' into v_t3 from mail_log where template_key = 'side_event_invitation' and related_id = v_e1 and person_id = v_p3 and status = 'queued';
  perform invite_to_side_event(v_e4, array[v_s7]);
  perform invite_to_side_event(v_e5, array[v_s6]);
  select meta -> 'vars' ->> 'side_event_token' into v_t6 from mail_log where template_key = 'side_event_invitation' and related_id = v_e5 and person_id = v_p6 and status = 'queued';

  -- === 04 · Speaker (keine Rolle): die Testperson selbst ===============================================================
  delete from role_assignment where person_id = v_pid;
  insert into t_res values ('04_nur_eingeladene_sichtbar',
    (select count(*)::text || ' Zeile(n) ' || string_agg(m.title_de || ' status=' || m.my_status || ' taken=' || m.taken::text || ' free=' || m.free::text || ' closed=' || m.closed::text, ', ') from my_side_events(v_ed) m));
  -- Event 4 ist veröffentlicht, aber sie ist dazu nicht eingeladen; Event 2 ist eingeladen, aber ein Entwurf
  insert into t_res values ('04_nicht_eingeladen_antwort', pg_temp.abgewiesen(format('select respond_side_event(%L, %L)', v_e4, 'yes')));
  insert into t_res values ('04_entwurf_antwort', pg_temp.abgewiesen(format('select respond_side_event(%L, %L)', v_e2, 'yes')));
  v_j := respond_side_event(v_e1, 'yes', 1, 'Vegetarisch bitte, Allergie XYZ');
  insert into t_res values ('04_zusage_mit_begleitung', (v_j ->> 'status') || ' guests=' || (v_j ->> 'guests') || ' taken=' || (v_j ->> 'taken'));
  insert into t_res values ('04_zeile_nach_zusage', (select 'via=' || via || ' ohne_antwortzeit=' || (responded_at is null)::text || ' note=' || (note is not null)::text
    from side_event_invite where side_event_id = v_e1 and profile_id = v_s1));
  insert into t_res values ('04_audit_antwort', (select 'person_id=' || ((a.after ->> 'person_id') = v_pid::text)::text || ' status=' || (a.after ->> 'status') || ' guests=' || (a.after ->> 'guests') || ' via=' || (a.after ->> 'via')
    || ' ohne_hinweis=' || (not (a.after::text like '%Vegetarisch%'))::text || ' ohne_email=' || (not (a.after::text ~ '@'))::text
    from audit_log a where a.action = 'side_event.responded' and a.object_id = v_e1::text order by a.id desc limit 1));
  insert into t_res values ('04_status_maybe', pg_temp.abgewiesen(format('select respond_side_event(%L, %L)', v_e1, 'maybe')));
  insert into t_res values ('04_status_invited', pg_temp.abgewiesen(format('select respond_side_event(%L, %L)', v_e1, 'invited')));
  insert into t_res values ('04_begleitung_4', pg_temp.abgewiesen(format('select respond_side_event(%L, %L, 4)', v_e1, 'yes')));
  insert into t_res values ('04_begleitung_minus_1', pg_temp.abgewiesen(format('select respond_side_event(%L, %L, -1)', v_e1, 'yes')));
  insert into t_res values ('04_hinweis_zu_lang', pg_temp.abgewiesen(format('select respond_side_event(%L, %L, 0, %L)', v_e1, 'yes', repeat('x', 501))));
  -- Die eigene bisherige Zusage (2 Plätze) zählt beim Ändern nicht mit: eine zweite Begleitung geht (3 von 3), eine dritte nicht
  v_j := respond_side_event(v_e1, 'yes', 2);
  insert into t_res values ('04_eigene_plaetze_zaehlen_nicht', (v_j ->> 'status') || ' guests=' || (v_j ->> 'guests') || ' taken=' || (v_j ->> 'taken'));
  insert into t_res values ('04_zu_viele_fuer_kapazitaet', pg_temp.abgewiesen(format('select respond_side_event(%L, %L, 3)', v_e1, 'yes')));
  -- Absage: gibt die Plätze frei, die Zeile bleibt stehen (das Team unterscheidet „abgesagt“ von „nie geantwortet“)
  v_j := respond_side_event(v_e1, 'no');
  insert into t_res values ('04_absage_gibt_plaetze_frei', (v_j ->> 'status') || ' guests=' || (v_j ->> 'guests') || ' taken=' || (v_j ->> 'taken')
    || ' zeilen=' || (select count(*)::text from side_event_invite where side_event_id = v_e1 and profile_id = v_s1)
    || ' my_status=' || (select m.my_status from my_side_events(v_ed) m where m.id = v_e1));
  v_j := respond_side_event(v_e1, 'yes', 1);
  insert into t_res values ('04_wieder_zusagen', (v_j ->> 'status') || ' guests=' || (v_j ->> 'guests') || ' taken=' || (v_j ->> 'taken'));
  -- Assistenz: sieht die Einladung der Speakerin, antwortet aber nicht für sie
  insert into speaker_portal_selection (person_id, profile_id) values (v_pid, v_s7) on conflict (person_id) do update set profile_id = excluded.profile_id;
  insert into t_res values ('04_assistenz_sieht', (select count(*)::text || ' Zeile(n) ' || string_agg(m.title_de, ', ') from my_side_events(v_ed) m));
  insert into t_res values ('04_assistenz_antwortet_nicht', pg_temp.abgewiesen(format('select respond_side_event(%L, %L)', v_e4, 'yes')));
  delete from speaker_portal_selection where person_id = v_pid;
  -- Nach der Antwortfrist: gesperrt, die Liste sagt `closed`
  update side_event set rsvp_deadline = now() - interval '1 hour' where id = v_e1;
  insert into t_res values ('04_nach_antwortfrist', pg_temp.abgewiesen(format('select respond_side_event(%L, %L)', v_e1, 'no')));
  insert into t_res values ('04_nach_antwortfrist_closed_true', (select 'closed=' || m.closed::text || ' my_status=' || m.my_status from my_side_events(v_ed) m where m.id = v_e1));

  -- === 05 · Team von Hand ==========================================================================================
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_speaker', 'global');
  update side_event set rsvp_deadline = null where id = v_e1;
  -- Sechs ist zu Event 4 noch nicht eingeladen: das Team legt die Zeile an (der Speaker hat mündlich abgesagt)
  v_j := set_side_event_status(v_e4, v_s6, 'no');
  insert into t_res values ('05_von_hand_neue_zeile', (v_j ->> 'status') || ' guests=' || (v_j ->> 'guests') || ' via=' || (select i.via from side_event_invite i where i.side_event_id = v_e4 and i.profile_id = v_s6)
    || ' invited_by_mir=' || (select (i.invited_by = v_pid)::text from side_event_invite i where i.side_event_id = v_e4 and i.profile_id = v_s6)
    || ' mit_antwortzeit=' || (select (i.responded_at is not null)::text from side_event_invite i where i.side_event_id = v_e4 and i.profile_id = v_s6));
  v_j := set_side_event_status(v_e4, v_s6, 'invited');
  insert into t_res values ('05_invited_setzt_antwort_zurueck', (v_j ->> 'status') || ' ohne_antwortzeit=' || (select (i.responded_at is null)::text from side_event_invite i where i.side_event_id = v_e4 and i.profile_id = v_s6));
  v_j := set_side_event_status(v_e4, v_s6, 'yes', 3);
  insert into t_res values ('05_zusage_mit_begleitung_unbegrenzt', (v_j ->> 'status') || ' guests=' || (v_j ->> 'guests') || ' taken=' || (v_j ->> 'taken'));
  -- Hinweis: setzen, mit `null` unverändert lassen, mit leerem Text löschen (das Team darf einen Hinweis entfernen)
  perform set_side_event_status(v_e4, v_s6, 'yes', 3, 'Hinweis A');
  select 'gesetzt=' || coalesce(note, 'NULL') into v_s from side_event_invite where side_event_id = v_e4 and profile_id = v_s6;
  perform set_side_event_status(v_e4, v_s6, 'yes', 3);
  v_s := v_s || ' unveraendert=' || (select coalesce(note, 'NULL') from side_event_invite where side_event_id = v_e4 and profile_id = v_s6);
  perform set_side_event_status(v_e4, v_s6, 'yes', 3, '   ');
  insert into t_res values ('05_hinweis_setzen_lassen_loeschen', v_s || ' geloescht=' || (select coalesce(note, 'NULL') from side_event_invite where side_event_id = v_e4 and profile_id = v_s6));
  insert into t_res values ('05_begleitung_4', pg_temp.abgewiesen(format('select set_side_event_status(%L, %L, %L, 4)', v_e4, v_s6, 'yes')));
  insert into t_res values ('05_status_maybe', pg_temp.abgewiesen(format('select set_side_event_status(%L, %L, %L)', v_e4, v_s6, 'maybe')));
  insert into t_res values ('05_status_null', pg_temp.abgewiesen(format('select set_side_event_status(%L, %L, null)', v_e4, v_s6)));
  insert into t_res values ('05_hinweis_zu_lang', pg_temp.abgewiesen(format('select set_side_event_status(%L, %L, %L, 0, %L)', v_e4, v_s6, 'yes', repeat('x', 501))));
  insert into t_res values ('05_nicht_bestaetigt', pg_temp.abgewiesen(format('select set_side_event_status(%L, %L, %L)', v_e4, v_s4, 'yes')));
  insert into t_res values ('05_stage_guest', pg_temp.abgewiesen(format('select set_side_event_status(%L, %L, %L)', v_e4, v_sg, 'yes')));
  insert into t_res values ('05_profil_fehlt', pg_temp.abgewiesen(format('select set_side_event_status(%L, gen_random_uuid(), %L)', v_e4, 'yes')));
  insert into t_res values ('05_audit_status_gesetzt', (select count(*)::text || ' Eintraege person_id=' || bool_and((a.after ->> 'person_id') is not null)::text || ' via=' || min(a.after ->> 'via')
    || ' ohne_email=' || bool_and(not (a.after::text ~ '@'))::text from audit_log a where a.action = 'side_event.status_set' and a.object_id = v_e4::text));

  -- === 06 · Der Link (service_role) ===================================================================================
  -- Stand von Event 1 jetzt: Eins zugesagt mit Begleitung (2 Plätze von 3), Zwei und Drei eingeladen
  perform set_config('request.jwt.claims', v_claims_service, true);
  select count(*) into v_audit_n from audit_log where action = 'side_event.responded' and object_id = v_e1::text;
  select to_jsonb(i) into v_zeile from side_event_invite i where i.side_event_id = v_e1 and i.profile_id = v_s1;
  v_j := side_event_respond_by_token(v_t1, null, v_ip);
  select to_jsonb(i) into v_zeile2 from side_event_invite i where i.side_event_id = v_e1 and i.profile_id = v_s1;
  insert into t_res values ('06_lesen_aendert_nichts', pg_temp.kurz(v_j) || ' audit_gleich=' || ((select count(*) from audit_log where action = 'side_event.responded' and object_id = v_e1::text) = v_audit_n)::text
    || ' antwort_gleich=' || (v_zeile = v_zeile2)::text);
  insert into t_res values ('06_keine_personendaten', (select string_agg(k, ',' order by k) from jsonb_object_keys(v_j) k) || ' | ' || (select string_agg(k, ',' order by k) from jsonb_object_keys(v_j -> 'event') k)
    || ' keine_person_im_text=' || (not (v_j::text ~* 'Speakerin|zz-se|@|profile|person|Vegetarisch'))::text);
  -- Zusage per Link (Zwei): setzt via=email, Antwortzeit, Audit mit person_id, ohne Adresse und ohne Token
  v_j := side_event_respond_by_token(v_t2, 'yes', v_ip);
  insert into t_res values ('06_zusage', pg_temp.kurz(jsonb_build_object('state', v_j ->> 'state', 'status', v_j ->> 'status')) || ' via=' || (select i.via from side_event_invite i where i.side_event_id = v_e1 and i.profile_id = v_s2)
    || ' guests=' || (select i.guests::text from side_event_invite i where i.side_event_id = v_e1 and i.profile_id = v_s2)
    || ' antwortzeit=' || (select (i.responded_at is not null)::text from side_event_invite i where i.side_event_id = v_e1 and i.profile_id = v_s2));
  insert into t_res values ('06_audit_link', (select 'person_id=' || ((a.after ->> 'person_id') = v_p2::text)::text || ' via=' || (a.after ->> 'via') || ' antwortzeit=' || (a.after ? 'responded_at')::text
    || ' ohne_email=' || (not (a.after::text ~ '@'))::text || ' ohne_token=' || (position(v_t2 in a.after::text) = 0)::text
    from audit_log a where a.action = 'side_event.responded' and a.object_id = v_e1::text and (a.after ->> 'via') = 'email' order by a.id desc limit 1));
  -- Idempotent: derselbe Stand noch einmal ändert nichts und schreibt kein zweites Audit
  select count(*) into v_audit_n from audit_log where action = 'side_event.responded' and object_id = v_e1::text;
  v_j := side_event_respond_by_token(v_t2, 'yes', v_ip);
  insert into t_res values ('06_idempotent', pg_temp.kurz(jsonb_build_object('state', v_j ->> 'state', 'status', v_j ->> 'status'))
    || ' audit_gleich=' || ((select count(*) from audit_log where action = 'side_event.responded' and object_id = v_e1::text) = v_audit_n)::text);
  -- Jetzt sind 3 von 3 Plätzen belegt (Eins mit Begleitung, Zwei): Drei bekommt `full`, und es wird nichts geschrieben
  select to_jsonb(i) into v_zeile from side_event_invite i where i.side_event_id = v_e1 and i.profile_id = v_s3;
  v_j := side_event_respond_by_token(v_t3, 'yes', v_ip);
  select to_jsonb(i) into v_zeile2 from side_event_invite i where i.side_event_id = v_e1 and i.profile_id = v_s3;
  insert into t_res values ('06_voll_schreibt_nichts', pg_temp.kurz(jsonb_build_object('state', v_j ->> 'state', 'status', v_j ->> 'status')) || ' zeile_unveraendert=' || (v_zeile = v_zeile2)::text);
  -- Auch das Team stößt an die Grenze
  perform set_config('request.jwt.claims', v_claims_team, true);
  insert into t_res values ('06_team_stoesst_an_grenze', pg_temp.abgewiesen(format('select set_side_event_status(%L, %L, %L)', v_e1, v_s3, 'yes')));
  perform set_config('request.jwt.claims', v_claims_service, true);
  -- Absage von Zwei gibt den Platz frei, danach passt Drei
  v_j := side_event_respond_by_token(v_t2, 'no', v_ip);
  insert into t_res values ('06_absage_gibt_platz_frei', pg_temp.kurz(jsonb_build_object('state', v_j ->> 'state', 'status', v_j ->> 'status'))
    || ' guests=' || (select i.guests::text from side_event_invite i where i.side_event_id = v_e1 and i.profile_id = v_s2) || ' taken=' || side_event_taken(v_e1)::text);
  v_j := side_event_respond_by_token(v_t3, 'yes', v_ip);
  insert into t_res values ('06_danach_passt_es', pg_temp.kurz(jsonb_build_object('state', v_j ->> 'state', 'status', v_j ->> 'status')) || ' taken=' || side_event_taken(v_e1)::text);
  -- Formfehler und fremde Tokens: alles `invalid`, nichts verrät, ob es den Token gab
  insert into t_res values ('06_unbekannt_kurz_zeichen_null',
    (side_event_respond_by_token(repeat('A', 43), 'yes', v_ip) ->> 'state') || '/' || (side_event_respond_by_token('abc', 'yes', v_ip) ->> 'state') || '/'
    || (side_event_respond_by_token(repeat('!', 43), null, v_ip) ->> 'state') || '/' || (side_event_respond_by_token(null, null, v_ip) ->> 'state'));
  insert into t_res values ('06_falscher_status',
    (side_event_respond_by_token(v_t1, 'maybe', v_ip) ->> 'state') || '/' || (side_event_respond_by_token(v_t1, 'invited', v_ip) ->> 'state'));
  -- Abgelaufen: ab Eventbeginn tot (Lesen und Antworten); Sechs ist zu Event 5 eingeladen
  update side_event set starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour' where id = v_e5;
  insert into t_res values ('06_abgelaufen', (side_event_respond_by_token(v_t6, null, v_ip) ->> 'state') || '/' || (side_event_respond_by_token(v_t6, 'yes', v_ip) ->> 'state')
    || ' status_unveraendert=' || (select i.status from side_event_invite i where i.side_event_id = v_e5 and i.profile_id = v_s6));
  -- Unveröffentlicht: unsichtbar, danach wieder da
  update side_event set published = false where id = v_e1;
  v_s := side_event_respond_by_token(v_t1, null, v_ip) ->> 'state';
  update side_event set published = true where id = v_e1;
  insert into t_res values ('06_unveroeffentlicht', v_s || ' wieder_sichtbar=' || (side_event_respond_by_token(v_t1, null, v_ip) ->> 'state'));
  -- Antwortfrist: Lesen zeigt `closed` (mit Stand), Antworten ändert nichts
  update side_event set rsvp_deadline = now() - interval '1 hour' where id = v_e1;
  v_a := side_event_respond_by_token(v_t1, null, v_ip);
  v_b := side_event_respond_by_token(v_t1, 'no', v_ip);
  insert into t_res values ('06_antwortfrist', pg_temp.kurz(jsonb_build_object('state', v_a ->> 'state', 'status', v_a ->> 'status')) || '/' || (v_b ->> 'state')
    || ' status_unveraendert=' || (select i.status from side_event_invite i where i.side_event_id = v_e1 and i.profile_id = v_s1));
  update side_event set rsvp_deadline = null where id = v_e1;
  -- Ein angemeldeter Nutzer hat an diesem Weg nichts verloren (der Link ist für Menschen ohne Konto)
  perform set_config('request.jwt.claims', v_claims_team, true);
  insert into t_res values ('06_als_angemeldeter_nutzer', pg_temp.abgewiesen(format('select side_event_respond_by_token(%L, null, %L)', v_t1, v_ip)));
  perform set_config('request.jwt.claims', v_claims_service, true);
  -- Ratenbegrenzung: 60 je Quelle und Stunde; eine andere Quelle bleibt unberührt; Zählung und Aufräumen
  v_q := award_hash(v_ed, v_ip2);
  insert into side_event_attempt (source_hash) select v_q from generate_series(1, 60);
  select count(*) into v_n from side_event_attempt where source_hash = v_q;
  v_s := side_event_respond_by_token(v_t1, null, v_ip2) ->> 'state';
  insert into t_res values ('06_ratenbegrenzung', v_s || ' versuche_gleich=' || ((select count(*) from side_event_attempt where source_hash = v_q) = v_n)::text
    || ' andere_quelle=' || (side_event_respond_by_token(v_t1, null, repeat('c', 64)) ->> 'state'));
  v_q := award_hash(v_ed, repeat('d', 64));
  select count(*) into v_n from side_event_attempt where source_hash = v_q;
  perform side_event_respond_by_token(v_t1, null, repeat('d', 64));
  select count(*) into v_m from side_event_attempt where source_hash = v_q;
  perform side_event_respond_by_token(repeat('A', 43), 'yes', repeat('d', 64));
  insert into t_res values ('06_versuche_gezaehlt', '+' || (v_m - v_n)::text || '/+' || ((select count(*) from side_event_attempt where source_hash = v_q) - v_m)::text || ' je Aufruf');
  insert into side_event_attempt (source_hash, created_at) values ('alt-' || v_q, now() - interval '2 days');
  perform side_event_respond_by_token(v_t1, null, repeat('e', 64));
  insert into t_res values ('06_alte_versuche_weg', (select count(*)::text from side_event_attempt where created_at < now() - interval '1 day') || ' alte');
  insert into t_res values ('06_quelle_ohne_form', (side_event_respond_by_token(v_t1, null, 'nicht-hex') ->> 'state') || '/' || (side_event_respond_by_token(v_t1, null, null) ->> 'state'));
  -- Der alte Token ist nach dem Resend tot, der neue gilt (S1: Token aus v_t1_alt vor dem Resend)
  insert into t_res values ('06_alter_token_tot', (side_event_respond_by_token(v_t1_alt, null, v_ip) ->> 'state') || ' neuer_token=' || (side_event_respond_by_token(v_t1, null, v_ip) ->> 'state'));

  -- === 07 · Admin-Übersicht (Team) ======================================================================================
  perform set_config('request.jwt.claims', v_claims_team, true);
  insert into t_res values ('07_zahlen_je_event', (select 'taken=' || o.taken::text || ' yes=' || o.yes_count::text || ' no=' || o.no_count::text || ' offen=' || o.open_count::text
    || ' eingeladen=' || o.invited_count::text || ' invites_null=' || (o.invites is null)::text from side_events_admin(v_ed) o where o.id = v_e1));
  insert into t_res values ('07_modus_a_ohne_namen', 'namen_im_text=' || ((select jsonb_agg(to_jsonb(o))::text from side_events_admin(v_ed) o) ~ 'Speakerin|Zwei|Drei')::text);
  insert into t_res values ('07_modus_b_mit_namen', (select count(*)::text || ' Event ' || max(jsonb_array_length(o.invites))::text || ' Einladungen namen='
    || bool_and((select bool_and((x ->> 'last_name') is not null) from jsonb_array_elements(o.invites) x))::text
    || ' zusagen_zuerst=' || bool_and((o.invites -> 0 ->> 'status') = 'yes')::text
    || ' note_key=' || bool_and((o.invites -> 0) ? 'note')::text
    from side_events_admin(v_ed, v_e1) o));
  insert into t_res values ('07_modus_b_ueber_event_id', 'edition_gefunden=' || ((select count(*) from side_events_admin(null, v_e1) o where o.id = v_e1) = 1)::text);

  -- === 08 · Löschweg =====================================================================================================
  -- Drei: Hinweis und Link-Hash weg, Stand und Begleitung bleiben; Eins (nicht gelöscht) behält seinen Hinweis, sein Stand ist `yes`... hier prüfen wir Zwei (no, mit Hinweis)
  update side_event_invite set note = 'Nussallergie' where side_event_id = v_e1 and profile_id = v_s3;
  update side_event_invite set note = 'bleibt' where side_event_id = v_e1 and profile_id = v_s2;
  select (token_hash is not null and note is not null) into v_ok from side_event_invite where side_event_id = v_e1 and profile_id = v_s3;
  perform anonymize_person(v_p3);
  insert into t_res values ('08_hinweis_und_token_weg', (select 'note=' || coalesce(i.note, 'NULL') || ' token=' || coalesce(i.token_hash, 'NULL') || ' status=' || i.status || ' guests=' || i.guests::text
    || ' vorher_hinweis_und_token=' || v_ok::text from side_event_invite i where i.side_event_id = v_e1 and i.profile_id = v_s3));
  insert into t_res values ('08_anderer_speaker_unberuehrt', (select 'note=' || coalesce(i.note, 'NULL') || ' token=' || (i.token_hash is not null)::text || ' status=' || i.status
    from side_event_invite i where i.side_event_id = v_e1 and i.profile_id = v_s2));
  perform set_config('request.jwt.claims', v_claims_service, true);
  insert into t_res values ('08_link_tot', (side_event_respond_by_token(v_t3, null, v_ip) ->> 'state'));
  perform set_config('request.jwt.claims', v_claims_team, true);

  -- === 09 · Löschen ======================================================================================================
  insert into t_res values ('09_loeschen_mit_zusagen', pg_temp.abgewiesen(format('select delete_side_event(%L)', v_e1)));
  select count(*) into v_n from side_event_invite where side_event_id = v_e2;
  perform delete_side_event(v_e2);
  insert into t_res values ('09_loeschen_ohne_zusagen', case when not exists (select 1 from side_event where id = v_e2) then 'geloescht' else 'NOCH DA' end
    || ' einladungen_danach=' || (select count(*)::text from side_event_invite where side_event_id = v_e2)
    || ' audit=' || (select count(*)::text from audit_log where action = 'side_event.deleted' and object_id = v_e2::text)
    || ' ohne_email=' || (select bool_and(not (coalesce(a.after::text, '') ~ '@'))::text from audit_log a where a.action = 'side_event.deleted' and a.object_id = v_e2::text));
  insert into t_res values ('09_loeschen_fehlt', pg_temp.abgewiesen(format('select delete_side_event(%L)', gen_random_uuid())));

  -- === 01 (Fortsetzung) · Prüfregeln und Rechte, jetzt mit Daten ========================================================
  insert into t_res values ('01_pruefregeln',
    'status=' || substr(pg_temp.abgewiesen(format('update side_event_invite set status = %L where side_event_id = %L and profile_id = %L', 'maybe', v_e1, v_s1)), 10, 5)
    || ' guests=' || substr(pg_temp.abgewiesen(format('update side_event_invite set guests = 4 where side_event_id = %L and profile_id = %L', v_e1, v_s1)), 10, 5)
    || ' via=' || substr(pg_temp.abgewiesen(format('update side_event_invite set via = %L where side_event_id = %L and profile_id = %L', 'fax', v_e1, v_s1)), 10, 5)
    || ' token_form=' || substr(pg_temp.abgewiesen(format('update side_event_invite set token_hash = %L where side_event_id = %L and profile_id = %L', 'klartext', v_e1, v_s1)), 10, 5));
  insert into t_res values ('01_execute_rechte', (select string_agg(split_part(f, '(', 1) || '=' || has_function_privilege('anon', f, 'execute')::text || '/' || has_function_privilege('authenticated', f, 'execute')::text, ' ' order by ord)
    from unnest(array['my_side_events(uuid)', 'side_events_admin(uuid,uuid)', 'upsert_side_event(jsonb)', 'delete_side_event(uuid)', 'respond_side_event(uuid,text,integer,text)',
                      'invite_to_side_event(uuid,uuid[],boolean)', 'set_side_event_status(uuid,uuid,text,integer,text)', 'side_event_taken(uuid)']) with ordinality as t(f, ord))
    || ' link=' || has_function_privilege('anon', 'side_event_respond_by_token(text,text,text)', 'execute')::text || '/' || has_function_privilege('authenticated', 'side_event_respond_by_token(text,text,text)', 'execute')::text
    || '/' || has_function_privilege('service_role', 'side_event_respond_by_token(text,text,text)', 'execute')::text);
end $$;
insert into t_res
  select '99_auswertung',
         case when count(*) filter (where not z.erfuellt) = 0 then 'ok: alle ' || count(*)::text || ' Erwartungen erfüllt'
              else 'FEHLER: ' || string_agg(z.step, ', ' order by z.step) filter (where not z.erfuellt) end
    from (select e.step, exists (select 1 from t_res r where r.step = e.step and r.result ~ e.muster) as erfuellt from t_erw e) z;
select * from t_res order by step;
rollback;
