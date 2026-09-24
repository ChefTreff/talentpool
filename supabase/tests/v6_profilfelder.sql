-- Test „Profilfelder Teilnehmer-Portal" (TAL-013, vorschlag/v6_profilfelder.sql). Belegt:
--   01 Vokabular: alle neuen Listen stehen (Anzahl je Liste);
--   02 Spalten-Grants: die sieben neuen Felder schreibbar, cv_path nicht;
--   03 Vokabular-Wächter: gültiger Wert geht, erfundener Wert ⇒ 22023 invalid_vocab_value
--      (detail = Spalte);
--   04 ein später deaktivierter Begriff blockiert das Speichern **anderer** Felder nicht;
--   05 Abschlussjahr außerhalb 1950–2100 ⇒ 23514;
--   06 person_interest nimmt die vier neuen Listen, eine fremde Liste nicht (23514);
--   07 person_language: eigene Zeile anlegen; fremde Person ⇒ RLS verweigert;
--      unbekanntes Niveau ⇒ Fremdschlüssel (23503);
--   08 Lebenslauf-Pfadregel: eigener Pfad lesen/schreiben; fremder Pfad ohne Bewerbung zu;
--   09 Partner der gastgebenden Organisation liest den Lebenslauf **nur** bei consent_share;
--      schreiben darf er nie;
--   10 set_my_cv: fremder Pfad 22023, fehlendes Objekt P0002, Ersetzen meldet das alte
--      Dokument in storage_purge_queue;
--   11 anonymize_person: Lebenslauf angemeldet, job_title/study_program_label/cv_path leer,
--      person_language gelöscht, Porträt-Zeile aus 0149 weiter wirksam (photo_path leer);
--   12 Grants: anon ohne EXECUTE auf set_my_cv, person_vocab_guard für niemanden aufrufbar.
--
-- Probelauf der Build-Session am 24.09.2026 gegen die Live-Datenbank (`sh scripts/db.sh dry-run`,
-- alles zurueckgerollt): 12 von 12 Schritten gruen; `db.sh fn-diff`: anonymize_person nur ergaenzt.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_fremd uuid; v_ed uuid; v_org uuid; v_sess uuid; v_app uuid;
  v_cv text; v_cv2 text; v_fremdcv text; v_n integer; v_s text; v_detail text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  select p.id into v_fremd from person p where p.id <> v_pid and p.deleted_at is null limit 1;
  select e.id into v_ed from event e where e.is_edition order by e.start_date desc limit 1;
  v_cv      := v_pid::text   || '/test-cv-1.pdf';
  v_cv2     := v_pid::text   || '/test-cv-2.pdf';
  v_fremdcv := v_fremd::text || '/test-cv-fremd.pdf';
  insert into storage.objects (bucket_id, name) values
    ('person-cv', v_cv), ('person-cv', v_cv2), ('person-cv', v_fremdcv);

  -- 01 Vokabular
  select string_agg(vocabulary || '=' || n, ',' order by vocabulary) into v_s from (
    select vocabulary, count(*) n from vocab_term
     where vocabulary in ('job_openness','function_area','summit_goal','skill','availability',
                          'work_mode','mobility','spoken_language','language_level')
     group by vocabulary) x;
  insert into t_res values ('01_vokabular',
    case when v_s = 'availability=5,function_area=16,job_openness=3,language_level=4,mobility=4,skill=15,spoken_language=13,summit_goal=6,work_mode=4'
         then 'ok' else v_s end);

  -- 02 Spalten-Grants
  insert into t_res values ('02_spalten_grants',
    case when has_column_privilege('authenticated', 'person', 'job_title', 'UPDATE')
          and has_column_privilege('authenticated', 'person', 'study_program_label', 'UPDATE')
          and has_column_privilege('authenticated', 'person', 'job_openness', 'UPDATE')
          and has_column_privilege('authenticated', 'person', 'function_area', 'UPDATE')
          and has_column_privilege('authenticated', 'person', 'graduation_year', 'UPDATE')
          and has_column_privilege('authenticated', 'person', 'availability', 'UPDATE')
          and has_column_privilege('authenticated', 'person', 'mobility', 'UPDATE')
          and not has_column_privilege('authenticated', 'person', 'cv_path', 'UPDATE')
         then 'ok' else 'FEHLER' end);

  -- 03 Wächter
  update person set function_area = 'data_ai', job_openness = 'open', availability = 'now', mobility = 'europe'
   where id = v_pid;
  begin
    update person set function_area = 'erfunden' where id = v_pid;
    insert into t_res values ('03_waechter', 'ALLOWED (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('03_waechter',
      case when sqlstate = '22023' and sqlerrm = 'invalid_vocab_value' and v_detail = 'function_area'
           then 'ok' else sqlstate || ' ' || sqlerrm || ' ' || coalesce(v_detail, '') end);
  end;

  -- 04 deaktivierter Begriff blockiert nicht
  update vocab_term set active = false where vocabulary = 'function_area' and key = 'data_ai';
  begin
    update person set function_area = 'data_ai', job_title = 'Analystin' where id = v_pid;
    insert into t_res values ('04_deaktiviert_blockiert_nicht',
      case when (select job_title from person where id = v_pid) = 'Analystin' then 'ok' else 'FEHLER' end);
  exception when others then
    insert into t_res values ('04_deaktiviert_blockiert_nicht', 'BLOCKIERT: ' || sqlerrm);
  end;
  update vocab_term set active = true where vocabulary = 'function_area' and key = 'data_ai';

  -- 05 Abschlussjahr
  begin
    update person set graduation_year = 1900 where id = v_pid;
    insert into t_res values ('05_abschlussjahr', 'ALLOWED (BUG)');
  exception when others then
    insert into t_res values ('05_abschlussjahr', case when sqlstate = '23514' then 'ok' else sqlstate end);
  end;

  -- 06 person_interest
  delete from person_interest where person_id = v_pid;
  insert into person_interest (person_id, vocabulary, term_key) values
    (v_pid, 'career_opportunities', 'praktikum'), (v_pid, 'summit_goal', 'network'),
    (v_pid, 'skill', 'strategy'), (v_pid, 'work_mode', 'hybrid');
  begin
    insert into person_interest (person_id, vocabulary, term_key) values (v_pid, 'function_area', 'legal');
    insert into t_res values ('06_person_interest', 'ALLOWED (BUG)');
  exception when others then
    insert into t_res values ('06_person_interest', case when sqlstate = '23514' then 'ok' else sqlstate end);
  end;

  -- Ab hier: Testperson ohne Vorrechte, angemeldet.
  delete from role_assignment where person_id = v_pid;
  delete from org_membership where person_id = v_pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  execute 'set local role authenticated';

  -- 07 person_language (als authenticated, RLS greift)
  insert into person_language (person_id, language, level) values (v_pid, 'de', 'native');
  begin
    insert into person_language (person_id, language, level) values (v_fremd, 'de', 'native');
    v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  begin
    insert into person_language (person_id, language, level) values (v_pid, 'en', 'erfunden');
    v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '23503' then '/ok' else '/' || sqlstate end; end;
  select count(*) into v_n from person_language where person_id = v_pid;
  execute 'reset role';
  insert into t_res values ('07_person_language',
    case when v_s = 'ok/ok' and v_n = 1 then 'ok' else v_s || ' n=' || v_n end);

  -- 08 Pfadregel ohne Bewerbung
  insert into t_res values ('08_cv_pfadregel',
    case when person_cv_path_allowed(v_cv, true) and person_cv_path_allowed(v_cv, false)
          and person_cv_path_allowed(v_fremdcv, false) is false
          and person_cv_path_allowed(v_fremdcv, true) is false
          and person_cv_path_allowed(v_pid::text || '/unter/x.pdf', true) is false
         then 'ok' else 'ALLOWED (BUG)' end);

  -- 09 Partner der gastgebenden Organisation
  insert into organization (legal_name, communication_name, type) values ('CV Test GmbH', 'CV Test', 'corporate')
    returning id into v_org;
  insert into org_membership (person_id, org_id, roles) values (v_pid, v_org, array['main']);
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'partner_contact', 'org', v_org);
  insert into session (event_id, title_de, title_en, format, access_mode, host_org_id)
    values (v_ed, 'CV-Test-Masterclass', 'CV test masterclass', 'masterclass', 'application', v_org)
    returning id into v_sess;
  insert into application (session_id, person_id, answers, consent_share)
    values (v_sess, v_fremd, '{}'::jsonb, false) returning id into v_app;
  v_s := case when person_cv_path_allowed(v_fremdcv, false) is false then 'ok' else 'ALLOWED (BUG)' end;
  update application set consent_share = true where id = v_app;
  v_s := v_s || case when person_cv_path_allowed(v_fremdcv, false) then '/ok' else '/FEHLER' end;
  v_s := v_s || case when person_cv_path_allowed(v_fremdcv, true) is false then '/ok' else '/ALLOWED (BUG)' end;
  insert into t_res values ('09_partner_nur_mit_consent', case when v_s = 'ok/ok/ok' then 'ok' else v_s end);
  delete from role_assignment where person_id = v_pid;

  -- 10 set_my_cv
  begin
    perform set_my_cv(v_fremdcv);
    v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '22023' and sqlerrm = 'path_mismatch' then 'ok' else sqlstate end; end;
  begin
    perform set_my_cv(v_pid::text || '/fehlt.pdf');
    v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = 'P0002' then '/ok' else '/' || sqlstate end; end;
  perform set_my_cv(v_cv);
  perform set_my_cv(v_cv2);
  select count(*) into v_n from storage_purge_queue q where q.bucket = 'person-cv' and q.path = v_cv and q.reason = 'cv_replaced';
  insert into t_res values ('10_set_my_cv',
    case when v_s = 'ok/ok' and v_n = 1 and (select cv_path from person where id = v_pid) = v_cv2 then 'ok' else v_s || ' n=' || v_n end);

  -- 11 anonymize_person (Serverkontext)
  perform set_config('request.jwt.claims', null, true);
  update person set study_program_label = 'International Business', photo_path = v_pid::text || '/p.jpg' where id = v_pid;
  perform anonymize_person(v_pid);
  select count(*) into v_n from storage_purge_queue q where q.bucket = 'person-cv' and q.path = v_cv2;
  insert into t_res values ('11_anonymize',
    case when v_n = 1
          and (select job_title is null and study_program_label is null and cv_path is null and photo_path is null
                 from person where id = v_pid)
          and not exists (select 1 from person_language where person_id = v_pid)
          and not exists (select 1 from person_interest where person_id = v_pid)
         then 'ok' else 'FEHLER' end);

  -- 12 Grants
  insert into t_res values ('12_grants',
    case when not has_function_privilege('anon', 'set_my_cv(text)', 'execute')
          and has_function_privilege('authenticated', 'set_my_cv(text)', 'execute')
          and not has_function_privilege('authenticated', 'person_vocab_guard()', 'execute')
          and not has_table_privilege('anon', 'person_language', 'select')
         then 'ok' else 'FEHLER' end);
end $$;
select * from t_res order by step;
rollback;
