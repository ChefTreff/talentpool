-- Smoke-Test PORT1b (Abschnitt → Rolle in der Datenbank). Belegt:
--   01 die Vorgabe wirkt: `programme_team` oeffnet `speakers`, nicht `partner`;
--   02 `admin` oeffnet alles, auch die Verwaltungsabschnitte ohne weitere Rolle;
--   03 eine **Personen**-Ausnahme schlaegt die Vorgabe — in **beide** Richtungen:
--      sie oeffnet einen verschlossenen und verschliesst einen offenen Abschnitt.
--      Nur eine Richtung zu pruefen waere ein Test, der nichts belegt;
--   04 eine **Rollen**-Ausnahme wirkt, und die Person schlaegt die Rolle;
--   05 ein unbekannter Schluessel scheitert laut (22023) statt still „nein" zu sagen;
--   06 `my_admin_sections()` liefert jeden Abschnitt genau einmal;
--   07 `can_edit_next_up` und `can_view_community_events` folgen jetzt der Tabelle
--      statt einer abgeschriebenen Rollenliste;
--   08 die Tabelle hat keine Grants fuer `authenticated` — gelesen wird nur ueber
--      die Funktionen;
--   09 ohne Anmeldung: `false`, kein Fehler (der Servicekontext hat keine Person).
-- Der Test vergibt Rollen und Ausnahmen an eine vorhandene Person und rollt zurueck.
begin;
create temp table t_res (step text, result text) on commit drop;

-- 08/09 zuerst, im Servicekontext
do $$
declare v_n integer; v_b boolean;
begin
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_n from (
    select unnest(array['select','insert','update','delete']) as recht) x
   where has_table_privilege('authenticated', 'admin_section_role', x.recht);
  insert into t_res values ('08_keine_grants', v_n::text || ' Rechte fuer authenticated');
  select has_admin_section('speakers') into v_b;
  insert into t_res values ('09_ohne_person', coalesce(v_b::text, 'null'));
end $$;

do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_n integer; v_b boolean; v_txt text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  delete from admin_section_override;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 Vorgabe
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'programme_team', 'global');
  insert into t_res values ('01a_vorgabe_offen', has_admin_section('speakers')::text);
  insert into t_res values ('01b_vorgabe_zu', has_admin_section('partner')::text);
  insert into t_res values ('01c_verwaltung_zu', has_admin_section('roles')::text);

  -- 03 Personen-Ausnahme in beide Richtungen
  insert into admin_section_override (section, person_id, allowed, note)
  values ('partner', v_pid, true, 'ZZTEST'), ('speakers', v_pid, false, 'ZZTEST');
  insert into t_res values ('03a_person_oeffnet', has_admin_section('partner')::text);
  insert into t_res values ('03b_person_schliesst', has_admin_section('speakers')::text);
  delete from admin_section_override;

  -- 04 Rollen-Ausnahme, und die Person schlaegt sie
  insert into admin_section_override (section, role, allowed, note)
  values ('volunteers', 'programme_team', true, 'ZZTEST');
  insert into t_res values ('04a_rolle_oeffnet', has_admin_section('volunteers')::text);
  insert into admin_section_override (section, person_id, allowed, note)
  values ('volunteers', v_pid, false, 'ZZTEST');
  insert into t_res values ('04b_person_schlaegt_rolle', has_admin_section('volunteers')::text);
  delete from admin_section_override;

  -- 07 die beiden umgestellten Funktionen
  insert into t_res values ('07a_next_up_ohne_marketing', can_edit_next_up()::text);
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'marketing_team', 'global');
  insert into t_res values ('07b_next_up_mit_marketing', can_edit_next_up()::text);
  insert into t_res values ('07c_community_mit_marketing', can_view_community_events()::text);

  -- 05 Tippfehler
  begin
    perform has_admin_section('speakerz');
    insert into t_res values ('05_unbekannt', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('05_unbekannt', 'abgewiesen ' || sqlstate); end;

  -- 06 Lesefunktion
  select count(*), count(distinct section) into v_n, v_n from my_admin_sections();
  select count(*)::text || ' Zeilen, ' || count(distinct section)::text || ' verschieden'
    into v_txt from my_admin_sections();
  insert into t_res values ('06_my_admin_sections', v_txt);

  -- 02 admin sieht alles
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  select count(*) into v_n from my_admin_sections() where not allowed;
  insert into t_res values ('02a_admin_alles', v_n::text || ' verschlossen');
  -- Selbst eine Ausnahme gegen ihn wirkt nicht.
  insert into admin_section_override (section, person_id, allowed, note)
  values ('roles', v_pid, false, 'ZZTEST');
  insert into t_res values ('02b_admin_trotz_ausnahme', has_admin_section('roles')::text);
end $$;

select * from t_res order by step;
rollback;

-- Lauf 25.09.2026 gegen jqmqvgaiyjudkvtncijw (Probelauf, zurueckgerollt): 16/16 gruen.
--   01a speakers offen, 01b partner zu, 01c Verwaltung zu (programme_team);
--   02a 0 von 34 Abschnitten verschlossen fuer admin, 02b Ausnahme gegen admin wirkt nicht;
--   03a Person oeffnet, 03b Person schliesst; 04a Rolle oeffnet, 04b Person schlaegt Rolle;
--   05 unbekannter Schluessel abgewiesen 22023;
--   06 my_admin_sections: 34 Zeilen, 34 verschieden;
--   07a ohne marketing_team false, 07b/07c mit marketing_team true;
--   08 0 Rechte fuer authenticated auf admin_section_role; 09 ohne Person false.
