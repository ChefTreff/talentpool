-- Smoke-Test v6_mail_verzoegert (Vorschlag, LEAD-063 / PART-124): Warteschlange mit Frist (`mail_log.send_after`), Status `cancelled`, die
-- Hilfsfunktionen `queue_mail_debounced`, `queue_speaker_mail_debounced`, `cancel_queued_mail` und die Änderungsmail für veröffentlichte Slots
-- (Trigger auf slot und session). Jede Prüfung hat ein Gegenstück (wartet neben storniert, Mail neben keiner Mail); „0 Treffer“ allein beweist
-- nichts. Erwartung je Schritt als Muster in `t_erw`; `99_auswertung` am Ende. Wegwerfdaten (ZZ …), alles wird zurückgerollt.
--   01 Form: Spalte, Status-Check, Rechte der zehn Funktionen, beide Trigger, vier Vorlagen.
--   02 `queue_mail_debounced`: anlegen mit send_after, aktualisieren (Präfix bleibt, first_name bleibt, Fenster bleibt), je Person und Bezug eine
--      Zeile, Eingaben, keine Adresse, gesperrte Adresse nur einmal je Fenster, `queue_mail` selbst bleibt sofort, Rechte.
--   03 `cancel_queued_mail`: stornieren, nur Wartendes, Token entfernt, Person oder alle, Eingabe.
--   04 `queue_speaker_mail_debounced`: direkt und über den Kontakt (on_behalf_of), unbekanntes Profil.
--   05 `mail_locale_for` gleich der Sprache aus `queue_mail`.
--   06 Änderungsmail: ohne Person keine Mail, Entwurf keine Mail, Zeit, Folgeänderung (alt bleibt, Fenster bleibt), Rücknahme storniert, Bühne über
--      `move_slot`, Titel, Veröffentlichen mailt nicht, entfernter Speaker, Partner-Session mit CC, Fehler im Mailweg bricht nichts ab, Audit, Detail.
begin;
create temp table t_res (step text, result text) on commit drop;
create temp table t_erw (step text, muster text) on commit drop;
insert into t_erw values
  ('01_form', '^send_after=true status_cancelled=true status_unbekannt=rejected 23514 hilfen_ohne_execute=true service_darf=true trigger=true vorlagen=4$'),
  ('02_neu', '^ok id=true wartet=true send_after_ok=true first_name=true x=1$'),
  ('02_aktualisiert', '^ok gleiche_id=true x=2 y=3 alt_a=A1 first_name=true send_after_gleich=true wartende_zeilen=1$'),
  ('02_ohne_praefix', '^ok alt_a=A3 x=3$'),
  ('02_andere_person', '^ok neue_zeile=true wartende_zeilen=2$'),
  ('02_anderer_bezug', '^ok neue_zeile=true$'),
  ('02_ohne_bezug', '^rejected 22023 related_id_required$'),
  ('02_frist_null', '^rejected 22023 invalid_delay$'),
  ('02_frist_zu_lang', '^rejected 22023 invalid_delay$'),
  ('02_ohne_vorlage', '^rejected 22023 invalid_mail_key$'),
  ('02_ohne_person', '^rejected 22023 invalid_mail_key$'),
  ('02_ohne_adresse', '^ok id_leer=true zeilen=0$'),
  ('02_gesperrt', '^ok erste=suppressed send_after_leer=true zweite_leer=true zeilen=1$'),
  ('02_sofort_unveraendert', '^ok send_after_leer=true$'),
  ('02_rechte', '^queue=rejected 42501 speaker=rejected 42501 cancel=rejected 42501$'),
  ('03_storniert', '^ok anzahl=1 status=cancelled grund=test zeit_gesetzt=true andere_wartend=true$'),
  ('03_nicht_versendet', '^ok anzahl=0 status=sent$'),
  ('03_token_entfernt', '^ok anzahl=1 token_weg=true x_bleibt=true$'),
  ('03_person_filter', '^ok anzahl=1 andere_wartend=true$'),
  ('03_alle_personen', '^ok anzahl=2 wartend=0$'),
  ('03_ohne_bezug', '^rejected 22023 invalid_mail_key$'),
  ('03_geheimnis_im_text', '^ok$'),
  ('04_direkt', '^ok empfaenger=speaker on_behalf_of_leer=true send_after_ok=true$'),
  ('04_ueber_kontakt', '^ok empfaenger=kontakt on_behalf_of=true gleiche_zeile=true$'),
  ('04_unbekanntes_profil', '^ok leer=true$'),
  ('05_sprache', '^ok en=en/en de=de/de speaker=en/en normal=de/de$'),
  ('06_ohne_person_keine_mail', '^ok mails=0$'),
  ('06_entwurf_keine_mail', '^ok mails=0$'),
  ('06_zeit_geaendert', '^ok empfaenger=4 wartet=true send_after=true nur_zeit=true sprachen=1/3 kontakt_on_behalf_of=true bezug=true$'),
  ('06_folgeaenderung', '^ok gleiche_zeilen=true alt_bleibt=true zeit_aktuell=true fenster_bleibt=true$'),
  ('06_zurueck_storniert', '^ok wartend=0 storniert=4 grund=unchanged$'),
  ('06_buehne_ueber_move_slot', '^ok empfaenger=4 nur_buehne=true$'),
  ('06_titel_englisch', '^ok en_zeile=true de_ohne_titel=true$'),
  ('06_titel', '^ok gleiche_zeilen=true de_zeile=true en_bleibt=true alt_titel=true$'),
  ('06_veroeffentlichen_mailt_nicht', '^ok mails=0$'),
  ('06_entfernter_speaker', '^ok storniert=true grund=no_longer_recipient andere_wartend=3$'),
  ('06_nur_ende', '^ok zeilen=3 zeit_neu=true$'),
  ('06_nur_ende_neu', '^ok zeilen=1 zeit=true$'),
  ('06_nur_buehne', '^ok zeilen=1 nur_buehne=true$'),
  ('06_partner', '^ok sprecher=true partner=true cc=true org_name=true kein_partner_bei_s1=true$'),
  ('06_audit', '^ok queued=true cancelled=true ohne_adresse=true$'),
  ('06_detail', '^ok send_after=true cancel_reason=unchanged$'),
  ('06_fehler_im_mailweg', '^ok zeit_geaendert=true$');

