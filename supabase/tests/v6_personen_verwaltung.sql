-- Test zu `v6_personen_verwaltung` (ADM-091, ADM-092). Belegt (nur über eigene ZZTEST-Zeilen):
--   01 Suche: Wort im Namen, Wörter in beliebiger Reihenfolge, Teil der E-Mail, `_` im Arbeitgeber als Zeichen
--      (kein Muster); Gesamtzahl und Seiten (Limit/Offset) stimmen, Sortierung `name` und `neu`;
--   02 Filter: Konto-Status (ohne_login/login/gesperrt/antrag/geloescht/alle), aktive Rolle, Edition (angemeldet);
--      unbekannter Konto-Status oder unbekannte Sortierung ⇒ 22023 invalid_filter;
--   03 update_person_master: geänderte Felder kommen zurück, ein zweiter gleicher Aufruf ändert nichts und
--      protokolliert nicht; Protokoll hat Vorher/Nachher ohne Telefon und Geburtsdatum (nur der Feldname);
--      unbekanntes Feld, falsches Vokabular, kaputtes Datum, Zukunft, falsche LinkedIn-Adresse, falsche Sprache ⇒
--      invalid_person_field; anonymisierte Person ⇒ person_anonymized; unbekannte Person ⇒ person_not_found;
--   04 manage_person_email: hinzufügen, doppelt ⇒ person_email_taken (mit Besitzer), ungültig ⇒ invalid_email,
--      primär wechseln (danach genau eine), primäre entfernen ⇒ primary_email_required, nicht-primäre entfernen,
--      berichtigen ohne Login ok (verified false), mit Login ⇒ login_email_locked; kein Protokolleintrag enthält
--      eine Adresse; unbekannte Aktion ⇒ 22023;
--   05 Rechte: ohne Abschnitt persons 42501 für alle drei Funktionen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_me uuid; v_uid uuid; v_email text; v_txt text; v_n integer; v_m integer;
  v_a uuid; v_b uuid; v_c uuid; v_ed uuid; v_mail_id uuid; v_mail_id2 uuid; v_aud jsonb; v_felder text[]; v_rows integer; v_detail text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');

  insert into person (first_name, last_name, employer_name) values ('Anna', 'Zzfinder', 'ZZ Firma GmbH') returning id into v_a;
  insert into person_email (person_id, email, is_primary) values (v_a, 'anna@zzliste.test', true);
  insert into person (first_name, last_name, employer_name) values ('Bernd', 'Zzfinder', 'ZZ_Firma AG') returning id into v_b;
  insert into person_email (person_id, email, is_primary) values (v_b, 'bernd@zzliste.test', true);
  insert into person (first_name, last_name) values ('Carla', 'Zzandere') returning id into v_c;
  insert into person_email (person_id, email, is_primary) values (v_c, 'carla@zzliste.test', true);
  insert into event (name, format_tag, slug, is_edition, start_date) values ('ZZTEST Edition Personen', 'edition', 'zztest-personen', true, now() - interval '12 years') returning id into v_ed;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 · Suche, Seiten, Sortierung
  select count(*) into v_n from persons_admin_list(p_query => 'zzfinder');
  v_txt := 'name=' || v_n;
  select count(*) into v_n from persons_admin_list(p_query => 'zzfinder anna');
  select count(*) into v_m from persons_admin_list(p_query => 'ANNA  zzfinder');
  v_txt := v_txt || ' wort=' || v_n || '/' || v_m;
  select count(*) into v_n from persons_admin_list(p_query => 'zzliste.test');
  v_txt := v_txt || ' email=' || v_n;
  select count(*) into v_n from persons_admin_list(p_query => 'zz_firma');
  select count(*) into v_m from persons_admin_list(p_query => 'zz%');
  v_txt := v_txt || ' unterstrich=' || v_n || ' prozent=' || v_m;
  insert into t_res values ('01a_suche', v_txt || ' (erwartet name=2 wort=1/1 email=3 unterstrich=1 prozent=0)');

  select string_agg(first_name, ',') into v_txt from persons_admin_list(p_query => 'zzliste.test', p_sort => 'name');
  select count(*), max(total) into v_n, v_m from persons_admin_list(p_query => 'zzliste.test', p_limit => 2, p_offset => 0);
  v_txt := 'name=' || v_txt || ' seite1=' || v_n || '(total=' || v_m || ')';
  select count(*), max(total) into v_n, v_m from persons_admin_list(p_query => 'zzliste.test', p_limit => 2, p_offset => 2);
  v_txt := v_txt || ' seite2=' || v_n || '(total=' || v_m || ')';
  insert into t_res values ('01b_seiten', v_txt || ' (erwartet name=Carla,Anna,Bernd seite1=2(total=3) seite2=1(total=3))');

  -- 02 · Filter
  insert into role_assignment (person_id, role, scope_type) values (v_a, 'talent_team', 'global');
  insert into registration (person_id, event_id, status) values (v_b, v_ed, 'registered');
  update person set access_blocked_at = now() where id = v_c;
  insert into profile_deletion_request (person_id, status) values (v_b, 'pending');
  select count(*) into v_n from persons_admin_list(p_query => 'zzliste.test', p_account => 'ohne_login');
  select count(*) into v_m from persons_admin_list(p_query => 'zzliste.test', p_account => 'login');
  v_txt := 'ohne_login=' || v_n || ' login=' || v_m;
  select count(*) into v_n from persons_admin_list(p_query => 'zzliste.test', p_account => 'gesperrt');
  select count(*) into v_m from persons_admin_list(p_query => 'zzliste.test', p_account => 'antrag');
  v_txt := v_txt || ' gesperrt=' || v_n || ' antrag=' || v_m;
  select count(*) into v_n from persons_admin_list(p_query => 'zzliste.test', p_role => 'talent_team');
  select count(*) filter (where 'talent_team' = any (roles)) into v_m from persons_admin_list(p_query => 'zzliste.test', p_role => 'talent_team');
  v_txt := v_txt || ' rolle=' || v_n || '/' || v_m;
  select count(*) into v_n from persons_admin_list(p_query => 'zzliste.test', p_edition => v_ed);
  select count(*) filter (where 'ZZTEST Edition Personen' = any (editions)) into v_m from persons_admin_list(p_query => 'zzliste.test', p_edition => v_ed);
  v_txt := v_txt || ' edition=' || v_n || '/' || v_m;
  insert into t_res values ('02a_filter', v_txt
    || ' (erwartet ohne_login=3 login=0 gesperrt=1 antrag=1 rolle=1/1 edition=1/1)');

  update person set deleted_at = now(), first_name = null, last_name = null where id = v_c;
  select count(*) into v_n from persons_admin_list(p_query => 'zzliste.test');
  select count(*) into v_m from persons_admin_list(p_query => 'zzliste.test', p_account => 'alle');
  select count(*) into v_rows from persons_admin_list(p_query => 'zzliste.test', p_account => 'geloescht');
  insert into t_res values ('02b_geloescht', 'standard=' || v_n || ' alle=' || v_m || ' geloescht=' || v_rows
    || ' (erwartet standard=2 alle=3 geloescht=1)');

  begin perform * from persons_admin_list(p_account => 'bunt'); v_txt := 'ANGENOMMEN'; exception when sqlstate '22023' then v_txt := sqlerrm; end;
  begin perform * from persons_admin_list(p_sort => 'zufall'); v_txt := v_txt || ' / ANGENOMMEN'; exception when sqlstate '22023' then v_txt := v_txt || ' / ' || sqlerrm; end;
  insert into t_res values ('02c_unbekannt', v_txt || ' (erwartet invalid_filter / invalid_filter)');

  -- 03 · Stammdaten
  v_felder := update_person_master(v_a, '{"first_name":"Hanna","phone":"+49 30 1234","birthdate":"1990-02-03","city":"  Köln ","gender":"weiblich"}'::jsonb);
  select count(*) into v_n from audit_log where action = 'person.master_updated' and object_id = v_a::text;
  select after into v_aud from audit_log where action = 'person.master_updated' and object_id = v_a::text order by id desc limit 1;
  insert into t_res values ('03a_aendern', 'felder=' || (select string_agg(x, ',' order by x) from unnest(v_felder) x)
    || ' vorname=' || (select first_name from person where id = v_a) || ' stadt=' || (select city from person where id = v_a)
    || ' audit=' || v_n || ' mit_vorname=' || (v_aud ? 'first_name')::text
    || ' ohne_telefon=' || (not (v_aud ? 'phone'))::text || ' ohne_datum=' || (not (v_aud ? 'birthdate'))::text
    || ' felder_im_audit=' || (v_aud -> 'felder')::text
    || ' (erwartet felder=birthdate,city,first_name,gender,phone vorname=Hanna stadt=Köln audit=1 mit_vorname=true ohne_telefon=true ohne_datum=true)');

  v_felder := update_person_master(v_a, '{"first_name":"Hanna","city":"Köln"}'::jsonb);
  select count(*) into v_n from audit_log where action = 'person.master_updated' and object_id = v_a::text;
  v_felder := coalesce(v_felder, array['NULL']);
  insert into t_res values ('03b_nichts', 'felder=' || cardinality(v_felder) || ' audit=' || v_n || ' (erwartet felder=0 audit=1)');

  v_felder := update_person_master(v_a, '{"city":"","linkedin_url":"https://www.linkedin.com/in/zztest","preferred_language":"en"}'::jsonb);
  insert into t_res values ('03c_leer', 'stadt=' || coalesce((select city from person where id = v_a), 'NULL')
    || ' linkedin=' || coalesce((select linkedin_url from person where id = v_a), 'NULL')
    || ' sprache=' || (select preferred_language from person where id = v_a) || ' (erwartet stadt=NULL linkedin=https://www.linkedin.com/in/zztest sprache=en)');

  v_txt := '';
  begin perform update_person_master(v_a, '{"auth_user_id":"x"}'::jsonb); v_txt := v_txt || 'A'; exception when others then v_txt := v_txt || sqlerrm || '(' || coalesce(sqlstate, '') || ')'; end;
  begin perform update_person_master(v_a, '{"gender":"xyz"}'::jsonb); v_txt := v_txt || ' A'; exception when others then v_txt := v_txt || ' ' || sqlerrm; end;
  begin perform update_person_master(v_a, '{"birthdate":"31.02.1990"}'::jsonb); v_txt := v_txt || ' A'; exception when others then v_txt := v_txt || ' ' || sqlerrm; end;
  begin perform update_person_master(v_a, jsonb_build_object('birthdate', (current_date + 1)::text)); v_txt := v_txt || ' A'; exception when others then v_txt := v_txt || ' ' || sqlerrm; end;
  begin perform update_person_master(v_a, '{"linkedin_url":"ftp://x"}'::jsonb); v_txt := v_txt || ' A'; exception when others then v_txt := v_txt || ' ' || sqlerrm; end;
  begin perform update_person_master(v_a, '{"preferred_language":"fr"}'::jsonb); v_txt := v_txt || ' A'; exception when others then v_txt := v_txt || ' ' || sqlerrm; end;
  begin perform update_person_master(v_a, '{"first_name":5}'::jsonb); v_txt := v_txt || ' A'; exception when others then v_txt := v_txt || ' ' || sqlerrm; end;
  insert into t_res values ('03d_ungueltig', v_txt || ' (erwartet 7 × invalid_person_field, erstes mit (P0001))');

  v_txt := '';
  begin perform update_person_master(v_c, '{"city":"X"}'::jsonb); v_txt := 'ANGENOMMEN'; exception when others then v_txt := sqlerrm; end;
  begin perform update_person_master(gen_random_uuid(), '{"city":"X"}'::jsonb); v_txt := v_txt || ' / ANGENOMMEN'; exception when others then v_txt := v_txt || ' / ' || sqlerrm; end;
  insert into t_res values ('03e_person', v_txt || ' (erwartet person_anonymized / person_not_found)');

  -- 04 · E-Mail-Adressen
  perform manage_person_email(v_a, 'add', null, '  Anna.Zweit@ZZliste.test ');
  select id into v_mail_id from person_email where person_id = v_a and email = 'anna.zweit@zzliste.test';
  insert into t_res values ('04a_hinzufuegen', 'klein=' || (select email::text from person_email where id = v_mail_id)
    || ' primaer=' || (select is_primary from person_email where id = v_mail_id)::text
    || ' verifiziert=' || (select verified from person_email where id = v_mail_id)::text
    || ' (erwartet klein=anna.zweit@zzliste.test primaer=false verifiziert=false)');

  v_txt := '';
  begin perform manage_person_email(v_a, 'add', null, 'BERND@zzliste.test'); v_txt := 'ANGENOMMEN';
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    v_txt := sqlerrm || ' besitzer_stimmt=' || (v_detail = v_b::text)::text;
  end;
  begin perform manage_person_email(v_a, 'add', null, 'kein-at-zeichen'); v_txt := v_txt || ' / ANGENOMMEN'; exception when others then v_txt := v_txt || ' / ' || sqlerrm; end;
  begin perform manage_person_email(v_a, 'add', null, null); v_txt := v_txt || ' / ANGENOMMEN'; exception when others then v_txt := v_txt || ' / ' || sqlerrm; end;
  insert into t_res values ('04b_ablehnen', v_txt || ' (erwartet person_email_taken besitzer_stimmt=true / invalid_email / invalid_email)');

  perform manage_person_email(v_a, 'primary', v_mail_id);
  select count(*) filter (where is_primary), count(*) filter (where is_primary and id = v_mail_id) into v_n, v_m
    from person_email where person_id = v_a;
  insert into t_res values ('04c_primaer', 'primaer=' || v_n || ' davon_neue=' || v_m || ' (erwartet primaer=1 davon_neue=1)');

  select id into v_mail_id2 from person_email where person_id = v_a and email = 'anna@zzliste.test';
  v_txt := '';
  begin perform manage_person_email(v_a, 'remove', v_mail_id); v_txt := 'ANGENOMMEN'; exception when others then v_txt := sqlerrm; end;
  begin perform manage_person_email(v_a, 'remove', v_mail_id2); v_txt := v_txt || ' entfernt=' || (not exists (select 1 from person_email where id = v_mail_id2))::text;
  exception when others then v_txt := v_txt || ' ' || sqlerrm; end;
  begin perform manage_person_email(v_a, 'remove', v_mail_id2); v_txt := v_txt || ' / ANGENOMMEN'; exception when others then v_txt := v_txt || ' / ' || sqlerrm; end;
  begin perform manage_person_email(v_b, 'remove', v_mail_id); v_txt := v_txt || ' / ANGENOMMEN'; exception when others then v_txt := v_txt || ' / ' || sqlerrm; end;
  insert into t_res values ('04d_entfernen', v_txt
    || ' (erwartet primary_email_required entfernt=true / email_not_found / email_not_found [fremde Adresse])');

  perform manage_person_email(v_a, 'change', v_mail_id, 'hanna@zzliste.test');
  insert into t_res values ('04e_berichtigen', 'adresse=' || (select email::text from person_email where id = v_mail_id)
    || ' verifiziert=' || (select verified from person_email where id = v_mail_id)::text
    || ' primaer=' || (select is_primary from person_email where id = v_mail_id)::text
    || ' (erwartet adresse=hanna@zzliste.test verifiziert=false primaer=true)');

  v_txt := '';
  begin perform manage_person_email(v_me, 'change', (select id from person_email where person_id = v_me and is_primary), 'zztest-neu@zzliste.test'); v_txt := 'ANGENOMMEN';
  exception when others then v_txt := sqlerrm; end;
  begin perform manage_person_email(v_a, 'change', v_mail_id, 'bernd@zzliste.test'); v_txt := v_txt || ' / ANGENOMMEN'; exception when others then v_txt := v_txt || ' / ' || sqlerrm; end;
  begin perform manage_person_email(v_a, 'loeschen', v_mail_id); v_txt := v_txt || ' / ANGENOMMEN'; exception when sqlstate '22023' then v_txt := v_txt || ' / ' || sqlerrm; end;
  insert into t_res values ('04f_login_vergeben_aktion', v_txt
    || ' (erwartet login_email_locked / person_email_taken / invalid_action)');

  select count(*) into v_n from audit_log where action like 'person.email_%' and object_id in (v_a::text, v_me::text)
     and (coalesce(before::text, '') || coalesce(after::text, '')) like '%@%';
  select count(*) into v_m from audit_log where action like 'person.email_%' and object_id = v_a::text;
  insert into t_res values ('04g_audit_ohne_adresse', 'eintraege=' || v_m || ' mit_adresse=' || v_n
    || ' (erwartet eintraege=4 [add, primary, remove, change] mit_adresse=0)');

  -- 05 · Rechte
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'talent_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  v_txt := '';
  begin perform * from persons_admin_list(); v_txt := 'ERLAUBT'; exception when sqlstate '42501' then v_txt := '42501'; end;
  begin perform update_person_master(v_a, '{"city":"X"}'::jsonb); v_txt := v_txt || ' ERLAUBT'; exception when sqlstate '42501' then v_txt := v_txt || ' 42501'; end;
  begin perform manage_person_email(v_a, 'add', null, 'x@zzliste.test'); v_txt := v_txt || ' ERLAUBT'; exception when sqlstate '42501' then v_txt := v_txt || ' 42501'; end;
  insert into t_res values ('05_ohne_abschnitt', v_txt || ' (erwartet 42501 42501 42501)');
end $$;
select * from t_res order by step;
rollback;
