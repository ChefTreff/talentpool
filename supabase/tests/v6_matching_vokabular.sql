-- Smoke-Test (Matching Stufe 1 — Vokabular und Whitelists des Wunschprofils, K-94).
-- Nummer offen. Wegwerf-Organisationen, -Tisch, -Gespräch, -Masterclass, -Tour und -Stopps, echte Partnerrolle des angemeldeten Kontos, alles zurückgerollt.
-- Die Werte der Vokabulare kommen aus dem Bestand (`vocab_term`, je Gruppe der erste aktive Eintrag) — nichts davon ist fest verdrahtet. Belegt:
--   01 Interview Table: das Wunschprofil nimmt jetzt Status, Studienfeld, **Skills, Fachbereich und Kategorie** an (über `partner_update_session`), die übrigen
--      Angaben der Session bleiben;
--   02 Tour-Stopp: dasselbe über `partner_update_tour_stop` (`filled_at` gesetzt);
--   03 **`career_level` fällt heraus:** in beiden Wegen 22023 `invalid_format_details` mit `target_profile.career_level`, der gespeicherte Stand bleibt;
--   04 ein unbekannter Wert je neuem Schlüssel: 22023 `invalid_vocab` mit `<Schlüssel>:<Wert>`, in beiden Wegen;
--   05 **`nicht-interessiert` ist im Wunschprofil gesperrt** (22023 `invalid_vocab`, in beiden Wegen) — obwohl es im Vokabular steht (Vorbedingung geprüft); jeder andere
--      Eintrag von `career_opportunities` geht;
--   06 Masterclass: `format_detail_keys('masterclass')` trägt `target_profile` neben `goodies_planned`; `partner_update_session` speichert beides; ein fremder Schlüssel
--      bleibt abgelehnt; Side-Event und Company Tour nehmen kein `target_profile` an;
--   07 Rechte unverändert: ein Gespräch und ein Stopp einer fremden Organisation 42501;
--   08 Datenkorrektur `matching_career_level_entfernen()` auf eigenen Zeilen: `career_level` verschwindet aus Stopp und Session, die übrigen Schlüssel des Wunschprofils
--      und die übrigen `format_details` bleiben, eine saubere Kontrollzeile bleibt unberührt, ein zweiter Aufruf ändert nichts, kein Audit-Eintrag;
--   09 Härtung: die Funktionen sind SECURITY DEFINER mit festem `search_path` (`format_detail_keys` nur fester `search_path`); der Helfer ist für `anon` und
--      `authenticated` nicht ausführbar;
--   99 Summe: jeder Schritt oben endet auf „(richtig)“ — eine andere Zeile ist ein Befund.
-- Probelauf Bau-Chat 10.10.2026 (`sh scripts/db.sh dry-run`): **33/33 grün** (`99_summe`: „alle 33 Schritte richtig“). Gegenproben auf die Migration: 22 Mutationen (je Schlüssel der
-- Whitelist in beiden Funktionen, `career_level`, die Sperre von `nicht-interessiert` je Weg und Eintrag, die Masterclass, das Side-Event, die Korrektur je Tabelle und im Umfang,
-- Härtung des Helfers, Rechteprüfung am Stopp), alle erkannt.
begin;
create temp table t_res (step text, result text) on commit drop;

-- Wunschprofil aus dem Bestand: der erste aktive Eintrag je Gruppe.
create function pg_temp.ersterwert(p_gruppe text) returns text language sql stable as $f$
  select v.key from vocab_term v where v.vocabulary = p_gruppe and v.active order by v.sort_order, v.key limit 1
$f$;
create function pg_temp.profil() returns jsonb language sql stable as $f$
  select jsonb_build_object(
    'occupation_status', jsonb_build_array(pg_temp.ersterwert('occupation_status')),
    'study_field', jsonb_build_array(pg_temp.ersterwert('study_field')),
    'skill', jsonb_build_array(pg_temp.ersterwert('skill')),
    'function_area', jsonb_build_array(pg_temp.ersterwert('function_area')),
    'career_opportunities', jsonb_build_array(pg_temp.ersterwert('career_opportunities')))
$f$;

