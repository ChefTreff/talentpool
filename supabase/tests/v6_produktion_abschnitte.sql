-- Smoke-Test ADM-054 (Produktion als eigene Abschnitte). Belegt:
--   01 die drei neuen Abschnitte sind bekannt — ein Tippfehler waere sonst erst
--      im Betrieb als `unknown_section` aufgefallen;
--   02 `production_team` oeffnet alle drei, wie bisher die eine Produktionsseite:
--      die Aufteilung nimmt niemandem etwas weg;
--   03 `talent_team` oeffnet keinen davon (fail closed);
--   04 **und der eigentliche Zweck**: jetzt laesst sich einer davon einzeln
--      oeffnen oder schliessen, ohne die anderen anzufassen — hier per
--      Personen-Ausnahme, wie sie `/admin/rollen` schreibt;
--   05 Catering bleibt erreichbar: der eigene Abschnitt schliesst die Produktion ein.
-- Der Test vergibt Rollen und Ausnahmen und rollt zurueck.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  delete from admin_section_override;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  select count(distinct section) into v_n from admin_section_role
   where section in ('productionBooths', 'productionOrders', 'productionFiles');
  insert into t_res values ('01_bekannt', v_n::text || ' von 3');

  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'production_team', 'global');
  insert into t_res values ('02_production_team',
    'staende=' || has_admin_section('productionBooths')::text
    || ', bestellungen=' || has_admin_section('productionOrders')::text
    || ', dateien=' || has_admin_section('productionFiles')::text
    || ', regie=' || has_admin_section('production')::text);
  insert into t_res values ('05_catering', has_admin_section('catering')::text);

  -- 04 einzeln schliessen, ohne die anderen anzufassen
  insert into admin_section_override (section, person_id, allowed, note)
  values ('productionOrders', v_pid, false, 'ZZTEST');
  insert into t_res values ('04_einzeln_geschlossen',
    'bestellungen=' || has_admin_section('productionOrders')::text
    || ', staende=' || has_admin_section('productionBooths')::text
    || ', dateien=' || has_admin_section('productionFiles')::text);
  delete from admin_section_override;

  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'talent_team', 'global');
  insert into t_res values ('03_talent_team',
    'staende=' || has_admin_section('productionBooths')::text
    || ', bestellungen=' || has_admin_section('productionOrders')::text
    || ', dateien=' || has_admin_section('productionFiles')::text);
end $$;

select * from t_res order by step;
rollback;

-- Lauf 25.09.2026 gegen jqmqvgaiyjudkvtncijw (Probelauf, zurueckgerollt): 5/5 gruen.
--   01 '3 von 3' Abschnitten bekannt;
--   02 production_team: staende/bestellungen/dateien/regie alle true;
--   03 talent_team: alle false;
--   04 einzeln geschlossen: bestellungen=false, staende und dateien weiter true
--      — das ist der Zweck der Aufteilung;
--   05 Catering weiter erreichbar (der eigene Abschnitt schliesst Produktion ein).