create function pg_temp.zz_person(p_nachname text, p_lang text default null, p_mail boolean default true) returns uuid language plpgsql as $$
declare v_p uuid;
begin
  insert into person (first_name, last_name, preferred_language) values ('ZZ', p_nachname, p_lang) returning id into v_p;
  if p_mail then
    insert into person_email (person_id, email, is_primary) values (v_p, 'zz-mv-' || lower(p_nachname) || '-' || v_p::text || '@example.com', true);
  end if;
  return v_p;
end $$;

create function pg_temp.zz_profil(p_person uuid, p_ed uuid) returns uuid language plpgsql as $$
declare v_sp uuid;
begin
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at)
    values (p_person, p_ed, 'panelist', 'confirmed', now()) returning id into v_sp;
  return v_sp;
end $$;

do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_claims text;
  v_ev uuid; v_tz text; v_ed uuid; v_d1 event_day%rowtype; t_d1 timestamptz;
  s_a uuid; s_b uuid; s_c uuid; l1 uuid; l2 uuid; l3 uuid; l4 uuid; l5 uuid; se1 uuid; se2 uuid; se3 uuid; se4 uuid; se5 uuid; v_org uuid;
  p_a uuid; p_b uuid; p_noemail uuid; p_sup uuid; p_sp1 uuid; p_sp2 uuid; p_sp3 uuid; p_mod uuid; p_ct uuid; p_op uuid; p_cc uuid;
  p_en uuid; p_de uuid; p_spk uuid; p_pl uuid;
  prof1 uuid; prof2 uuid; prof3 uuid; prof_x uuid; v_contact uuid;
  v_rel uuid; v_rel2 uuid; v_id bigint; v_id2 bigint; v_id3 bigint; v_id4 bigint; v_m jsonb; v_m2 jsonb; v_r text; v_n integer; v_s text; v_ok boolean;
  v_ids1 bigint[]; v_ids2 bigint[]; t_start timestamptz; t_end timestamptz;
  v_t0 timestamptz := now();
