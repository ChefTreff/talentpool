-- Smoke-Test 0093 (Selbst gemeldete Schritte, F9.8). Belegt:
--   01 wer nicht zur Organisation gehört, kann nichts abhaken ⇒ 42501;
--   02 die Liste zeigt den **ganzen Katalog**, auch wenn nichts erledigt ist;
--   03 ein Haken landet als Zeile und taucht mit Namen wieder auf;
--   04 ein unbekannter Schritt wird mit `invalid_step` abgewiesen, nicht als
--      nacktes 23503 aus dem Fremdschlüssel;
--   05 zweimal setzen verschiebt den Zeitpunkt **nicht** — sonst wanderte
--      „erledigt am" bei jedem Klick nach vorn;
--   06 Haken wegnehmen löscht die Zeile, „offen" braucht keine;
--   07 die Produktionsauswertung ist nicht für Partner ⇒ 42501;
--   08 mit Team-Rolle zählt sie richtig (done/total);
--   09 keine Grants für `authenticated` — gelesen wird über die RPC.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_oe uuid;
  v_n integer; v_done integer; v_total integer; v_t1 timestamptz; v_t2 timestamptz; v_txt text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  delete from staff_user where auth_user_id = v_uid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- Organisation anlegen (als Partner-Team), Testperson gehört noch nicht dazu.
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into organization (legal_name, communication_name, type)
    values ('ZZ Schritte GmbH', 'ZZSchritte', 'partner') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status)
    values (v_org, v_ed, 'invited') returning id into v_oe;
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';

  begin
    perform set_org_step(v_org, 'event_app', 'profil', true, v_ed);
    insert into t_res values ('01_fremde_org', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01_fremde_org', 'abgewiesen ' || sqlstate); end;

  -- Testperson wird Kontakt der Organisation, danach Team-Rolle wieder weg.
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{additional}');
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';

  select count(*)::integer, count(done_at)::integer into v_n, v_done
    from my_org_steps(v_org, 'event_app', v_ed);
  insert into t_res values ('02_katalog',
    case when v_n = 6 and v_done = 0 then '6 Schritte, 0 erledigt (richtig)'
         else 'unerwartet ' || v_n || '/' || v_done end);

  perform set_org_step(v_org, 'event_app', 'profil', true, v_ed);
  select done_at, done_by_name into v_t1, v_txt
    from my_org_steps(v_org, 'event_app', v_ed) where key = 'profil';
  insert into t_res values ('03_haken',
    -- Der Name kommt aus `person`; wie die Testperson heisst, ist egal —
    -- belegt werden muss, dass die Spur überhaupt mitgeschrieben wird.
    case when v_t1 is not null and v_txt is not null then 'gesetzt mit Name (richtig)'
         else 'unerwartet ' || coalesce(v_t1::text, 'leer') || '/' || coalesce(v_txt, 'leer') end);

  begin
    perform set_org_step(v_org, 'event_app', 'gibtesnicht', true, v_ed);
    insert into t_res values ('04_unbekannter_schritt', 'ANGENOMMEN (BUG)');
  exception when others then
    insert into t_res values ('04_unbekannter_schritt', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  perform pg_sleep(0.01);
  perform set_org_step(v_org, 'event_app', 'profil', true, v_ed);
  select done_at into v_t2 from my_org_steps(v_org, 'event_app', v_ed) where key = 'profil';
  insert into t_res values ('05_idempotent',
    case when v_t2 = v_t1 then 'Zeitpunkt unveraendert (richtig)' else 'VERSCHOBEN (BUG)' end);

  perform set_org_step(v_org, 'event_app', 'profil', false, v_ed);
  select count(*)::integer into v_n from org_step_check where org_edition_id = v_oe;
  insert into t_res values ('06_weggenommen',
    case when v_n = 0 then 'Zeile geloescht (richtig)' else 'UEBRIG ' || v_n end);

  perform set_org_step(v_org, 'event_app', 'profil', true, v_ed);
  perform set_org_step(v_org, 'event_app', 'leads_teilen', true, v_ed);

  begin
    perform count(*) from org_steps_progress('event_app', v_ed);
    insert into t_res values ('07_fortschritt_partner', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('07_fortschritt_partner', 'abgewiesen ' || sqlstate); end;

  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  select done, total into v_done, v_total
    from org_steps_progress('event_app', v_ed) where org_id = v_org;
  insert into t_res values ('08_fortschritt_team',
    case when v_done = 2 and v_total = 6 then '2 von 6 (richtig)'
         else 'unerwartet ' || coalesce(v_done::text, 'leer') || '/' || coalesce(v_total::text, 'leer') end);

  insert into t_res values ('09_grants',
    case when has_table_privilege('authenticated', 'org_step_check', 'select')
           or has_table_privilege('authenticated', 'org_step', 'select')
         then 'LESBAR (BUG)' else 'kein SELECT (richtig)' end);
end $$;
select * from t_res order by step;
rollback;
