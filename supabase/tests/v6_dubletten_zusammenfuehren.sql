-- Test zu `v6_dubletten_zusammenfuehren` (ADM-036). Belegt:
--   01 ohne Admin-Rolle 42501 auf alle sechs Funktionen — auch für eine Teamrolle;
--   02 Vorschau zählt richtig (umgehängt, doppelt gefallen, gefüllt, Konto) und
--      lässt **nichts** zurück: B existiert danach, A ist unverändert;
--   03 Konflikt (zwei Volunteer-Profile derselben Edition): Vorschau nennt die
--      Tabelle, `merge_persons` bricht mit merge_conflict ab, D und sein Profil
--      sind unversehrt;
--   04 Zusammenführen: B weg, alles zeigt auf A; leeres Feld gefüllt, volles nicht
--      überschrieben; Adressen mitgenommen, primäre bleibt; Organisationsrollen
--      vereinigt; Konto umgezogen; Protokoll + Audit;
--   05 Liste der Zusammenführungen: Name der zweiten Person, Rückweg möglich;
--   06 Rückweg: B mit derselben ID, primäre Adresse, Interessen (auch die
--      gefallene), Mitgliedschaft und Rollen wie vorher, Feld wieder leer,
--      Konto zurück; zweiter Rückweg: merge_already_undone;
--   07 zwei Konten: both_accounts; gleiche Person: same_person;
--   08 Löschung der bleibenden Person leert das Protokoll → merge_undo_unavailable;
--   09 Dublettensuche findet gleiche LinkedIn-Adresse; Kandidatenliste mit Namen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_me uuid; v_uid uuid; v_email text; v_txt text; v_n integer; v_j jsonb; v_log uuid; v_log2 uuid;
  v_a uuid; v_b uuid; v_d uuid; v_x uuid; v_y uuid; v_org uuid; v_ed uuid;
  v_acct uuid := gen_random_uuid(); v_acct2 uuid := gen_random_uuid();
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  select id into v_ed from event order by start_date desc nulls last limit 1;
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'partner_team', 'global');

  insert into auth.users (id, email, aud, role) values
    (v_acct, 'zztest-dublette-b@example.org', 'authenticated', 'authenticated'),
    (v_acct2, 'zztest-dublette-x@example.org', 'authenticated', 'authenticated');
  insert into organization (legal_name) values ('ZZTEST Dubletten GmbH') returning id into v_org;

  -- A bleibt, B geht. A hat Vornamen, B Telefon; beide Interesse engineering-tech.
  insert into person (first_name, last_name) values ('Anna', 'ZZTEST-Dublette') returning id into v_a;
  insert into person_email (person_id, email, is_primary) values (v_a, 'zztest-dublette-a@example.org', true);
  insert into person (first_name, last_name, phone, auth_user_id) values ('Anne', 'ZZTEST-Dublette', '+49 30 1234', v_acct) returning id into v_b;
  insert into person_email (person_id, email, is_primary) values
    (v_b, 'zztest-dublette-b@example.org', true), (v_b, 'zztest-dublette-b2@example.org', false);
  insert into person_interest (person_id, vocabulary, term_key) values
    (v_a, 'interests', 'engineering-tech'), (v_b, 'interests', 'engineering-tech'), (v_b, 'interests', 'finance-banking');
  insert into org_membership (person_id, org_id, roles) values (v_a, v_org, '{primary_ops}'), (v_b, v_org, '{billing}');
  insert into consent_record (person_id, consent_type, version, granted, granted_at, source)
    values (v_b, 'newsletter', 'zz-1', true, now(), 'portal');
  insert into volunteer_profile (person_id, edition_id, areas, day_prefs) values (v_b, v_ed, '{}', '{}');

  -- 01 · ohne Admin
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  v_txt := '';
  begin perform person_merge_preview(v_a, v_b); v_txt := v_txt || 'preview ERLAUBT; '; exception when sqlstate '42501' then v_txt := v_txt || 'preview 42501; '; end;
  begin perform merge_persons(v_a, v_b); v_txt := v_txt || 'merge ERLAUBT; '; exception when sqlstate '42501' then v_txt := v_txt || 'merge 42501; '; end;
  begin perform unmerge_persons(gen_random_uuid()); v_txt := v_txt || 'unmerge ERLAUBT; '; exception when sqlstate '42501' then v_txt := v_txt || 'unmerge 42501; '; end;
  begin perform person_merges_admin(); v_txt := v_txt || 'merges ERLAUBT; '; exception when sqlstate '42501' then v_txt := v_txt || 'merges 42501; '; end;
  begin perform duplicate_candidates_admin(); v_txt := v_txt || 'candidates ERLAUBT; '; exception when sqlstate '42501' then v_txt := v_txt || 'candidates 42501; '; end;
  begin perform duplicate_scan(); v_txt := v_txt || 'scan ERLAUBT'; exception when sqlstate '42501' then v_txt := v_txt || 'scan 42501'; end;
  insert into t_res values ('01_ohne_admin', v_txt);

  perform set_config('request.jwt.claims', '', true);
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 02 · Vorschau
  v_j := person_merge_preview(v_a, v_b);
  select string_agg(m->>'table' || '.' || (m->>'column') || '=' || (m->>'rows'), ' ' order by m->>'table')
    into v_txt from jsonb_array_elements(v_j->'moved') m;
  insert into t_res values ('02a_vorschau_umgehaengt', coalesce(v_txt, '-')
    || ' (erwartet consent_record.person_id=1 person_interest.person_id=1 volunteer_profile.person_id=1)');
  select string_agg(m->>'table' || '=' || (m->>'rows'), ' ' order by m->>'table') into v_txt from jsonb_array_elements(v_j->'deduplicated') m;
  insert into t_res values ('02b_vorschau_doppelt', coalesce(v_txt, '-') || ' (erwartet org_membership=1 person_interest=1)');
  insert into t_res values ('02e_vorschau_personen', (v_j->'survivor'->>'name') || ' / ' || (v_j->'merged'->>'name')
    || ' konto=' || (v_j->'merged'->>'has_account') || ' (erwartet Anna ZZTEST-Dublette / Anne ZZTEST-Dublette konto=true)');
  insert into t_res values ('02c_vorschau_rest', 'gefuellt=' || (v_j->'filled')::text || ' adressen=' || (v_j->>'emails')
    || ' konto=' || (v_j->>'account_moved') || ' hindernisse=' || (v_j->'blocking')::text
    || ' (erwartet ["phone", "phone_e164"] 2 true [])');
  select count(*) into v_n from person where id = v_b;
  select coalesce(phone, '-') into v_txt from person where id = v_a;
  insert into t_res values ('02d_vorschau_ohne_spur', 'B da=' || v_n || ', A.phone=' || v_txt
    || ', B-Interessen=' || (select count(*) from person_interest where person_id = v_b)
    || ' (erwartet 1, -, 2)');

  -- 03 · Konflikt: D hat ebenfalls ein Volunteer-Profil derselben Edition — mit A geht es nicht.
  insert into person (first_name, last_name) values ('Dora', 'ZZTEST-Konflikt') returning id into v_d;
  insert into person_email (person_id, email, is_primary) values (v_d, 'zztest-dublette-d@example.org', true);
  insert into volunteer_profile (person_id, edition_id, areas, day_prefs) values (v_a, v_ed, '{}', '{}'), (v_d, v_ed, '{}', '{}');
  v_j := person_merge_preview(v_a, v_d);
  select string_agg(m->>'table', ',') into v_txt from jsonb_array_elements(v_j->'conflicts') m;
  insert into t_res values ('03a_konflikt_vorschau', coalesce(v_txt, '-') || ' ' || (v_j->'blocking')::text || ' (erwartet volunteer_profile ["conflicts"])');
  begin
    perform merge_persons(v_a, v_d); v_txt := 'ZUSAMMENGEFUEHRT';
  exception when sqlstate 'P0001' then v_txt := sqlerrm;
  end;
  insert into t_res values ('03b_konflikt_merge', v_txt || ', D da=' || (select count(*) from person where id = v_d)
    || ', D-Profil=' || (select count(*) from volunteer_profile where person_id = v_d) || ' (erwartet merge_conflict, 1, 1)');
  delete from volunteer_profile where person_id = v_a;

  -- 04 · Zusammenführen
  v_log := merge_persons(v_a, v_b);
  insert into t_res values ('04a_b_weg', (select count(*) from person where id = v_b)::text || ' (erwartet 0)');
  insert into t_res values ('04b_zeigt_auf_a',
    'volunteer=' || (select count(*) from volunteer_profile where person_id = v_a)
    || ' consent=' || (select count(*) from consent_record where person_id = v_a)
    || ' interessen=' || (select string_agg(term_key, ',' order by term_key) from person_interest where person_id = v_a)
    || ' (erwartet 1 1 engineering-tech,finance-banking)');
  select first_name || '/' || coalesce(phone, '-') || '/' || ((auth_user_id = v_acct)::text) into v_txt from person where id = v_a;
  insert into t_res values ('04c_felder_konto', v_txt || ' (erwartet Anna/+49 30 1234/true)');
  select count(*)::text || ', primaer=' || (select email::text from person_email where person_id = v_a and is_primary) into v_txt
    from person_email where person_id = v_a;
  insert into t_res values ('04d_adressen', v_txt || ' (erwartet 3, primaer=zztest-dublette-a@example.org)');
  select array_to_string(roles, ',') || ' n=' || (select count(*) from org_membership where org_id = v_org) into v_txt
    from org_membership where person_id = v_a and org_id = v_org;
  insert into t_res values ('04e_org_rollen', v_txt || ' (erwartet billing,primary_ops n=1)');
  select count(*) into v_n from audit_log where action = 'person.merge' and object_id = v_a::text;
  insert into t_res values ('04f_protokoll', 'log=' || (select count(*) from person_merge_log where id = v_log and merged_person_id = v_b)
    || ' audit=' || v_n || ' (erwartet 1 1)');

  -- 05 · Liste
  select x.merged_name || ' ' || x.merged_email || ' undo=' || x.can_undo || ' rows>0=' || (x.moved_rows > 0) into v_txt
    from person_merges_admin() x where x.id = v_log;
  insert into t_res values ('05_liste', coalesce(v_txt, '-') || ' (erwartet Anne ZZTEST-Dublette zztest-dublette-b@example.org undo=true rows>0=true)');

  -- 06 · Rückweg
  perform unmerge_persons(v_log);
  select first_name || '/' || coalesce(phone, '-') || '/' || ((auth_user_id = v_acct)::text) into v_txt from person where id = v_b;
  insert into t_res values ('06a_b_zurueck', coalesce(v_txt, '-') || ' (erwartet Anne/+49 30 1234/true)');
  insert into t_res values ('06b_a_wie_vorher',
    (select coalesce(phone, '-') || '/' || coalesce(auth_user_id::text, 'kein Konto') from person where id = v_a)
    || ' adressen=' || (select count(*) from person_email where person_id = v_a)
    || ' (erwartet -/kein Konto adressen=1)');
  insert into t_res values ('06c_b_daten',
    'primaer=' || (select email::text from person_email where person_id = v_b and is_primary)
    || ' adressen=' || (select count(*) from person_email where person_id = v_b)
    || ' interessen=' || (select string_agg(term_key, ',' order by term_key) from person_interest where person_id = v_b)
    || ' volunteer=' || (select count(*) from volunteer_profile where person_id = v_b)
    || ' consent=' || (select count(*) from consent_record where person_id = v_b)
    || ' (erwartet zztest-dublette-b@example.org 2 engineering-tech,finance-banking 1 1)');
  insert into t_res values ('06d_org',
    (select string_agg(case when person_id = v_a then 'A' else 'B' end || ':' || array_to_string(roles, ','), ' ' order by person_id = v_b)
       from org_membership where org_id = v_org) || ' (erwartet A:primary_ops B:billing)');
  begin
    perform unmerge_persons(v_log); v_txt := 'NOCHMAL ZURUECK';
  exception when sqlstate 'P0001' then v_txt := sqlerrm;
  end;
  insert into t_res values ('06e_zweimal', v_txt || ' undone=' || ((select undone_at from person_merge_log where id = v_log) is not null)
    || ' (erwartet merge_already_undone undone=true)');

  -- 07 · zwei Konten, gleiche Person
  insert into person (first_name, last_name, auth_user_id) values ('Xaver', 'ZZTEST-Konto', v_acct2) returning id into v_x;
  insert into person_email (person_id, email, is_primary) values (v_x, 'zztest-dublette-x@example.org', true);
  v_j := person_merge_preview(v_x, v_b);
  begin perform person_merge_preview(v_a, v_a); v_txt := 'ERLAUBT'; exception when sqlstate '22023' then v_txt := sqlerrm; end;
  insert into t_res values ('07_konten_gleich', (v_j->'blocking')::text || ' ' || v_txt || ' (erwartet ["both_accounts"] same_person)');

  -- 08 · Löschung der bleibenden Person: kein Rückweg mehr
  v_log2 := merge_persons(v_a, v_b);
  perform set_config('request.jwt.claims', '', true);
  perform anonymize_person(v_a);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin
    perform unmerge_persons(v_log2); v_txt := 'ZURUECK';
  exception when sqlstate 'P0001' then v_txt := sqlerrm;
  end;
  insert into t_res values ('08_loeschung', 'payload=' || coalesce((select payload::text from person_merge_log where id = v_log2), 'null')
    || ' ' || v_txt || ' (erwartet payload=null merge_undo_unavailable)');

  -- 09 · Suche und Kandidaten
  insert into person (first_name, last_name, linkedin_normalized) values ('Yara', 'ZZTEST-Suche', 'zztest-linkedin-dublette') returning id into v_y;
  insert into person_email (person_id, email, is_primary) values (v_y, 'zztest-dublette-y1@example.org', true);
  update person set linkedin_normalized = 'zztest-linkedin-dublette' where id = v_x;
  v_n := duplicate_scan();
  select string_agg(x.name_a || '+' || x.name_b || ':' || (x.signals ? 'linkedin')::text, ' ') into v_txt
    from duplicate_candidates_admin('open') x
   where least(x.person_a, x.person_b) = least(v_x, v_y) and greatest(x.person_a, x.person_b) = greatest(v_x, v_y);
  insert into t_res values ('09_suche', 'neu>=1=' || (v_n >= 1) || ' ' || coalesce(v_txt, '-') || ' (erwartet neu>=1=true, Paar mit linkedin:true)');
end $$;
select * from t_res order by step;
rollback;
