-- Smoke-Test (Bewerbungen im Admin: Liste, Filter, Blättern, Sammelentscheidung — ADM-003). Nummer offen.
-- Echter Rollenwechsel des angemeldeten Kontos (erst Admin, dann Partner), Wegwerf-Sessions, -Personen und
-- -Bewerbungen, alles zurückgerollt. Kein Status `applied` (der Mail-Trigger bliebe zwar im Rollback, aber
-- sicher ist sicher), keine freigegebene Session — Entscheidungen lösen hier keine Mail aus. Belegt:
--   01 Liste ohne Filter enthält alle eigenen Bewerbungen, total_count stimmt mit der Zahl überein;
--   02 Filter Format, Session, Status und Einwilligung greifen;
--   03 Suche nach Name und E-Mail, ohne Groß/klein, % gilt wörtlich;
--   04 Blättern: zwei Seiten ohne Überschneidung, total_count gleich, Limit höchstens 200;
--   05 Antworten mit Fragetext; Profil und E-Mail für das Team auch ohne Einwilligung;
--   06 Sammelentscheidung: zwei Absagen klappen (Audit je Bewerbung), eine bestätigte bleibt
--      (`not_decidable`), eine unbekannte Kennung `application_not_found`; falscher Status 22023,
--      mehr als 200 Kennungen 22023 `too_many_applications`;
--   07 Partner einer Gastgeber-Organisation: die Liste bleibt leer (nur Team), die Sammelentscheidung
--      für eine fremde Session nicht erlaubt (`not_allowed`);
--   08 applications_overview liefert das Format;
--   09 Menge: 50 Sessions × 500 Bewerbungen — eine Seite mit und ohne Filter in vertretbarer Zeit;
--   10 Rechte: SECURITY DEFINER, fester search_path, authenticated ja, anon nein; ungültiger Status 22023.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_ev uuid;
  v_org uuid; v_mc1 uuid; v_mc2 uuid; v_it uuid;
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid; v_p5 uuid;
  v_a1 uuid; v_a2 uuid; v_a3 uuid; v_a4 uuid; v_a5 uuid; v_frage uuid;
  v_n integer; v_total bigint; v_txt text; v_ids uuid[]; v_ids2 uuid[];
  v_t0 timestamptz; v_ms1 numeric; v_ms2 numeric; v_ms3 numeric; v_viele uuid[];
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  if v_pid is null then raise exception 'VORBEDINGUNG: keine Person mit Konto'; end if;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_ev from event e where e.edition_id = v_ed and e.format_tag = 'summit' order by e.start_date limit 1;
  if v_ev is null then raise exception 'VORBEDINGUNG: Summit fehlt'; end if;

  insert into organization (legal_name) values ('ZZ Bewerbungsliste GmbH') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited');
  insert into session (event_id, format, title_de, access_mode, publish_status, tags, host_org_id, partner_org_id)
    values (v_ev, 'masterclass', 'ZZ Liste Masterclass Eins', 'application', 'draft', '{}', v_org, v_org) returning id into v_mc1;
  insert into session (event_id, format, title_de, access_mode, publish_status, tags)
    values (v_ev, 'masterclass', 'ZZ Liste Masterclass Zwei', 'application', 'draft', '{}') returning id into v_mc2;
  insert into session (event_id, format, title_de, access_mode, publish_status, tags)
    values (v_ev, 'interview_table', 'ZZ Liste Tisch', 'application', 'draft', '{}') returning id into v_it;
  insert into session_question (session_id, label_de, label_en, type, required, sort_order, purpose)
    values (v_mc1, 'ZZ Warum?', 'ZZ Why?', 'textarea', false, 1, 'Test') returning id into v_frage;

  insert into person (first_name, last_name, city) values ('ZZListe', 'Anna', 'Hamburg') returning id into v_p1;
  insert into person_email (person_id, email, is_primary) values (v_p1, 'zz-liste-anna@example.org', true);
  insert into person (first_name, last_name) values ('ZZListe', 'Bert') returning id into v_p2;
  insert into person_email (person_id, email, is_primary) values (v_p2, 'zz-liste-bert@example.org', true);
  insert into person (first_name, last_name) values ('ZZListe', 'Cora') returning id into v_p3;
  insert into person (first_name, last_name) values ('ZZListe', 'Dora') returning id into v_p4;
  insert into person (first_name, last_name) values ('ZZListe', 'Emil 100%') returning id into v_p5;
  insert into application (session_id, person_id, status, consent_share, answers)
    values (v_mc1, v_p1, 'shortlisted', true, jsonb_build_object(v_frage::text, 'Weil')) returning id into v_a1;
  insert into application (session_id, person_id, status, consent_share)
    values (v_mc1, v_p2, 'waitlisted', false) returning id into v_a2;
  insert into application (session_id, person_id, status, consent_share)
    values (v_mc2, v_p3, 'shortlisted', true) returning id into v_a3;
  insert into application (session_id, person_id, status, consent_share)
    values (v_it, v_p4, 'confirmed', true) returning id into v_a4;
  insert into application (session_id, person_id, status, consent_share)
    values (v_it, v_p5, 'declined', false) returning id into v_a5;

  -- Team: Admin
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 ohne Filter (eigene Zeilen über die Suche „ZZListe“ eingegrenzt)
  select count(*), max(total_count) into v_n, v_total
    from applications_admin_list(p_query => 'zzliste', p_limit => 200);
  insert into t_res values ('01_alle',
    case when v_n = 5 and v_total = 5 then 'fünf Bewerbungen, total_count 5 (richtig)'
         else 'unerwartet: ' || v_n || ' Zeilen, total ' || coalesce(v_total::text, 'null') end);

  -- 02 Filter
  select string_agg(display_name, ', ' order by display_name) into v_txt
    from applications_admin_list(p_format => 'masterclass', p_query => 'zzliste');
  insert into t_res values ('02a_format',
    case when v_txt = 'ZZListe Anna, ZZListe Bert, ZZListe Cora' then 'nur Masterclasses (richtig)' else 'unerwartet: ' || coalesce(v_txt, 'null') end);
  select count(*) into v_n from applications_admin_list(p_session_id => v_mc1);
  insert into t_res values ('02b_session', case when v_n = 2 then 'zwei in Masterclass Eins (richtig)' else 'unerwartet: ' || v_n end);
  select string_agg(display_name, ', ' order by display_name) into v_txt
    from applications_admin_list(p_status => 'shortlisted', p_query => 'zzliste');
  insert into t_res values ('02c_status',
    case when v_txt = 'ZZListe Anna, ZZListe Cora' then 'nur vorgemerkte (richtig)' else 'unerwartet: ' || coalesce(v_txt, 'null') end);
  select string_agg(display_name, ', ' order by display_name) into v_txt
    from applications_admin_list(p_consent => false, p_query => 'zzliste');
  insert into t_res values ('02d_einwilligung',
    case when v_txt = 'ZZListe Bert, ZZListe Emil 100%' then 'nur ohne Einwilligung (richtig)' else 'unerwartet: ' || coalesce(v_txt, 'null') end);

  -- 03 Suche
  select count(*) into v_n from applications_admin_list(p_query => 'ZZLISTE ANNA');
  select count(*) into v_total from applications_admin_list(p_query => 'zz-liste-bert@');
  select count(*) into v_ms1 from applications_admin_list(p_query => '100%');
  select count(*) into v_ms2 from applications_admin_list(p_query => 'zzliste%cora');
  insert into t_res values ('03_suche',
    case when v_n = 1 and v_total = 1 and v_ms1 = 1 and v_ms2 = 0
         then 'Name ohne Groß/klein, E-Mail, % wörtlich (richtig)'
         else 'unerwartet: Name ' || v_n || ', E-Mail ' || v_total || ', 100% ' || v_ms1 || ', zzliste%cora ' || v_ms2 end);

  -- 04 Blättern
  select array_agg(id order by id) into v_ids from applications_admin_list(p_query => 'zzliste', p_limit => 3, p_offset => 0);
  select array_agg(id order by id) into v_ids2 from applications_admin_list(p_query => 'zzliste', p_limit => 3, p_offset => 3);
  select count(*) into v_n from applications_admin_list(p_query => 'zzliste', p_limit => 100000);
  insert into t_res values ('04_blaettern',
    case when cardinality(v_ids) = 3 and cardinality(v_ids2) = 2 and not (v_ids && v_ids2) and v_n = 5
         then 'Seite 1: 3, Seite 2: 2, keine Überschneidung (richtig)'
         else 'unerwartet: ' || coalesce(cardinality(v_ids), 0) || ' / ' || coalesce(cardinality(v_ids2), 0) || ' / ' || v_n end);
  select count(*) into v_n from (select 1 from applications_admin_list(p_limit => 100000)) x;
  insert into t_res values ('04b_limit', case when v_n <= 200 then 'höchstens 200 je Abruf (richtig)' else 'BUG: ' || v_n end);

  -- 05 Antworten und Daten fürs Team
  select answers->0->>'label_de' || '=' || (answers->0->>'value') into v_txt from applications_admin_list(p_session_id => v_mc1) where id = v_a1;
  select count(*) into v_n from applications_admin_list(p_session_id => v_mc1)
   where id = v_a2 and display_name = 'ZZListe Bert' and email = 'zz-liste-bert@example.org' and not consent_share;
  insert into t_res values ('05_daten',
    case when v_txt = 'ZZ Warum?=Weil' and v_n = 1 then 'Fragetext, Name und E-Mail auch ohne Einwilligung fürs Team (richtig)'
         else 'unerwartet: ' || coalesce(v_txt, 'null') || ', ' || v_n end);

  -- 06 Sammelentscheidung
  select string_agg(application_id::text || ':' || ok::text || ':' || coalesce(error_key, ''), ',' order by application_id) into v_txt
    from decide_applications(array[v_a1, v_a3, v_a4, gen_random_uuid(), v_a1], 'declined');
  select count(*) into v_n from application where id in (v_a1, v_a3) and status = 'declined';
  select count(*) into v_total from audit_log where action = 'application.decide' and object_id in (v_a1::text, v_a3::text);
  insert into t_res values ('06a_sammel',
    case when v_n = 2 and v_total = 2
              and v_txt like '%' || v_a4::text || ':false:not_decidable%'
              and v_txt like '%:false:application_not_found%'
              and (select status from application where id = v_a4) = 'confirmed'
              and (length(v_txt) - length(replace(v_txt, ',', ''))) = 3
         then 'zwei abgesagt mit Audit je Bewerbung, bestätigte bleibt, unbekannte gemeldet, doppelte Kennung einmal (richtig)'
         else 'unerwartet: ' || coalesce(v_txt, 'null') || ' / abgesagt ' || v_n || ' / Audit ' || v_total end);
  begin
    perform * from decide_applications(array[v_a3], 'confirmed');
    insert into t_res values ('06b_status', 'ALLOWED (BUG)');
  exception when sqlstate '22023' then
    insert into t_res values ('06b_status', case when sqlerrm = 'invalid_decision' then 'invalid_decision (richtig)' else '22023 ' || sqlerrm end);
  end;
  begin
    perform * from decide_applications(array(select gen_random_uuid() from generate_series(1, 201)), 'declined');
    insert into t_res values ('06c_zu_viele', 'ALLOWED (BUG)');
  exception when sqlstate '22023' then
    insert into t_res values ('06c_zu_viele', case when sqlerrm = 'too_many_applications' then 'too_many_applications (richtig)' else '22023 ' || sqlerrm end);
  end;

  -- 08 Format in der Übersicht
  select string_agg(format, ',' order by title_de) into v_txt
    from applications_overview() where session_id in (v_mc1, v_mc2, v_it);
  insert into t_res values ('08_overview_format',
    case when v_txt = 'masterclass,masterclass,interview_table' then 'Format je Session (richtig)' else 'unerwartet: ' || coalesce(v_txt, 'null') end);

  -- 09 Menge: 50 Sessions × 500 Bewerbungen
  with s as (
    insert into session (event_id, format, title_de, access_mode, publish_status, tags)
    select v_ev, case when g % 5 = 0 then 'interview_table' else 'masterclass' end, 'ZZ Menge ' || g, 'application', 'draft', '{}'
      from generate_series(1, 50) g
    returning id
  ), p as (
    insert into person (first_name, last_name)
    select 'ZZMenge', 'Nr ' || g from generate_series(1, 25000) g
    returning id
  ), pn as (select id, row_number() over () as n from p),
     sn as (select id, row_number() over () as n from s)
  insert into application (session_id, person_id, status, consent_share)
  select sn.id, pn.id,
         case pn.n % 4 when 0 then 'shortlisted' when 1 then 'waitlisted' when 2 then 'declined' else 'accepted' end,
         pn.n % 3 <> 0
    from pn join sn on sn.n = ((pn.n - 1) % 50) + 1;
  -- Wie im Betrieb (Autovacuum): Statistiken nach dem Masseneinfügen, sonst plant die Datenbank für
  -- leere Tabellen.
  analyze session;
  analyze person;
  analyze application;

  v_t0 := clock_timestamp();
  select count(*), max(total_count) into v_n, v_total from applications_admin_list(p_limit => 50);
  v_ms1 := extract(epoch from clock_timestamp() - v_t0) * 1000;
  v_t0 := clock_timestamp();
  perform * from applications_admin_list(p_format => 'masterclass', p_status => 'shortlisted', p_consent => true, p_limit => 50, p_offset => 2000);
  v_ms2 := extract(epoch from clock_timestamp() - v_t0) * 1000;
  v_t0 := clock_timestamp();
  perform * from applications_admin_list(p_query => 'nr 2499', p_limit => 50);
  v_ms3 := extract(epoch from clock_timestamp() - v_t0) * 1000;
  insert into t_res values ('09_menge',
    case when v_n = 50 and v_total >= 25000 and v_ms1 < 3000 and v_ms2 < 3000 and v_ms3 < 3000
         then 'Seite aus ' || v_total || ' Bewerbungen: ' || round(v_ms1) || ' ms, gefiltert ' || round(v_ms2) || ' ms, Suche ' || round(v_ms3) || ' ms (richtig)'
         else 'zu langsam oder falsch: ' || v_n || ' Zeilen, total ' || v_total || ', ' || round(v_ms1) || '/' || round(v_ms2) || '/' || round(v_ms3) || ' ms' end);
  -- Sammelentscheidung mit 200 Kennungen in einem Aufruf
  select array_agg(a.id) into v_viele from (select a.id from application a join person p on p.id = a.person_id
                                             where p.first_name = 'ZZMenge' and a.status <> 'confirmed' limit 200) a;
  v_t0 := clock_timestamp();
  select count(*) filter (where ok) into v_n from decide_applications(v_viele, 'waitlisted');
  v_ms1 := extract(epoch from clock_timestamp() - v_t0) * 1000;
  insert into t_res values ('09b_sammel_200',
    case when v_n = 200 and v_ms1 < 5000 then '200 in einem Aufruf: ' || round(v_ms1) || ' ms (richtig)'
         else 'unerwartet: ' || v_n || ' ok, ' || round(v_ms1) || ' ms' end);

  -- 07 Partner der Gastgeber-Organisation (kein Team)
  delete from role_assignment where person_id = v_pid;
  insert into org_membership (person_id, org_id, roles) values (v_pid, v_org, '{additional}');
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'partner_contact', 'org', v_org);
  if is_application_team(v_mc1) then raise exception 'VORBEDINGUNG: Konto ist noch Team'; end if;
  select count(*) into v_n from applications_admin_list(p_session_id => v_mc1);
  select string_agg(coalesce(error_key, 'ok'), ',') into v_txt from decide_applications(array[v_a3], 'accepted');
  insert into t_res values ('07_partner',
    case when v_n = 0 and v_txt = 'not_allowed' then 'Liste leer, fremde Session nicht erlaubt (richtig)'
         else 'unerwartet: ' || v_n || ' Zeilen, ' || coalesce(v_txt, 'null') end);
  begin
    perform * from applications_admin_list(p_status => 'irgendwas');
    insert into t_res values ('10b_status', 'ALLOWED (BUG)');
  exception when sqlstate '22023' then
    insert into t_res values ('10b_status', case when sqlerrm = 'invalid_status' then 'invalid_status (richtig)' else '22023 ' || sqlerrm end);
  end;
end $$;

insert into t_res
select '10_rechte',
       case when count(*) filter (where p.prosecdef
                                    and coalesce(p.proconfig::text like '%search_path=public, extensions%', false)
                                    and has_function_privilege('authenticated', p.oid, 'execute')
                                    and not has_function_privilege('anon', p.oid, 'execute')) = 3
            then 'drei Funktionen: SECURITY DEFINER, search_path fest, authenticated ja, anon nein (richtig)'
            else 'BUG: ' || string_agg(p.proname, ', ') end
  from pg_proc p
 where p.oid in ('applications_admin_list(uuid, text, uuid, text, boolean, text, integer, integer)'::regprocedure,
                 'decide_applications(uuid[], text)'::regprocedure,
                 'applications_overview(uuid)'::regprocedure);

select * from t_res order by step;
rollback;
