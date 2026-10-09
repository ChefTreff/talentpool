-- Test zu `v6_team_access_list` (ADM-094). Belegt (nur über eigene ZZTEST-Zeilen, Suche `zzteam`):
--   01 Menge: Anna (talent_team, Konto), Bernd (programme_team + partner_contact, gesperrt, Konto), Carla (nur Rolle partner_contact
--      mit Org-Scope, kein Konto), Dora (Konto ohne Rolle), Emil (abgelaufene Team-Rolle, kein Konto) fehlt, Fritz (gelöscht, Rolle) fehlt;
--   02 Filter: team ⇒ anna,bernd; gesperrt ⇒ bernd; ohne_login ⇒ carla; alle ⇒ anna,bernd,carla,dora; Vorgabe/leer = alle;
--   03 Rollen: Bernd trägt beide Rollen (jsonb), Carlas Org-Scope hat einen Anzeigenamen, Dora hat `[]`; is_team stimmt;
--      Notizfeld wird nicht ausgegeben; `since` nur bei Team-Rollen;
--   04 Reihenfolge: Gesperrte zuerst; Suche (Vor- und Nachname, E-Mail-Teil, `%` ist ein Zeichen); Seiten und Gesamtzahl;
--   05 `admins` zählt aktive globale Admins (mindestens ich);
--   06 unbekannter Filter ⇒ 22023 invalid_filter; ohne Abschnitt access (talent_team) 42501;
--   07 Gegenprobe: dieselbe Menge wie `access_accounts` (bei Filter alle).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_me uuid; v_uid uuid; v_email text; v_txt text; v_n integer; v_m integer;
  v_u1 uuid := gen_random_uuid(); v_u2 uuid := gen_random_uuid(); v_u3 uuid := gen_random_uuid();
  v_a uuid; v_b uuid; v_c uuid; v_d uuid; v_e uuid; v_f uuid; v_org uuid; v_r jsonb;
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');

  insert into auth.users (id, email, aud, role) values
    (v_u1, 'anna@zzteam.test', 'authenticated', 'authenticated'), (v_u2, 'bernd@zzteam.test', 'authenticated', 'authenticated'),
    (v_u3, 'dora@zzteam.test', 'authenticated', 'authenticated');
  insert into person (first_name, last_name, auth_user_id) values ('Anna', 'Zzteam', v_u1) returning id into v_a;
  insert into person (first_name, last_name, auth_user_id, access_blocked_at) values ('Bernd', 'Zzteam', v_u2, now()) returning id into v_b;
  insert into person (first_name, last_name) values ('Carla', 'Zzteam') returning id into v_c;
  insert into person (first_name, last_name, auth_user_id) values ('Dora', 'Zzteam', v_u3) returning id into v_d;
  insert into person (first_name, last_name) values ('Emil', 'Zzteam') returning id into v_e;
  insert into person (first_name, last_name) values ('Fritz', 'Zzteam') returning id into v_f;
  insert into person_email (person_id, email, is_primary)
    select x, y, true from (values (v_a, 'anna@zzteam.test'), (v_b, 'bernd@zzteam.test'), (v_c, 'carla@zzteam.test'),
                                   (v_d, 'dora@zzteam.test'), (v_e, 'emil@zzteam.test'), (v_f, 'fritz@zzteam.test')) t (x, y);
  insert into organization (legal_name, communication_name) values ('ZZTEAM Org GmbH', 'ZZTEAM Org') returning id into v_org;

  insert into role_assignment (person_id, role, scope_type, note) values
    (v_a, 'talent_team', 'global', 'geheim'),
    (v_b, 'programme_team', 'global', null),
    (v_e, 'talent_team', 'global', null),
    (v_f, 'talent_team', 'global', null);
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_b, 'partner_contact', 'org', v_org), (v_c, 'partner_contact', 'org', v_org);
  update role_assignment set valid_from = now() - interval '10 days', valid_to = now() - interval '1 day' where person_id = v_e;
  update person set deleted_at = now() where id = v_f;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 · Menge
  select string_agg(split_part(email, '@', 1), ',' order by email) into v_txt from team_access_list(p_query => 'zzteam');
  insert into t_res values ('01_menge', 'personen=' || v_txt || ' (erwartet anna,bernd,carla,dora — Emil abgelaufen, Fritz gelöscht)');

  -- 02 · Filter
  insert into t_res values ('02_filter',
    'team=' || coalesce((select string_agg(split_part(email, '@', 1), ',' order by email) from team_access_list(p_query => 'zzteam', p_filter => 'team')), '-')
    || ' gesperrt=' || coalesce((select string_agg(split_part(email, '@', 1), ',' order by email) from team_access_list(p_query => 'zzteam', p_filter => 'gesperrt')), '-')
    || ' ohne_login=' || coalesce((select string_agg(split_part(email, '@', 1), ',' order by email) from team_access_list(p_query => 'zzteam', p_filter => 'ohne_login')), '-')
    || ' alle=' || (select count(*) from team_access_list(p_query => 'zzteam', p_filter => 'alle'))
    || ' leer=' || (select count(*) from team_access_list(p_query => 'zzteam', p_filter => ''))
    || ' null=' || (select count(*) from team_access_list(p_query => 'zzteam', p_filter => null))
    || ' (erwartet team=anna,bernd gesperrt=bernd ohne_login=carla alle=4 leer=4 null=4)');

  -- 03 · Rollen
  select roles into v_r from team_access_list(p_query => 'bernd zzteam');
  v_txt := 'bernd=' || jsonb_array_length(v_r) || ':' || (select string_agg(x ->> 'role', ',' order by x ->> 'role') from jsonb_array_elements(v_r) x)
    || ' org_label=' || coalesce((select x ->> 'scope_label' from jsonb_array_elements(v_r) x where x ->> 'role' = 'partner_contact'), '-');
  select roles into v_r from team_access_list(p_query => 'dora zzteam');
  v_txt := v_txt || ' dora=' || v_r::text;
  v_txt := v_txt || ' is_team=' || (select string_agg(split_part(email, '@', 1) || ':' || is_team::text, ',' order by email) from team_access_list(p_query => 'zzteam'))
    || ' notiz_ausgegeben=' || (select count(*) from team_access_list(p_query => 'anna zzteam') t, jsonb_array_elements(t.roles) x where x ? 'note')
    || ' since_anna=' || (select (since is not null)::text from team_access_list(p_query => 'anna zzteam'))
    || ' since_carla=' || (select (since is not null)::text from team_access_list(p_query => 'carla zzteam'));
  insert into t_res values ('03_rollen', v_txt
    || ' (erwartet bernd=2:partner_contact,programme_team org_label=ZZTEAM Org dora=[] is_team=anna:true,bernd:true,carla:false,dora:false notiz_ausgegeben=0 since_anna=true since_carla=false)');

  -- 04 · Reihenfolge, Suche, Seiten
  select split_part(email, '@', 1) into v_txt from team_access_list(p_query => 'zzteam', p_limit => 1);
  v_txt := 'erste=' || v_txt;
  select count(*) into v_n from team_access_list(p_query => 'carla zzteam');
  select count(*) into v_m from team_access_list(p_query => 'anna@zzteam');
  v_txt := v_txt || ' name=' || v_n || ' email=' || v_m;
  select count(*) into v_n from team_access_list(p_query => 'zz%');
  v_txt := v_txt || ' prozent=' || v_n;
  select count(*), max(total) into v_n, v_m from team_access_list(p_query => 'zzteam', p_limit => 2, p_offset => 0);
  v_txt := v_txt || ' seite1=' || v_n || '(total=' || v_m || ')';
  select count(*), max(total) into v_n, v_m from team_access_list(p_query => 'zzteam', p_limit => 2, p_offset => 2);
  v_txt := v_txt || ' seite2=' || v_n || '(total=' || v_m || ')';
  insert into t_res values ('04_suche_seiten', v_txt || ' (erwartet erste=bernd — Gesperrte zuerst; name=1 email=1 prozent=0 seite1=2(total=4) seite2=2(total=4))');

  -- 05 · Admins
  select admins into v_n from team_access_list(p_query => 'zzteam') limit 1;
  insert into t_res values ('05_admins', 'admins>=1: ' || (v_n >= 1)::text || ' (erwartet true)');

  -- 06 · Fehler, Rechte
  begin perform * from team_access_list(p_filter => 'bunt'); v_txt := 'ANGENOMMEN'; exception when sqlstate '22023' then v_txt := sqlerrm; end;
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'talent_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin perform * from team_access_list(); v_txt := v_txt || ' / ERLAUBT'; exception when sqlstate '42501' then v_txt := v_txt || ' / 42501'; end;
  insert into t_res values ('06_fehler_rechte', v_txt || ' (erwartet invalid_filter / 42501)');

  -- 07 · Gegenprobe gegen access_accounts (wieder als Admin)
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  select count(*) into v_n from team_access_list(p_query => 'zzteam') l join access_accounts(p_query => 'zzteam') a on a.person_id = l.person_id;
  select count(*) into v_m from access_accounts(p_query => 'zzteam');
  insert into t_res values ('07_wie_access_accounts', 'gemeinsam=' || v_n || ' access_accounts=' || v_m || ' (erwartet 4 und 4)');
end $$;
select * from t_res order by step;
rollback;