begin
  -- Die handelnde Person: ein Konto aus dem Bestand, in der Transaktion mit Programmrechten.
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  v_claims := json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text;
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'programme_team', 'global');
  perform set_config('request.jwt.claims', v_claims, true);

  select e.id, coalesce(e.timezone, 'Europe/Berlin'), coalesce(e.edition_id, e.id) into v_ev, v_tz, v_ed
    from event e where not e.is_edition and exists (select 1 from stage st where st.event_id = e.id)
   order by (e.format_tag is distinct from 'summit'), e.start_date limit 1;
  select * into v_d1 from event_day where event_id = v_ev order by day_date limit 1;
  t_d1 := (v_d1.day_date + time '00:00') at time zone v_tz;

  -- === 01 Form ====================================================================================================
  begin
    insert into mail_log (to_email, status) values ('zz-bogus@example.com', 'bogus');
    v_r := 'ALLOWED (BUG)';
  exception when others then v_r := 'rejected ' || sqlstate; end;
  insert into t_res values ('01_form',
    'send_after=' || exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'mail_log' and column_name = 'send_after')::text
    || ' status_cancelled=' || (select (pg_get_constraintdef(c.oid) like '%cancelled%')::text from pg_constraint c
                                 where c.conrelid = 'public.mail_log'::regclass and c.conname = 'mail_log_status_check')
    || ' status_unbekannt=' || v_r
    || ' hilfen_ohne_execute=' || (not exists (
         select 1 from unnest(array[
           'mail_locale_for(uuid)', 'queue_mail_debounced(text, uuid, jsonb, text, uuid, interval, text)',
           'queue_speaker_mail_debounced(text, uuid, jsonb, text, uuid, interval, text)', 'cancel_queued_mail(text, uuid, uuid, text)',
           'session_change_state(text, text, uuid)', 'session_change_lines(jsonb, jsonb, text, text)',
           'session_change_queue(text, uuid, uuid, uuid, uuid, jsonb, jsonb, text, text)', 'session_change_notify(uuid, jsonb, jsonb)',
           'slot_session_change_mail()', 'session_change_mail()']) f
          where has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute')))::text
    || ' service_darf=' || (has_function_privilege('service_role', 'queue_mail_debounced(text, uuid, jsonb, text, uuid, interval, text)', 'execute')
                            and has_function_privilege('service_role', 'cancel_queued_mail(text, uuid, uuid, text)', 'execute'))::text
    || ' trigger=' || ((select count(*) from pg_trigger t where t.tgname in ('trg_slot_session_change_mail', 'trg_session_change_mail') and not t.tgisinternal) = 2)::text
    || ' vorlagen=' || (select count(*) from mail_template where key in ('session_changed', 'session_changed_partner') and locale in ('de', 'en') and active)::text);

  -- === 02 queue_mail_debounced ====================================================================================
  p_a := pg_temp.zz_person('Alpha'); p_b := pg_temp.zz_person('Beta'); p_noemail := pg_temp.zz_person('Ohne', null, false);
  v_rel := gen_random_uuid(); v_rel2 := gen_random_uuid();

  v_id := queue_mail_debounced('session_changed', p_a, '{"x":"1","alt_a":"A1"}'::jsonb, 'test', v_rel, interval '10 minutes');
  select to_jsonb(m) into v_m from mail_log m where m.id = v_id;
  insert into t_res values ('02_neu',
    'ok id=' || (v_id is not null)::text || ' wartet=' || ((v_m->>'status') = 'queued')::text
    || ' send_after_ok=' || ((v_m->>'send_after')::timestamptz = now() + interval '10 minutes')::text
    || ' first_name=' || ((v_m->'meta'->'vars'->>'first_name') = 'ZZ')::text || ' x=' || (v_m->'meta'->'vars'->>'x'));

  -- Das Fenster ist fest: eine andere Frist beim zweiten Aufruf ändert send_after nicht; das Präfix `alt_` behält die Zeile.
  v_id2 := queue_mail_debounced('session_changed', p_a, '{"x":"2","y":"3","alt_a":"A2"}'::jsonb, 'test', v_rel, interval '30 minutes');
  select to_jsonb(m) into v_m2 from mail_log m where m.id = v_id2;
  insert into t_res values ('02_aktualisiert',
    'ok gleiche_id=' || (v_id2 = v_id)::text || ' x=' || (v_m2->'meta'->'vars'->>'x') || ' y=' || (v_m2->'meta'->'vars'->>'y')
    || ' alt_a=' || (v_m2->'meta'->'vars'->>'alt_a') || ' first_name=' || ((v_m2->'meta'->'vars'->>'first_name') = 'ZZ')::text
    || ' send_after_gleich=' || ((v_m2->>'send_after')::timestamptz = now() + interval '10 minutes')::text
    || ' wartende_zeilen=' || (select count(*) from mail_log where template_key = 'session_changed' and related_id = v_rel and person_id = p_a and status = 'queued')::text);

  -- Ohne Präfix wird alles ersetzt.
  perform queue_mail_debounced('session_changed', p_a, '{"x":"3","alt_a":"A3"}'::jsonb, 'test', v_rel, interval '10 minutes', '');
  select to_jsonb(m) into v_m2 from mail_log m where m.id = v_id;
  insert into t_res values ('02_ohne_praefix', 'ok alt_a=' || (v_m2->'meta'->'vars'->>'alt_a') || ' x=' || (v_m2->'meta'->'vars'->>'x'));

  v_id2 := queue_mail_debounced('session_changed', p_b, '{"x":"1"}'::jsonb, 'test', v_rel, interval '10 minutes');
  insert into t_res values ('02_andere_person',
    'ok neue_zeile=' || (v_id2 is not null and v_id2 <> v_id)::text
    || ' wartende_zeilen=' || (select count(*) from mail_log where template_key = 'session_changed' and related_id = v_rel and status = 'queued')::text);
  v_id2 := queue_mail_debounced('session_changed', p_a, '{"x":"1"}'::jsonb, 'test', v_rel2, interval '10 minutes');
  insert into t_res values ('02_anderer_bezug', 'ok neue_zeile=' || (v_id2 is not null and v_id2 <> v_id)::text);

  begin perform queue_mail_debounced('session_changed', p_a, '{}'::jsonb, 'test', null); v_r := 'ALLOWED (BUG)';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  insert into t_res values ('02_ohne_bezug', v_r);
  begin perform queue_mail_debounced('session_changed', p_a, '{}'::jsonb, 'test', v_rel, interval '0 minutes'); v_r := 'ALLOWED (BUG)';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  insert into t_res values ('02_frist_null', v_r);
  begin perform queue_mail_debounced('session_changed', p_a, '{}'::jsonb, 'test', v_rel, interval '25 hours'); v_r := 'ALLOWED (BUG)';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  insert into t_res values ('02_frist_zu_lang', v_r);
  begin perform queue_mail_debounced('  ', p_a, '{}'::jsonb, 'test', v_rel); v_r := 'ALLOWED (BUG)';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  insert into t_res values ('02_ohne_vorlage', v_r);
  begin perform queue_mail_debounced('session_changed', null, '{}'::jsonb, 'test', v_rel); v_r := 'ALLOWED (BUG)';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  insert into t_res values ('02_ohne_person', v_r);

  v_id := queue_mail_debounced('session_changed', p_noemail, '{}'::jsonb, 'test', v_rel);
  insert into t_res values ('02_ohne_adresse',
    'ok id_leer=' || (v_id is null)::text || ' zeilen=' || (select count(*) from mail_log where person_id = p_noemail)::text);

  -- Gesperrte Adresse: `queue_mail` schreibt eine `suppressed`-Zeile; im selben Fenster kommt keine zweite dazu.
  p_sup := pg_temp.zz_person('Gesperrt');
  insert into suppression (email_hash, reason) values (email_hash((select pe.email::text from person_email pe where pe.person_id = p_sup and pe.is_primary)), 'zz_test');
  v_id := queue_mail_debounced('session_changed', p_sup, '{}'::jsonb, 'test', v_rel, interval '10 minutes');
  v_id2 := queue_mail_debounced('session_changed', p_sup, '{}'::jsonb, 'test', v_rel, interval '10 minutes');
  select to_jsonb(m) into v_m from mail_log m where m.id = v_id;
  insert into t_res values ('02_gesperrt',
    'ok erste=' || (v_m->>'status') || ' send_after_leer=' || ((v_m->>'send_after') is null)::text || ' zweite_leer=' || (v_id2 is null)::text
    || ' zeilen=' || (select count(*) from mail_log where person_id = p_sup and template_key = 'session_changed')::text);

  -- `queue_mail` selbst bleibt sofort.
  v_id := queue_mail('session_changed', p_b, '{}'::jsonb, 'test', gen_random_uuid());
  insert into t_res values ('02_sofort_unveraendert',
    'ok send_after_leer=' || ((select send_after from mail_log where id = v_id) is null)::text);

  -- Rechte: nur Definer-Aufrufer und die Service-Rolle.
  execute 'set local role authenticated';
  begin perform queue_mail_debounced('session_changed', p_a, '{}'::jsonb, 'test', v_rel); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := 'rejected ' || sqlstate; end;
  begin perform queue_speaker_mail_debounced('session_changed', gen_random_uuid(), '{}'::jsonb, 'test', v_rel); v_r := 'ALLOWED (BUG)';
  exception when others then v_r := 'rejected ' || sqlstate; end;
  v_s := 'queue=' || v_s || ' speaker=' || v_r;
  begin perform cancel_queued_mail('session_changed', v_rel); v_r := 'ALLOWED (BUG)';
  exception when others then v_r := 'rejected ' || sqlstate; end;
  execute 'reset role';
  insert into t_res values ('02_rechte', v_s || ' cancel=' || v_r);

  -- === 03 cancel_queued_mail ======================================================================================
  v_rel := gen_random_uuid();
  v_id := queue_mail_debounced('session_changed', p_a, '{"x":"1"}'::jsonb, 'test', v_rel, interval '10 minutes');
  v_id2 := queue_mail_debounced('session_changed_partner', p_a, '{"x":"1"}'::jsonb, 'test', v_rel, interval '10 minutes');
  v_n := cancel_queued_mail('session_changed', v_rel, p_a, 'test');
  select to_jsonb(m) into v_m from mail_log m where m.id = v_id;
  insert into t_res values ('03_storniert',
    'ok anzahl=' || v_n::text || ' status=' || (v_m->>'status') || ' grund=' || (v_m->'meta'->>'cancel_reason')
    || ' zeit_gesetzt=' || ((v_m->'meta'->>'cancelled_at') is not null)::text
    || ' andere_wartend=' || ((select status from mail_log where id = v_id2) = 'queued')::text);

  v_rel := gen_random_uuid();
  v_id := queue_mail_debounced('session_changed', p_a, '{"x":"1"}'::jsonb, 'test', v_rel, interval '10 minutes');
  update mail_log set status = 'sent', sent_at = now() where id = v_id;
  v_n := cancel_queued_mail('session_changed', v_rel, p_a, 'test');
  insert into t_res values ('03_nicht_versendet', 'ok anzahl=' || v_n::text || ' status=' || (select status from mail_log where id = v_id));

  v_rel := gen_random_uuid();
  v_id := queue_mail_debounced('session_changed', p_a, '{"x":"1","side_event_token":"geheim"}'::jsonb, 'test', v_rel, interval '10 minutes');
  v_n := cancel_queued_mail('session_changed', v_rel, p_a, null);
  select to_jsonb(m) into v_m from mail_log m where m.id = v_id;
  insert into t_res values ('03_token_entfernt',
    'ok anzahl=' || v_n::text || ' token_weg=' || (not (v_m->'meta'->'vars' ? 'side_event_token'))::text || ' x_bleibt=' || ((v_m->'meta'->'vars'->>'x') = '1')::text);

  v_rel := gen_random_uuid();
  v_id := queue_mail_debounced('session_changed', p_a, '{}'::jsonb, 'test', v_rel, interval '10 minutes');
  v_id2 := queue_mail_debounced('session_changed', p_b, '{}'::jsonb, 'test', v_rel, interval '10 minutes');
  v_n := cancel_queued_mail('session_changed', v_rel, p_b, 'nur_b');
  insert into t_res values ('03_person_filter',
    'ok anzahl=' || v_n::text || ' andere_wartend=' || ((select status from mail_log where id = v_id) = 'queued')::text);
  -- Ohne Person: alle wartenden Zeilen des Bezugs (zwei Personen, eine Vorlage).
  v_rel := gen_random_uuid();
  perform queue_mail_debounced('session_changed', p_a, '{}'::jsonb, 'test', v_rel, interval '10 minutes');
  perform queue_mail_debounced('session_changed', p_b, '{}'::jsonb, 'test', v_rel, interval '10 minutes');
  v_n := cancel_queued_mail('session_changed', v_rel, null, 'alle');
  insert into t_res values ('03_alle_personen',
    'ok anzahl=' || v_n::text || ' wartend=' || (select count(*) from mail_log where related_id = v_rel and status = 'queued')::text);
  begin perform cancel_queued_mail('session_changed', null); v_r := 'ALLOWED (BUG)';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  insert into t_res values ('03_ohne_bezug', v_r);
  -- Die Liste der Geheimnisse in der Funktion ist die aus lib/mail/geheimnisse.ts (der App-Test gleicht beide ab).
  insert into t_res values ('03_geheimnis_im_text',
    case when pg_get_functiondef('cancel_queued_mail(text, uuid, uuid, text)'::regprocedure) like '%side_event_token%' then 'ok' else 'FEHLER: side_event_token fehlt' end);

  -- === 04 queue_speaker_mail_debounced ============================================================================
  p_sp3 := pg_temp.zz_person('Vertreten', 'de'); p_ct := pg_temp.zz_person('Kontakt', 'de');
  p_sp1 := pg_temp.zz_person('Sprecher1'); prof1 := pg_temp.zz_profil(p_sp1, v_ed);
  prof3 := pg_temp.zz_profil(p_sp3, v_ed);
  insert into speaker_contact (profile_id, kind, person_id, first_name, last_name, email, has_access, consent_at)
    values (prof3, 'assistant', p_ct, 'ZZ', 'Kontakt', 'zz-mv-kontakt@example.org', true, current_date) returning id into v_contact;
  update speaker_profile set mail_via_contact_id = v_contact where id = prof3;

  v_rel := gen_random_uuid();
  v_id := queue_speaker_mail_debounced('session_changed', prof1, '{"x":"1"}'::jsonb, 'test', v_rel, interval '10 minutes');
  select to_jsonb(m) into v_m from mail_log m where m.id = v_id;
  insert into t_res values ('04_direkt',
    'ok empfaenger=' || case when (v_m->>'person_id')::uuid = p_sp1 then 'speaker' else 'FALSCH' end
    || ' on_behalf_of_leer=' || (not (v_m->'meta'->'vars' ? 'on_behalf_of'))::text
    || ' send_after_ok=' || ((v_m->>'send_after')::timestamptz = now() + interval '10 minutes')::text);
  v_id := queue_speaker_mail_debounced('session_changed', prof3, '{"x":"1"}'::jsonb, 'test', v_rel, interval '10 minutes');
  v_id2 := queue_speaker_mail_debounced('session_changed', prof3, '{"x":"2"}'::jsonb, 'test', v_rel, interval '10 minutes');
  select to_jsonb(m) into v_m from mail_log m where m.id = v_id;
  insert into t_res values ('04_ueber_kontakt',
    'ok empfaenger=' || case when (v_m->>'person_id')::uuid = p_ct then 'kontakt' else 'FALSCH' end
    || ' on_behalf_of=' || ((v_m->'meta'->'vars'->>'on_behalf_of') = 'ZZ Vertreten')::text
    || ' gleiche_zeile=' || (v_id2 = v_id)::text);
  insert into t_res values ('04_unbekanntes_profil',
    'ok leer=' || (queue_speaker_mail_debounced('session_changed', gen_random_uuid(), '{}'::jsonb, 'test', v_rel) is null)::text);

  -- === 05 Sprache ==================================================================================================
  p_en := pg_temp.zz_person('Englisch', 'en'); p_de := pg_temp.zz_person('Deutsch', 'de'); p_spk := pg_temp.zz_person('Redner'); p_pl := pg_temp.zz_person('Gewoehnlich');
  perform pg_temp.zz_profil(p_spk, v_ed);
  v_id := queue_mail('session_changed', p_en, '{}'::jsonb, 'test', gen_random_uuid());
  v_id2 := queue_mail('session_changed', p_de, '{}'::jsonb, 'test', gen_random_uuid());
  v_id3 := queue_mail('session_changed', p_spk, '{}'::jsonb, 'test', gen_random_uuid());
  v_id4 := queue_mail('session_changed', p_pl, '{}'::jsonb, 'test', gen_random_uuid());
  insert into t_res values ('05_sprache',
    'ok en=' || (select locale from mail_log where id = v_id) || '/' || mail_locale_for(p_en)
    || ' de=' || (select locale from mail_log where id = v_id2) || '/' || mail_locale_for(p_de)
    || ' speaker=' || (select locale from mail_log where id = v_id3) || '/' || mail_locale_for(p_spk)
    || ' normal=' || (select locale from mail_log where id = v_id4) || '/' || mail_locale_for(p_pl));

  -- === 06 Änderungsmail ============================================================================================
  -- Aufbau: zwei Bühnen, drei Slots, drei Sessions. S1 (veröffentlicht) mit vier Beteiligten: Speaker auf Englisch, Speaker auf Deutsch,
  -- Moderation ohne Profil, Panelist, dessen Mails der Kontakt bekommt. S2 (Entwurf). S3 (veröffentlicht, Partner-Session).
  p_sp2 := pg_temp.zz_person('Sprecher2', 'de'); prof2 := pg_temp.zz_profil(p_sp2, v_ed);
  p_mod := pg_temp.zz_person('Moderation');
  insert into stage (event_id, name, type) values (v_ev, 'ZZ Mail Buehne A', 'main') returning id into s_a;
  insert into stage (event_id, name, type) values (v_ev, 'ZZ Mail Buehne B', 'main') returning id into s_b;
  insert into stage (event_id, name, type) values (v_ev, 'ZZ Mail Buehne C', 'main') returning id into s_c;
  t_start := t_d1 + interval '20 hours'; t_end := t_d1 + interval '20 hours 30 minutes';
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status) values (s_a, v_d1.id, t_start, t_end, 'content', 'open') returning id into l1;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
    values (s_b, v_d1.id, t_d1 + interval '19 hours', t_d1 + interval '19 hours 30 minutes', 'content', 'open') returning id into l2;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
    values (s_b, v_d1.id, t_d1 + interval '22 hours', t_d1 + interval '22 hours 30 minutes', 'content', 'open') returning id into l3;
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, publish_status)
    values (v_ev, l1, 'talk', 'ZZ Alt DE', 'ZZ Old EN', 'ZZ Beschreibung', 'published') returning id into se1;
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, publish_status)
    values (v_ev, l2, 'talk', 'ZZ Entwurf DE', 'ZZ Draft EN', 'ZZ Beschreibung', 'draft') returning id into se2;
  insert into organization (legal_name, communication_name, type) values ('ZZ Mail Partner GmbH', 'ZZ Mail Partner', 'corporate') returning id into v_org;
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, publish_status, partner_org_id)
    values (v_ev, l3, 'talk', 'ZZ Partner DE', 'ZZ Partner EN', 'ZZ Beschreibung', 'published', v_org) returning id into se3;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
    values (s_c, v_d1.id, t_d1 + interval '20 hours', t_d1 + interval '20 hours 30 minutes', 'content', 'open') returning id into l4;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
    values (s_c, v_d1.id, t_d1 + interval '21 hours', t_d1 + interval '21 hours 30 minutes', 'content', 'open') returning id into l5;
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, publish_status)
    values (v_ev, l4, 'talk', 'ZZ Nur Ende DE', 'ZZ End Only EN', 'ZZ Beschreibung', 'published') returning id into se4;
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, publish_status)
    values (v_ev, l5, 'talk', 'ZZ Nur Buehne DE', 'ZZ Stage Only EN', 'ZZ Beschreibung', 'published') returning id into se5;
  insert into session_speaker (session_id, person_id, role) values
    (se1, p_sp1, 'speaker'), (se1, p_sp2, 'speaker'), (se1, p_mod, 'moderator'), (se1, p_sp3, 'panelist'),
    (se2, p_sp1, 'speaker'), (se3, p_sp1, 'speaker'), (se4, p_sp1, 'speaker'), (se5, p_sp1, 'speaker');
  p_op := pg_temp.zz_person('Hauptkontakt', 'de'); p_cc := pg_temp.zz_person('Kopie', 'de');
  insert into org_membership (org_id, person_id, roles) values (v_org, p_op, array['primary_ops']), (v_org, p_cc, array['cc']);

  -- Ohne handelnde Person (Skript, Migration, Service-Rolle) keine Mail.
  perform set_config('request.jwt.claims', '', true);
  update slot set start_at = start_at + interval '10 minutes', end_at = end_at + interval '10 minutes' where id = l1;
  insert into t_res values ('06_ohne_person_keine_mail',
    'ok mails=' || (select count(*) from mail_log where template_key in ('session_changed', 'session_changed_partner') and related_id = se1)::text);
  update slot set start_at = start_at - interval '10 minutes', end_at = end_at - interval '10 minutes' where id = l1;
  perform set_config('request.jwt.claims', v_claims, true);

  -- Entwurf: weder Zeit noch Titel lösen etwas aus.
  update slot set start_at = start_at + interval '10 minutes', end_at = end_at + interval '10 minutes' where id = l2;
  update session set title_de = 'ZZ Entwurf neu' where id = se2;
  insert into t_res values ('06_entwurf_keine_mail',
    'ok mails=' || (select count(*) from mail_log where template_key in ('session_changed', 'session_changed_partner') and related_id = se2)::text);

  -- Zeit geändert: vier Empfänger, wartend, 15 Minuten, nur die Zeit.
  update slot set start_at = start_at + interval '60 minutes', end_at = end_at + interval '60 minutes' where id = l1;
  insert into t_res values ('06_zeit_geaendert',
    'ok empfaenger=' || (select count(*) from mail_log where template_key = 'session_changed' and related_id = se1 and status = 'queued')::text
    || ' wartet=' || (select bool_and(m.status = 'queued') from mail_log m where m.template_key = 'session_changed' and m.related_id = se1)::text
    || ' send_after=' || (select bool_and(m.send_after = now() + interval '15 minutes') from mail_log m where m.template_key = 'session_changed' and m.related_id = se1)::text
    || ' nur_zeit=' || (select bool_and(case m.locale
                                          when 'en' then (m.meta->'vars'->>'changes') ~ '^- \*\*Time:\*\* before' and (m.meta->'vars'->>'changes') !~ 'Stage|Title'
                                          else (m.meta->'vars'->>'changes') ~ '^- \*\*Zeit:\*\* bisher' and (m.meta->'vars'->>'changes') !~ 'Bühne|Titel' end)
                          from mail_log m where m.template_key = 'session_changed' and m.related_id = se1)::text
    || ' sprachen=' || (select count(*) filter (where m.locale = 'en') from mail_log m where m.template_key = 'session_changed' and m.related_id = se1)::text
    || '/' || (select count(*) filter (where m.locale = 'de') from mail_log m where m.template_key = 'session_changed' and m.related_id = se1)::text
    || ' kontakt_on_behalf_of=' || exists (select 1 from mail_log m where m.template_key = 'session_changed' and m.related_id = se1 and m.person_id = p_ct
                                            and (m.meta->'vars'->>'on_behalf_of') = 'ZZ Vertreten')::text
    || ' bezug=' || (select bool_and(m.related_type = 'session' and m.related_id = se1) from mail_log m where m.template_key = 'session_changed' and m.related_id = se1)::text);

  -- Folgeänderung im Fenster: dieselben Zeilen, `alt` bleibt der Stand vor der ersten Änderung, das Fenster bleibt (send_after zurückgesetzt, um es zu sehen).
  select array_agg(id order by id) into v_ids1 from mail_log where template_key = 'session_changed' and related_id = se1 and status = 'queued';
  update mail_log set send_after = send_after - interval '5 minutes' where template_key = 'session_changed' and related_id = se1;
  update slot set start_at = start_at + interval '30 minutes', end_at = end_at + interval '30 minutes' where id = l1;
  select array_agg(id order by id) into v_ids2 from mail_log where template_key = 'session_changed' and related_id = se1 and status = 'queued';
  insert into t_res values ('06_folgeaenderung',
    'ok gleiche_zeilen=' || (v_ids1 = v_ids2 and cardinality(v_ids2) = 4)::text
    || ' alt_bleibt=' || (select bool_and((m.meta->'vars'->>'alt_start_at')::timestamptz = (t_d1 + interval '20 hours')) from mail_log m where m.id = any (v_ids2))::text
    || ' zeit_aktuell=' || (select bool_and((m.meta->'vars'->>'changes') like '%20:00–20:30%' and (m.meta->'vars'->>'changes') like '%21:30–22:00%')
                             from mail_log m where m.id = any (v_ids2))::text
    || ' fenster_bleibt=' || (select bool_and(m.send_after = now() + interval '10 minutes') from mail_log m where m.id = any (v_ids2))::text);

  -- Zurück auf den alten Stand: die Änderungen heben sich auf, die wartenden Mails werden storniert.
  update slot set start_at = t_d1 + interval '20 hours', end_at = t_d1 + interval '20 hours 30 minutes' where id = l1;
  insert into t_res values ('06_zurueck_storniert',
    'ok wartend=' || (select count(*) from mail_log where template_key = 'session_changed' and related_id = se1 and status = 'queued')::text
    || ' storniert=' || (select count(*) from mail_log where template_key = 'session_changed' and related_id = se1 and status = 'cancelled')::text
    || ' grund=' || (select min(meta->>'cancel_reason') from mail_log where template_key = 'session_changed' and related_id = se1 and status = 'cancelled'));

  -- Bühne gewechselt, über den echten Weg `move_slot` (veröffentlicht, mit Bestätigung): nur die Bühne steht in der Mail.
  execute 'set local role authenticated';
  perform move_slot(l1, s_b, t_d1 + interval '20 hours', t_d1 + interval '20 hours 30 minutes', true);
  execute 'reset role';
  insert into t_res values ('06_buehne_ueber_move_slot',
    'ok empfaenger=' || (select count(*) from mail_log where template_key = 'session_changed' and related_id = se1 and status = 'queued')::text
    || ' nur_buehne=' || (select bool_and(case m.locale
                                            when 'en' then (m.meta->'vars'->>'changes') ~ '^- \*\*Stage:\*\* before ZZ Mail Buehne A, now ZZ Mail Buehne B$'
                                            else (m.meta->'vars'->>'changes') ~ '^- \*\*Bühne:\*\* bisher ZZ Mail Buehne A, jetzt ZZ Mail Buehne B$' end)
                           from mail_log m where m.template_key = 'session_changed' and m.related_id = se1 and m.status = 'queued')::text);

  -- Titel dazu, erst nur der englische: jede Spalte löst für sich aus, und jede Sprache sieht nur ihren Titel — die deutschen Mails bleiben bei der Bühne.
  select array_agg(id order by id) into v_ids1 from mail_log where template_key = 'session_changed' and related_id = se1 and status = 'queued';
  update session set title_en = 'ZZ New EN' where id = se1;
  insert into t_res values ('06_titel_englisch',
    'ok en_zeile=' || (select bool_and((m.meta->'vars'->>'changes') ~ 'Stage:.*\n- \*\*Title:\*\* before “ZZ Old EN”, now “ZZ New EN”$')
                         from mail_log m where m.id = any (v_ids1) and m.locale = 'en')::text
    || ' de_ohne_titel=' || (select bool_and((m.meta->'vars'->>'changes') !~ 'Titel') from mail_log m where m.id = any (v_ids1) and m.locale = 'de')::text);
  -- … dann der deutsche: dieselben Zeilen, die deutschen jetzt mit Bühne und Titel, die englische behält ihre.
  update session set title_de = 'ZZ Neu DE' where id = se1;
  select array_agg(id order by id) into v_ids2 from mail_log where template_key = 'session_changed' and related_id = se1 and status = 'queued';
  insert into t_res values ('06_titel',
    'ok gleiche_zeilen=' || (v_ids1 = v_ids2 and cardinality(v_ids2) = 4)::text
    || ' de_zeile=' || (select bool_and((m.meta->'vars'->>'changes') ~ 'Bühne:.*\n- \*\*Titel:\*\* bisher „ZZ Alt DE“, jetzt „ZZ Neu DE“$')
                          from mail_log m where m.id = any (v_ids2) and m.locale = 'de')::text
    || ' en_bleibt=' || (select bool_and((m.meta->'vars'->>'changes') ~ 'Title:\*\* before “ZZ Old EN”, now “ZZ New EN”$')
                           from mail_log m where m.id = any (v_ids2) and m.locale = 'en')::text
    || ' alt_titel=' || (select bool_and((m.meta->'vars'->>'alt_title_de') = 'ZZ Alt DE' and (m.meta->'vars'->>'alt_title_en') = 'ZZ Old EN') from mail_log m where m.id = any (v_ids2))::text);

  -- Veröffentlichen ist keine Änderung: der Entwurf S2 wird veröffentlicht, niemand bekommt eine Mail.
  update session set publish_status = 'published', description_de = 'ZZ Beschreibung', title_de = 'ZZ jetzt veröffentlicht', title_en = 'ZZ now published' where id = se2;
  insert into t_res values ('06_veroeffentlichen_mailt_nicht',
    'ok mails=' || (select count(*) from mail_log where template_key in ('session_changed', 'session_changed_partner') and related_id = se2)::text);

  -- Wer in der Wartezeit von der Session entfernt wird, bekommt die wartende Mail nicht mehr (bei der nächsten Änderung).
  delete from session_speaker where session_id = se1 and person_id = p_sp2;
  update slot set start_at = start_at + interval '15 minutes', end_at = end_at + interval '15 minutes' where id = l1;
  select to_jsonb(m) into v_m from mail_log m where m.template_key = 'session_changed' and m.related_id = se1 and m.person_id = p_sp2 order by m.id desc limit 1;
  insert into t_res values ('06_entfernter_speaker',
    'ok storniert=' || ((v_m->>'status') = 'cancelled')::text || ' grund=' || (v_m->'meta'->>'cancel_reason')
    || ' andere_wartend=' || (select count(*) from mail_log where template_key = 'session_changed' and related_id = se1 and status = 'queued')::text);

  -- Nur das Ende verschoben: auch das ist eine Änderung der Zeit.
  update slot set end_at = end_at + interval '5 minutes' where id = l1;
  insert into t_res values ('06_nur_ende',
    'ok zeilen=' || (select count(*) from mail_log where template_key = 'session_changed' and related_id = se1 and status = 'queued')::text
    || ' zeit_neu=' || (select bool_and((m.meta->'vars'->>'changes') like '%jetzt%20:15–20:50%' or (m.meta->'vars'->>'changes') like '%now%20:15–20:50%')
                          from mail_log m where m.template_key = 'session_changed' and m.related_id = se1 and m.status = 'queued')::text);

  -- Nur das Ende (frische Session, nichts Früheres im Fenster): Zeit steht in der Mail, sonst nichts.
  update slot set end_at = end_at + interval '10 minutes' where id = l4;
  insert into t_res values ('06_nur_ende_neu',
    'ok zeilen=' || (select count(*) from mail_log where template_key = 'session_changed' and related_id = se4 and status = 'queued')::text
    || ' zeit=' || (select bool_and((m.meta->'vars'->>'changes') ~ '^- \*\*Time:\*\* before .*20:00–20:30, now .*20:00–20:40$')
                      from mail_log m where m.template_key = 'session_changed' and m.related_id = se4 and m.status = 'queued')::text);
  -- Nur die Bühne (frische Session): auch ein reiner Bühnenwechsel löst aus.
  update slot set stage_id = s_b where id = l5;
  insert into t_res values ('06_nur_buehne',
    'ok zeilen=' || (select count(*) from mail_log where template_key = 'session_changed' and related_id = se5 and status = 'queued')::text
    || ' nur_buehne=' || (select bool_and((m.meta->'vars'->>'changes') ~ '^- \*\*Stage:\*\* before ZZ Mail Buehne C, now ZZ Mail Buehne B$')
                            from mail_log m where m.template_key = 'session_changed' and m.related_id = se5 and m.status = 'queued')::text);

  -- Partner-Session S3: Speaker und Hauptkontakt; die CC-Kontakte hängen an der Mail des Hauptkontakts; S1 hat keinen Partner.
  update slot set start_at = start_at + interval '30 minutes', end_at = end_at + interval '30 minutes' where id = l3;
  select to_jsonb(m) into v_m from mail_log m where m.template_key = 'session_changed_partner' and m.related_id = se3 and m.person_id = p_op;
  insert into t_res values ('06_partner',
    'ok sprecher=' || exists (select 1 from mail_log m where m.template_key = 'session_changed' and m.related_id = se3 and m.person_id = p_sp1 and m.status = 'queued')::text
    || ' partner=' || ((v_m->>'status') = 'queued')::text
    || ' cc=' || ((v_m->'meta'->'cc_person_ids') @> to_jsonb(array[p_cc]))::text
    || ' org_name=' || ((v_m->'meta'->'vars'->>'org_name') = 'ZZ Mail Partner')::text
    || ' kein_partner_bei_s1=' || (not exists (select 1 from mail_log m where m.template_key = 'session_changed_partner' and m.related_id = se1))::text);

  -- Audit: Wartende und Stornierte, ohne Adresse.
  insert into t_res values ('06_audit',
    'ok queued=' || exists (select 1 from audit_log where action = 'mail.session_change' and created_at >= v_t0 and "after"->>'state' = 'queued')::text
    || ' cancelled=' || exists (select 1 from audit_log where action = 'mail.session_change' and created_at >= v_t0 and "after"->>'state' = 'cancelled')::text
    || ' ohne_adresse=' || (not exists (select 1 from audit_log where action = 'mail.session_change' and created_at >= v_t0
                                           and (coalesce("after"::text, '') ~ '@' or coalesce("before"::text, '') ~ '@')))::text);

  -- Das Mail-Protokoll nennt die Frist und den Grund der Stornierung.
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  select m.id into v_id from mail_log m where m.template_key = 'session_changed' and m.related_id = se1 and m.status = 'cancelled' order by m.id limit 1;
  execute 'set local role authenticated';
  v_m := mail_log_detail(v_id);
  execute 'reset role';
  insert into t_res values ('06_detail',
    'ok send_after=' || ((v_m->>'send_after') is not null)::text || ' cancel_reason=' || (v_m->>'cancel_reason'));

  -- Ein Fehler im Mailweg verhindert die Programmänderung nicht (Warnung statt Abbruch).
  execute 'create or replace function session_change_notify(p_session_id uuid, p_old jsonb, p_new jsonb) returns void language plpgsql as $f$ begin raise exception ''ZZ kaputt''; end $f$';
  select start_at into t_start from slot where id = l3;
  begin
    update slot set start_at = start_at + interval '5 minutes', end_at = end_at + interval '5 minutes' where id = l3;
    v_r := 'ok';
  exception when others then v_r := 'FEHLER ' || sqlstate || ' ' || sqlerrm; end;
  insert into t_res values ('06_fehler_im_mailweg',
    case when v_r = 'ok' then 'ok zeit_geaendert=' || ((select start_at from slot where id = l3) = t_start + interval '5 minutes')::text else v_r end);
end $$;
insert into t_res
  select '99_auswertung',
         case when count(*) filter (where not z.erfuellt) = 0 then 'ok: alle ' || count(*)::text || ' Erwartungen erfüllt'
              else 'FEHLER: ' || string_agg(z.step, ', ' order by z.step) filter (where not z.erfuellt) end
    from (select e.step, exists (select 1 from t_res r where r.step = e.step and r.result ~ e.muster) as erfuellt from t_erw e) z;
select * from t_res order by step;
rollback;