do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_summit uuid; v_day uuid; v_start timestamptz;
  v_org uuid; v_fremd uuid; v_stage uuid; v_stage_fremd uuid; v_it uuid; v_it_fremd uuid; v_mc uuid; v_se uuid;
  v_tour uuid; v_stop uuid; v_stop_fremd uuid; v_stop_alt uuid; v_it_alt uuid; v_it_sauber uuid;
  v_txt text; v_n integer; v_n2 integer; v_detail text; v_prof jsonb; v_ret jsonb; v_audit_vorher integer;
  v_alle text[] := array['skill', 'function_area', 'career_opportunities'];
  v_k text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  if v_pid is null then raise exception 'VORBEDINGUNG: keine Person mit Konto'; end if;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_summit from event e where e.edition_id = v_ed order by e.start_date limit 1;
  select ed.id into v_day from event_day ed where ed.event_id = v_summit order by ed.sort_order limit 1;
  if v_day is null then raise exception 'VORBEDINGUNG: Summit ohne Tag'; end if;
  select (ed.day_date + time '09:00') at time zone 'Europe/Berlin' into v_start from event_day ed where ed.id = v_day;
  foreach v_k in array array['occupation_status', 'study_field', 'skill', 'function_area', 'career_opportunities'] loop
    if pg_temp.ersterwert(v_k) is null then raise exception 'VORBEDINGUNG: Vokabular % ist leer', v_k; end if;
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- Aufbau mit Teamrecht; danach ist das Konto nur noch Kontakt der Organisation.
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  insert into organization (legal_name) values ('ZZ Wunschprofil GmbH') returning id into v_org;
  insert into organization (legal_name) values ('ZZ Fremde Wunschprofil GmbH') returning id into v_fremd;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited'), (v_fremd, v_ed, 'invited');
  insert into stage (event_id, name, type, partner_org_id, active) values (v_summit, 'ZZ Wunschprofil Tisch', 'interview_table', v_org, true) returning id into v_stage;
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}');
  v_it := partner_create_session(v_org, 'interview_table', v_stage, v_day, v_start, v_start + interval '20 minutes', 'ZZ Gespraech Wunschprofil', 1,
            jsonb_build_object('interview_mode', 'single', 'job_title', 'ZZ Stelle'), v_ed);
  -- Ein Gespräch einer fremden Organisation an einem eigenen Tisch.
  insert into stage (event_id, name, type, partner_org_id, active) values (v_summit, 'ZZ Fremder Wunschprofil Tisch', 'interview_table', v_fremd, true) returning id into v_stage_fremd;
  v_it_fremd := partner_create_session(v_fremd, 'interview_table', v_stage_fremd, v_day, v_start, v_start + interval '20 minutes', 'ZZ Fremdes Gespraech', 1, '{}'::jsonb, v_ed);
  -- Masterclass und Side-Event als Sessions der Organisation (direkt angelegt, wie im Test der Masterclass-Fragen).
  insert into session (event_id, format, title_de, partner_org_id, host_org_id, access_mode, publish_status, tags)
    values (v_summit, 'masterclass', 'ZZ Masterclass Wunschprofil', v_org, v_org, 'application', 'draft', '{}') returning id into v_mc;
  insert into session (event_id, format, title_de, partner_org_id, host_org_id, access_mode, publish_status, tags)
    values (v_summit, 'side_event', 'ZZ Side-Event Wunschprofil', v_org, v_org, 'application', 'draft', '{}') returning id into v_se;
  -- Eine Tour mit drei Stopps: einer der Organisation, einer der fremden, einer ohne Partner.
  insert into company_tour (edition_id, name, track, starts_at, ends_at, capacity)
    values (v_ed, 'ZZ Wunschprofil Tour', 'ZZTEST', v_start, v_start + interval '3 hours', 10) returning id into v_tour;
  insert into company_tour_stop (tour_id, sort_order, host_org_id, arrival_at, departure_at, target_profile)
    values (v_tour, 1, v_org, v_start, v_start + interval '1 hour', '{}'::jsonb) returning id into v_stop;
  insert into company_tour_stop (tour_id, sort_order, host_org_id, arrival_at, departure_at, target_profile)
    values (v_tour, 2, v_fremd, v_start + interval '1 hour', v_start + interval '2 hours', '{}'::jsonb) returning id into v_stop_fremd;
  delete from role_assignment where person_id = v_pid and role = 'admin';
  if not partner_can_edit(v_org) then raise exception 'VORBEDINGUNG: Konto darf die Organisation nicht bearbeiten'; end if;
  if partner_can_edit(v_fremd) then raise exception 'VORBEDINGUNG: Konto darf die fremde Organisation bearbeiten'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 Interview Table: alle fünf Schlüssel
  perform partner_update_session(v_it, jsonb_build_object('format_details',
    jsonb_build_object('interview_mode', 'single', 'job_title', 'ZZ Stelle', 'target_profile', pg_temp.profil())));
  select s.format_details->'target_profile', s.format_details->>'job_title' into v_prof, v_txt from session s where s.id = v_it;
  insert into t_res values ('01_interview_table_fuenf_schluessel',
    case when v_prof = pg_temp.profil() and v_txt = 'ZZ Stelle' then 'Status, Studienfeld, Skills, Fachbereich und Kategorie gespeichert, die Stelle blieb (richtig)'
         else 'unerwartet: ' || coalesce(v_prof::text, 'leer') || ' / ' || coalesce(v_txt, 'leer') end);

  -- 02 Tour-Stopp: dasselbe
  perform partner_update_tour_stop(v_stop, jsonb_build_object('target_profile', pg_temp.profil()));
  select t.target_profile, (t.filled_at is not null)::text into v_prof, v_txt from company_tour_stop t where t.id = v_stop;
  insert into t_res values ('02_tour_stopp_fuenf_schluessel',
    case when v_prof = pg_temp.profil() and v_txt = 'true' then 'dieselben fünf Schlüssel am Stopp, `filled_at` gesetzt (richtig)'
         else 'unerwartet: ' || coalesce(v_prof::text, 'leer') || ' / ' || coalesce(v_txt, 'leer') end);

  -- 03 `career_level` ist kein Wunschprofil mehr
  begin
    perform partner_update_session(v_it, jsonb_build_object('format_details', jsonb_build_object('target_profile', jsonb_build_object('career_level', jsonb_build_array(pg_temp.ersterwert('career_level'))))));
    insert into t_res values ('03a_career_level_interview_table', 'ALLOWED (BUG)');
  exception
    when sqlstate '22023' then
      get stacked diagnostics v_detail = pg_exception_detail;
      insert into t_res values ('03a_career_level_interview_table',
        case when sqlerrm = 'invalid_format_details' and v_detail = 'target_profile.career_level' then '22023 invalid_format_details, detail target_profile.career_level (richtig)'
             else '22023 ' || sqlerrm || ' / ' || coalesce(v_detail, 'null') end);
    when others then insert into t_res values ('03a_career_level_interview_table', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform partner_update_tour_stop(v_stop, jsonb_build_object('target_profile', jsonb_build_object('career_level', jsonb_build_array(pg_temp.ersterwert('career_level')))));
    insert into t_res values ('03b_career_level_tour_stopp', 'ALLOWED (BUG)');
  exception
    when sqlstate '22023' then
      get stacked diagnostics v_detail = pg_exception_detail;
      insert into t_res values ('03b_career_level_tour_stopp',
        case when sqlerrm = 'invalid_format_details' and v_detail = 'target_profile.career_level' then '22023 invalid_format_details, detail target_profile.career_level (richtig)'
             else '22023 ' || sqlerrm || ' / ' || coalesce(v_detail, 'null') end);
    when others then insert into t_res values ('03b_career_level_tour_stopp', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
  select s.format_details->'target_profile' into v_prof from session s where s.id = v_it;
  select t.target_profile into v_detail from company_tour_stop t where t.id = v_stop;
  insert into t_res values ('03c_stand_bleibt',
    case when v_prof = pg_temp.profil() and v_detail::jsonb = pg_temp.profil() then 'der gespeicherte Stand blieb in beiden Wegen (richtig)' else 'BUG: Stand geändert' end);

  -- 04 Ein unbekannter Wert je neuem Schlüssel
  foreach v_k in array v_alle loop
    begin
      perform partner_update_session(v_it, jsonb_build_object('format_details', jsonb_build_object('target_profile', jsonb_build_object(v_k, jsonb_build_array('gibt_es_nicht')))));
      insert into t_res values ('04a_unbekannter_wert_' || v_k, 'ALLOWED (BUG)');
    exception
      when sqlstate '22023' then
        get stacked diagnostics v_detail = pg_exception_detail;
        insert into t_res values ('04a_unbekannter_wert_' || v_k,
          case when sqlerrm = 'invalid_vocab' and v_detail = v_k || ':gibt_es_nicht' then 'invalid_vocab, detail ' || v_detail || ' (richtig)' else '22023 ' || sqlerrm || ' / ' || coalesce(v_detail, 'null') end);
      when others then insert into t_res values ('04a_unbekannter_wert_' || v_k, 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
    end;
    begin
      perform partner_update_tour_stop(v_stop, jsonb_build_object('target_profile', jsonb_build_object(v_k, jsonb_build_array('gibt_es_nicht'))));
      insert into t_res values ('04b_unbekannter_wert_stopp_' || v_k, 'ALLOWED (BUG)');
    exception
      when sqlstate '22023' then
        get stacked diagnostics v_detail = pg_exception_detail;
        insert into t_res values ('04b_unbekannter_wert_stopp_' || v_k,
          case when sqlerrm = 'invalid_vocab' and v_detail = v_k || ':gibt_es_nicht' then 'invalid_vocab, detail ' || v_detail || ' (richtig)' else '22023 ' || sqlerrm || ' / ' || coalesce(v_detail, 'null') end);
      when others then insert into t_res values ('04b_unbekannter_wert_stopp_' || v_k, 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
    end;
  end loop;

  -- 05 „nicht-interessiert“ gehört zur Person, nicht ins Wunschprofil
  insert into t_res values ('05_vorbedingung',
    case when is_vocab_key('career_opportunities', 'nicht-interessiert') then 'der Eintrag steht im Vokabular — die Sperre ist also eine eigene Regel, kein unbekannter Wert (Vorbedingung stimmt)'
         else 'Vorbedingung fehlt: nicht-interessiert steht nicht mehr im Vokabular — der Test belegt nichts' end);
  begin
    perform partner_update_session(v_it, jsonb_build_object('format_details', jsonb_build_object('target_profile', jsonb_build_object('career_opportunities', jsonb_build_array('praktikum', 'nicht-interessiert')))));
    insert into t_res values ('05a_gesperrt_interview_table', 'ALLOWED (BUG)');
  exception
    when sqlstate '22023' then
      get stacked diagnostics v_detail = pg_exception_detail;
      insert into t_res values ('05a_gesperrt_interview_table',
        case when sqlerrm = 'invalid_vocab' and v_detail = 'career_opportunities:nicht-interessiert' then 'invalid_vocab, detail career_opportunities:nicht-interessiert (richtig)' else '22023 ' || sqlerrm || ' / ' || coalesce(v_detail, 'null') end);
    when others then insert into t_res values ('05a_gesperrt_interview_table', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform partner_update_tour_stop(v_stop, jsonb_build_object('target_profile', jsonb_build_object('career_opportunities', jsonb_build_array('nicht-interessiert'))));
    insert into t_res values ('05b_gesperrt_tour_stopp', 'ALLOWED (BUG)');
  exception
    when sqlstate '22023' then
      get stacked diagnostics v_detail = pg_exception_detail;
      insert into t_res values ('05b_gesperrt_tour_stopp',
        case when sqlerrm = 'invalid_vocab' and v_detail = 'career_opportunities:nicht-interessiert' then 'invalid_vocab, detail career_opportunities:nicht-interessiert (richtig)' else '22023 ' || sqlerrm || ' / ' || coalesce(v_detail, 'null') end);
    when others then insert into t_res values ('05b_gesperrt_tour_stopp', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
  -- Jeder andere Eintrag geht: alle übrigen aktiven Kategorien auf einmal.
  select count(*)::integer into v_n from vocab_term where vocabulary = 'career_opportunities' and active and key <> 'nicht-interessiert';
  perform partner_update_tour_stop(v_stop, jsonb_build_object('target_profile', jsonb_build_object('career_opportunities',
    (select jsonb_agg(key order by sort_order) from vocab_term where vocabulary = 'career_opportunities' and active and key <> 'nicht-interessiert'))));
  select jsonb_array_length(t.target_profile->'career_opportunities') into v_n2 from company_tour_stop t where t.id = v_stop;
  insert into t_res values ('05c_alle_anderen_gehen',
    case when v_n > 0 and v_n = v_n2 then 'alle ' || v_n || ' übrigen Kategorien gespeichert (richtig)' else 'unerwartet: ' || v_n || ' im Vokabular, ' || coalesce(v_n2::text, 'null') || ' gespeichert' end);

  -- 06 Masterclass: Schlüssel und Speichern; Side-Event und Company Tour ohne Wunschprofil
  insert into t_res values ('06a_masterclass_schluessel',
    case when 'target_profile' = any(format_detail_keys('masterclass')) and 'goodies_planned' = any(format_detail_keys('masterclass'))
         then 'target_profile neben goodies_planned (richtig)' else 'BUG: ' || array_to_string(format_detail_keys('masterclass'), ',') end);
  perform partner_update_session(v_mc, jsonb_build_object('format_details',
    jsonb_build_object('goodies_planned', true, 'target_profile', jsonb_build_object('skill', jsonb_build_array(pg_temp.ersterwert('skill'))))));
  select s.format_details into v_prof from session s where s.id = v_mc;
  insert into t_res values ('06b_masterclass_speichert',
    case when v_prof = jsonb_build_object('goodies_planned', true, 'target_profile', jsonb_build_object('skill', jsonb_build_array(pg_temp.ersterwert('skill'))))
         then 'Goodies und Wunschprofil an der Masterclass gespeichert (richtig)' else 'unerwartet: ' || coalesce(v_prof::text, 'leer') end);
  begin
    perform partner_update_session(v_mc, jsonb_build_object('format_details', jsonb_build_object('fremder_schluessel', 1)));
    insert into t_res values ('06c_masterclass_fremder_schluessel', 'ALLOWED (BUG)');
  exception
    when sqlstate '22023' then insert into t_res values ('06c_masterclass_fremder_schluessel', '22023 (richtig)');
    when others then insert into t_res values ('06c_masterclass_fremder_schluessel', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform partner_update_session(v_se, jsonb_build_object('format_details', jsonb_build_object('target_profile', pg_temp.profil())));
    insert into t_res values ('06d_side_event_ohne_wunschprofil', 'ALLOWED (BUG)');
  exception
    when sqlstate '22023' then insert into t_res values ('06d_side_event_ohne_wunschprofil', '22023 (richtig)');
    when others then insert into t_res values ('06d_side_event_ohne_wunschprofil', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
  insert into t_res values ('06e_company_tour_ohne_session_details',
    case when cardinality(format_detail_keys('company_tour')) = 0 and not ('target_profile' = any(format_detail_keys('side_event')))
         then 'Company Tour und Side-Event ohne target_profile (richtig)' else 'BUG' end);

  -- 07 Rechte unverändert
  begin
    perform partner_update_session(v_it_fremd, jsonb_build_object('format_details', jsonb_build_object('target_profile', pg_temp.profil())));
    insert into t_res values ('07a_fremdes_gespraech', 'ALLOWED (BUG)');
  exception
    when sqlstate '42501' then insert into t_res values ('07a_fremdes_gespraech', '42501 (richtig)');
    when others then insert into t_res values ('07a_fremdes_gespraech', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform partner_update_tour_stop(v_stop_fremd, jsonb_build_object('target_profile', pg_temp.profil()));
    insert into t_res values ('07b_fremder_stopp', 'ALLOWED (BUG)');
  exception
    when sqlstate '42501' then insert into t_res values ('07b_fremder_stopp', '42501 (richtig)');
    when others then insert into t_res values ('07b_fremder_stopp', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 08 Datenkorrektur auf eigenen Zeilen (wie die alten Stände: `career_level` neben anderen Schlüsseln)
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  insert into company_tour_stop (tour_id, sort_order, host_org_id, arrival_at, departure_at, target_profile)
    values (v_tour, 3, null, v_start + interval '2 hours', v_start + interval '3 hours',
            jsonb_build_object('career_level', jsonb_build_array('junior'), 'study_field', jsonb_build_array(pg_temp.ersterwert('study_field'))))
    returning id into v_stop_alt;
  v_it_alt := partner_create_session(v_org, 'interview_table', v_stage, v_day, v_start + interval '30 minutes', v_start + interval '50 minutes', 'ZZ Gespraech alt', 1, '{}'::jsonb, v_ed);
  v_it_sauber := partner_create_session(v_org, 'interview_table', v_stage, v_day, v_start + interval '60 minutes', v_start + interval '80 minutes', 'ZZ Gespraech sauber', 1, '{}'::jsonb, v_ed);
  delete from role_assignment where person_id = v_pid and role = 'admin';
  update session set format_details = jsonb_build_object('job_title', 'ZZ alte Stelle', 'target_profile',
           jsonb_build_object('career_level', jsonb_build_array('senior'), 'occupation_status', jsonb_build_array(pg_temp.ersterwert('occupation_status'))))
   where id = v_it_alt;
  update session set format_details = jsonb_build_object('job_title', 'ZZ saubere Stelle', 'target_profile', pg_temp.profil()) where id = v_it_sauber;
  select count(*)::integer into v_audit_vorher from audit_log;
  v_ret := matching_career_level_entfernen();
  select t.target_profile into v_prof from company_tour_stop t where t.id = v_stop_alt;
  insert into t_res values ('08a_stopp_bereinigt',
    case when v_prof = jsonb_build_object('study_field', jsonb_build_array(pg_temp.ersterwert('study_field'))) and (v_ret->>'stops')::integer >= 1
         then 'career_level weg, Studienfeld blieb (richtig)' else 'unerwartet: ' || coalesce(v_prof::text, 'leer') || ' / ' || v_ret::text end);
  select s.format_details into v_prof from session s where s.id = v_it_alt;
  insert into t_res values ('08b_session_bereinigt',
    case when v_prof = jsonb_build_object('job_title', 'ZZ alte Stelle', 'target_profile', jsonb_build_object('occupation_status', jsonb_build_array(pg_temp.ersterwert('occupation_status'))))
              and (v_ret->>'sessions')::integer >= 1
         then 'career_level weg, Status und Stelle blieben (richtig)' else 'unerwartet: ' || coalesce(v_prof::text, 'leer') || ' / ' || v_ret::text end);
  select s.format_details into v_prof from session s where s.id = v_it_sauber;
  insert into t_res values ('08c_kontrollzeile_unberuehrt',
    case when v_prof = jsonb_build_object('job_title', 'ZZ saubere Stelle', 'target_profile', pg_temp.profil()) then 'die saubere Zeile blieb, wie sie war (richtig)' else 'BUG: ' || coalesce(v_prof::text, 'leer') end);
  v_ret := matching_career_level_entfernen();
  insert into t_res values ('08d_idempotent',
    case when (v_ret->>'stops')::integer = 0 and (v_ret->>'sessions')::integer = 0 then 'ein zweiter Aufruf ändert nichts (richtig)' else 'unerwartet: ' || v_ret::text end);
  select count(*)::integer into v_n from audit_log;
  insert into t_res values ('08e_kein_audit',
    case when v_n = v_audit_vorher then 'kein Audit-Eintrag (richtig)' else 'BUG: ' || (v_n - v_audit_vorher) || ' Einträge' end);
end $$;

insert into t_res
select '09a_' || p.proname,
       case when not p.prosecdef then 'BUG: nicht SECURITY DEFINER'
            when not coalesce(p.proconfig::text like '%search_path=public, extensions%', false) then 'BUG: search_path nicht fest'
            else 'SECURITY DEFINER, search_path fest (richtig)' end
  from pg_proc p
 where p.oid in ('check_format_details(text, jsonb, uuid)'::regprocedure, 'partner_update_tour_stop(uuid, jsonb)'::regprocedure, 'matching_career_level_entfernen()'::regprocedure);
insert into t_res
select '09b_format_detail_keys',
       case when not coalesce(p.proconfig::text like '%search_path=public, extensions%', false) then 'BUG: search_path nicht fest' else 'search_path fest (richtig)' end
  from pg_proc p where p.oid = 'format_detail_keys(text)'::regprocedure;
insert into t_res
select '09c_helfer_nicht_ausfuehrbar',
       case when has_function_privilege('anon', 'matching_career_level_entfernen()', 'execute') then 'ALLOWED (BUG): anon'
            when has_function_privilege('authenticated', 'matching_career_level_entfernen()', 'execute') then 'ALLOWED (BUG): authenticated'
            else 'weder anon noch authenticated (richtig)' end;
insert into t_res
select '09d_partner_funktionen_ausfuehrbar',
       case when has_function_privilege('authenticated', 'partner_update_tour_stop(uuid, jsonb)', 'execute')
              and has_function_privilege('authenticated', 'partner_update_session(uuid, jsonb)', 'execute')
              and not has_function_privilege('anon', 'partner_update_tour_stop(uuid, jsonb)', 'execute')
            then 'authenticated ja, anon nein (richtig)' else 'BUG: Rechte verändert' end;

insert into t_res
select '99_summe',
       case when count(*) filter (where result !~ 'richtig|Vorbedingung stimmt') = 0 then 'alle ' || count(*) || ' Schritte richtig'
            else 'BEFUND: ' || count(*) filter (where result !~ 'richtig|Vorbedingung stimmt') || ' von ' || count(*) || ' Schritten nicht richtig' end
  from t_res where step <> '99_summe';

select * from t_res order by step;
rollback;
