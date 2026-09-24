-- Smoke-Test ADM-053 (Rollenmodell, Abschnitte schaltbar). Belegt:
--   01 die vier neuen Team-Rollen stehen im Vokabular;
--   02 **`speaker_manager` zaehlt nicht mehr als Team** — externe Stage Leads
--      bekommen keinen Admin-Zugang; `volunteer_lead` und `checkin_operator`
--      ebenso wenig (ein Tablet am Einlass ist kein Teammitglied);
--   03 `is_partner_team()` laesst die neue Team-Rolle durch — ohne das waere die
--      Rolle von der ersten Minute an eine Luege: die Seite ginge auf und jede
--      Abfrage darauf mit 42501 zu Ende;
--   04 Schreiben nur mit Admin-Rolle (42501);
--   05 weder Rolle noch Person, oder beides ⇒ 22023 `invalid_target`;
--   06 erfundene Rolle 22023, unbekannte Person P0002, leerer Abschnitt 22023;
--   07 **die Rolle `admin` laesst sich nicht abschalten** (P0001) — sonst koennte
--      Konrad sich den Weg zurueck zum Rollen-Bereich nehmen;
--   08 eine Rollen-Ausnahme erscheint bei jedem, der die Rolle hat, und nur dort;
--   09 **die Person schlaegt die Rolle**: ein persoenliches Aus gewinnt gegen ein
--      Rollen-Ein und umgekehrt;
--   10 zwei Rollen, eine oeffnet ⇒ offen (dieselbe Regel wie bei der Vorgabe);
--   11 **fuer `admin` gelten Ausnahmen nicht** — die Liste bleibt leer, auch wenn
--      eine Zeile auf ihn zeigt;
--   12 dieselbe Ausnahme zweimal gesetzt ergibt **eine** Zeile mit dem neuen Wert;
--   13 loeschen entfernt sie, unbekannte Kennung P0002; beides im Protokoll;
--   14 die Tabelle hat RLS und keine Grants fuer anon/authenticated.
-- Der Test leiht sich ein Konto, legt Rollen an und rollt zurueck.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text;
  v_pid2 uuid; v_uid2 uuid; v_email2 text;
  v_id uuid; v_n integer; v_txt text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null order by p.created_at limit 1;
  select p.id, p.auth_user_id, pe.email::text into v_pid2, v_uid2, v_email2
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.id <> v_pid order by p.created_at limit 1;
  delete from role_assignment where person_id in (v_pid, v_pid2);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 Vokabular ------------------------------------------------------------------
  select string_agg(v.key, ', ' order by v.sort_order) into v_txt from vocab_term v
   where v.vocabulary = 'role' and v.active
     and v.key in ('talent_team', 'partner_team', 'volunteers_team', 'hackathon_team');
  insert into t_res values ('01_neue_rollen', coalesce(v_txt, '(keine)'));

  -- 02 wer als Team zaehlt -----------------------------------------------------------
  select string_agg(r, ', ') into v_txt from unnest(array['speaker_manager','volunteer_lead','checkin_operator']) r
   where r = any(team_role_keys());
  insert into t_res values ('02a_externe_raus', coalesce(v_txt, '(keine — richtig)'));
  select count(*) into v_n from unnest(array['talent_team','partner_team','volunteers_team','hackathon_team','marketing_team']) r
   where r = any(team_role_keys());
  insert into t_res values ('02b_team_drin', v_n::text || ' von 5');

  -- 04 schreiben ohne Admin ------------------------------------------------------------
  begin
    perform set_admin_section_override('expenses', true, 'programme_team');
    insert into t_res values ('04_ohne_admin', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('04_ohne_admin', 'abgewiesen ' || sqlstate); end;

  -- 03 Bereichspraedikat mit der neuen Rolle ----------------------------------------------
  insert into role_assignment (person_id, role, scope_type, valid_from)
  values (v_pid, 'partner_team', 'global', now() - interval '1 hour');
  insert into t_res values ('03_is_partner_team', is_partner_team()::text);
  delete from role_assignment where person_id = v_pid;

  insert into role_assignment (person_id, role, scope_type, valid_from)
  values (v_pid, 'admin', 'global', now() - interval '1 hour');

  -- 05/06/07 Eingaben ----------------------------------------------------------------------
  begin
    perform set_admin_section_override('expenses', true);
    insert into t_res values ('05a_ohne_ziel', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('05a_ohne_ziel', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  begin
    perform set_admin_section_override('expenses', true, 'programme_team', v_pid2);
    insert into t_res values ('05b_beides', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('05b_beides', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  begin
    perform set_admin_section_override('expenses', true, 'gibt_es_nicht');
    insert into t_res values ('06a_erfundene_rolle', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('06a_erfundene_rolle', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  begin
    perform set_admin_section_override('expenses', true, null, gen_random_uuid());
    insert into t_res values ('06b_unbekannte_person', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('06b_unbekannte_person', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  begin
    perform set_admin_section_override('   ', true, 'programme_team');
    insert into t_res values ('06c_leerer_abschnitt', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('06c_leerer_abschnitt', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  begin
    perform set_admin_section_override('expenses', false, 'admin');
    insert into t_res values ('07_admin_abschalten', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('07_admin_abschalten', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 12 zweimal dieselbe Ausnahme ---------------------------------------------------------------
  v_id := set_admin_section_override('expenses', true, 'programme_team');
  perform set_admin_section_override('expenses', false, 'programme_team', null, 'doch nicht');
  select count(*)::text || ' Zeile, allowed=' || bool_and(o.allowed)::text into v_txt
    from admin_section_override o where o.section = 'expenses' and o.role = 'programme_team';
  insert into t_res values ('12_zweimal', v_txt);
  perform set_admin_section_override('expenses', true, 'programme_team');

  -- 11 fuer admin gelten Ausnahmen nicht ----------------------------------------------------------
  perform set_admin_section_override('expenses', false, null, v_pid);
  select count(*) into v_n from my_admin_section_overrides();
  insert into t_res values ('11_admin_sieht_alles', v_n::text || ' Ausnahmen');

  -- 13 loeschen -------------------------------------------------------------------------------------
  perform delete_admin_section_override(v_id);
  select count(*) into v_n from admin_section_override where id = v_id;
  insert into t_res values ('13a_geloescht', v_n::text);
  begin
    perform delete_admin_section_override(gen_random_uuid());
    insert into t_res values ('13b_unbekannt', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('13b_unbekannt', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  select count(*) into v_n from audit_log
   where action in ('admin_section.override', 'admin_section.override_removed');
  insert into t_res values ('13c_protokoll', v_n::text || ' Eintraege');

  -- 08/09/10 Wirkung bei einer Person ohne Admin-Rolle -----------------------------------------------
  perform set_admin_section_override('expenses', true, 'programme_team', null, 'Test');
  perform set_admin_section_override('partner', false, 'programme_team', null, 'Test');
  insert into role_assignment (person_id, role, scope_type, valid_from)
  values (v_pid2, 'programme_team', 'global', now() - interval '1 hour');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid2, 'role', 'authenticated', 'email', v_email2)::text, true);
  select string_agg(x.section || '=' || x.allowed::text || '/' || x.quelle, ', ' order by x.section)
    into v_txt from my_admin_section_overrides() x;
  insert into t_res values ('08_rollen_ausnahme', coalesce(v_txt, '(keine)'));

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  perform set_admin_section_override('expenses', false, null, v_pid2, 'persoenlich aus');
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid2, 'role', 'authenticated', 'email', v_email2)::text, true);
  select string_agg(x.section || '=' || x.allowed::text || '/' || x.quelle, ', ' order by x.section)
    into v_txt from my_admin_section_overrides() x;
  insert into t_res values ('09_person_schlaegt_rolle', coalesce(v_txt, '(keine)'));

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  perform set_admin_section_override('partner', true, 'partner_team', null, 'Test');
  insert into role_assignment (person_id, role, scope_type, valid_from)
  values (v_pid2, 'partner_team', 'global', now() - interval '1 hour');
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid2, 'role', 'authenticated', 'email', v_email2)::text, true);
  select x.allowed::text into v_txt from my_admin_section_overrides() x where x.section = 'partner';
  insert into t_res values ('10_zwei_rollen_eine_oeffnet', coalesce(v_txt, '(keine Zeile)'));
end $$;

-- 14 Grants und RLS -------------------------------------------------------------------------------
do $$
declare v_n integer; v_txt text;
begin
  select c.relrowsecurity::text into v_txt from pg_class c
   where c.oid = 'public.admin_section_override'::regclass;
  insert into t_res values ('14a_rls', v_txt);
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'admin_section_override'
     and grantee in ('anon', 'authenticated');
  insert into t_res values ('14b_grants', v_n::text);
end $$;

select * from t_res order by step;
rollback;

-- Lauf 24.09.2026 gegen jqmqvgaiyjudkvtncijw (Probelauf, zurueckgerollt): 21/21 gruen.
--   01 alle vier neuen Rollen; 02a '(keine — richtig)', 02b 5 von 5;
--   03 is_partner_team true mit `partner_team`; 04 abgewiesen 42501;
--   05a/05b 22023 invalid_target; 06a 22023 invalid_role, 06b P0002 person_not_found,
--   06c 22023 section_required; 07 P0001 admin_not_overridable;
--   08 'expenses=true/role, partner=false/role';
--   09 'expenses=false/person, partner=false/role' (die Person schlaegt die Rolle);
--   10 true (zwei Rollen, eine oeffnet); 11 0 Ausnahmen fuer admin;
--   12 '1 Zeile, allowed=false'; 13a 0, 13b P0002 override_not_found, 13c 5 Eintraege;
--   14a RLS true, 14b 0 Grants fuer anon/authenticated.
