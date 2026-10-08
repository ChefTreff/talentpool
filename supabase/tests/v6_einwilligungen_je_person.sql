-- Test zu `v6_einwilligungen_je_person` (ADM-096). Belegt (nur über eigene ZZTEST-Zeilen, Suche `zzeinw`):
--   01 eine Zeile je Person: Anna (zwei Arten), Bernd (zwei Arten, Datenschutz zweimal), Carla ohne Eintrag fehlt;
--   02 aktueller Stand je Art: Anna Newsletter widerrufen, Foto/Video erteilt; Bernd Newsletter abgelehnt,
--      Datenschutz = jüngste Fassung (v2, erteilt) — nicht zwei Zeilen;
--   03 Filter Art + Zustand: Newsletter widerrufen ⇒ Anna; Newsletter abgelehnt ⇒ Bernd; Datenschutz erteilt ⇒ Bernd;
--      nur Zustand erteilt ⇒ beide; nur Art Foto/Video ⇒ Anna; Gegenprobe: Datenschutz widerrufen ⇒ 0;
--      die Spalte `states` zeigt trotz Filter alle Arten der Person;
--   04 Suche: Name in beliebiger Reihenfolge, E-Mail-Teil; `%` ist ein Zeichen (0 Treffer); Seiten und Gesamtzahl;
--   05 anonymisierte Person fehlt in der Übersicht, ihre Nachweiszeile bleibt in `consent_records_admin`;
--   06 unbekannter Zustand ⇒ 22023 invalid_state; ohne Abschnitt consents 42501.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_me uuid; v_uid uuid; v_email text; v_txt text; v_n integer; v_m integer;
  v_a uuid; v_b uuid; v_c uuid; v_d uuid; v_st jsonb;
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');

  insert into person (first_name, last_name) values ('Anna', 'Zzeinw') returning id into v_a;
  insert into person_email (person_id, email, is_primary) values (v_a, 'anna@zzeinw.test', true);
  insert into person (first_name, last_name) values ('Bernd', 'Zzeinw') returning id into v_b;
  insert into person_email (person_id, email, is_primary) values (v_b, 'bernd@zzeinw.test', true);
  insert into person (first_name, last_name) values ('Carla', 'Zzeinw') returning id into v_c;
  insert into person_email (person_id, email, is_primary) values (v_c, 'carla@zzeinw.test', true);
  insert into person (first_name, last_name) values ('Dora', 'Zzeinw') returning id into v_d;
  insert into person_email (person_id, email, is_primary) values (v_d, 'dora@zzeinw.test', true);

  insert into consent_record (person_id, consent_type, version, granted, granted_at, revoked_at) values
    (v_a, 'newsletter', 'v1', true, now() - interval '3 days', now() - interval '1 day'),
    (v_a, 'photo_video', 'v1', true, now() - interval '2 days', null),
    (v_b, 'newsletter', 'v1', false, now() - interval '4 days', null),
    (v_b, 'privacy', 'v1', true, now() - interval '5 days', null),
    (v_b, 'privacy', 'v2', true, now() - interval '2 hours', null),
    (v_d, 'privacy', 'v1', true, now() - interval '6 days', null);
  update person set deleted_at = now(), first_name = null, last_name = null where id = v_d;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 · eine Zeile je Person
  select count(*), string_agg(split_part(email, '@', 1), ',' order by email) into v_n, v_txt from consent_overview_admin(p_query => 'zzeinw');
  insert into t_res values ('01_je_person', 'zeilen=' || v_n || ' personen=' || v_txt || ' (erwartet zeilen=2 personen=anna,bernd — Carla ohne Eintrag, Dora anonymisiert)');

  -- 02 · aktueller Stand
  select states into v_st from consent_overview_admin(p_query => 'anna zzeinw');
  v_txt := 'anna=' || (select string_agg((x ->> 'type') || ':' || (x ->> 'state') || ':' || (x ->> 'version'), ',' order by x ->> 'type') from jsonb_array_elements(v_st) x);
  select states into v_st from consent_overview_admin(p_query => 'bernd zzeinw');
  v_txt := v_txt || ' bernd=' || (select string_agg((x ->> 'type') || ':' || (x ->> 'state') || ':' || (x ->> 'version'), ',' order by x ->> 'type') from jsonb_array_elements(v_st) x);
  insert into t_res values ('02_aktueller_stand', v_txt
    || ' (erwartet anna=newsletter:revoked:v1,photo_video:granted:v1 bernd=newsletter:declined:v1,privacy:granted:v2)');

  -- 03 · Filter
  select string_agg(split_part(email, '@', 1), ',' order by email) into v_txt from consent_overview_admin(p_type => 'newsletter', p_state => 'revoked', p_query => 'zzeinw');
  insert into t_res values ('03a_art_und_zustand', 'nl_widerrufen=' || coalesce(v_txt, '-')
    || ' nl_abgelehnt=' || coalesce((select string_agg(split_part(email, '@', 1), ',' order by email) from consent_overview_admin(p_type => 'newsletter', p_state => 'declined', p_query => 'zzeinw')), '-')
    || ' privacy_erteilt=' || coalesce((select string_agg(split_part(email, '@', 1), ',' order by email) from consent_overview_admin(p_type => 'privacy', p_state => 'granted', p_query => 'zzeinw')), '-')
    || ' erteilt_irgendeine=' || coalesce((select string_agg(split_part(email, '@', 1), ',' order by email) from consent_overview_admin(p_state => 'granted', p_query => 'zzeinw')), '-')
    || ' nur_photo=' || coalesce((select string_agg(split_part(email, '@', 1), ',' order by email) from consent_overview_admin(p_type => 'photo_video', p_query => 'zzeinw')), '-')
    || ' privacy_widerrufen=' || (select count(*) from consent_overview_admin(p_type => 'privacy', p_state => 'revoked', p_query => 'zzeinw'))
    || ' (erwartet nl_widerrufen=anna nl_abgelehnt=bernd privacy_erteilt=bernd erteilt_irgendeine=anna,bernd nur_photo=anna privacy_widerrufen=0)');

  select jsonb_array_length(states) into v_n from consent_overview_admin(p_type => 'newsletter', p_state => 'declined', p_query => 'zzeinw');
  insert into t_res values ('03b_states_vollstaendig', 'arten_bei_bernd_trotz_filter=' || v_n || ' (erwartet 2: Newsletter und Datenschutz)');

  -- 04 · Suche, Seiten
  select count(*) into v_n from consent_overview_admin(p_query => 'ZZEINW  bernd');
  select count(*) into v_m from consent_overview_admin(p_query => 'anna@zzeinw');
  v_txt := 'wort=' || v_n || ' email=' || v_m;
  select count(*) into v_n from consent_overview_admin(p_query => 'zz%');
  v_txt := v_txt || ' prozent=' || v_n;
  select count(*), max(total) into v_n, v_m from consent_overview_admin(p_query => 'zzeinw', p_limit => 1, p_offset => 0);
  v_txt := v_txt || ' seite1=' || v_n || '(total=' || v_m || ')';
  select count(*), max(total) into v_n, v_m from consent_overview_admin(p_query => 'zzeinw', p_limit => 1, p_offset => 1);
  v_txt := v_txt || ' seite2=' || v_n || '(total=' || v_m || ')';
  insert into t_res values ('04_suche_seiten', v_txt || ' (erwartet wort=1 email=1 prozent=0 seite1=1(total=2) seite2=1(total=2))');

  -- 05 · anonymisiert
  select count(*) into v_n from consent_overview_admin() where person_id = v_d;
  select count(*) into v_m from consent_records_admin(p_person_id => v_d);
  insert into t_res values ('05_anonymisiert', 'in_uebersicht=' || v_n || ' im_verlauf=' || v_m || ' (erwartet in_uebersicht=0 im_verlauf=1)');

  -- 06 · Fehler und Rechte
  begin perform * from consent_overview_admin(p_state => 'bunt'); v_txt := 'ANGENOMMEN'; exception when sqlstate '22023' then v_txt := sqlerrm; end;
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'talent_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin perform * from consent_overview_admin(); v_txt := v_txt || ' / ERLAUBT'; exception when sqlstate '42501' then v_txt := v_txt || ' / 42501'; end;
  insert into t_res values ('06_fehler_rechte', v_txt || ' (erwartet invalid_state / 42501)');
end $$;
select * from t_res order by step;
rollback;
