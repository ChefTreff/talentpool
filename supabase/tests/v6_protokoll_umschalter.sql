-- Test zu `v6_protokoll_umschalter` (ADM-095 c). Belegt:
--   01 mit eigenen Testzeilen (eine Person, ein System, eine zweite Person): p_by=person liefert nur Zeilen mit
--      Person, p_by=system nur ohne, ohne p_by alle drei; die Gesamtzahl (total) folgt dem Umschalter;
--   02 die Umschalter-Summe stimmt: person + system = alle (über den ganzen Bestand);
--   03 unbekannter Wert ⇒ 22023 invalid_filter, kein stilles „alle“;
--   04 Kombination mit den bisherigen Filtern (Aktion + Umschalter), Gegenprobe: falscher Umschalter ⇒ 0 Zeilen;
--   05 Rechte unverändert: ohne Abschnitt auditLog 42501 (auch mit p_by);
--   06 die alte Signatur ist weg (genau eine Funktion audit_log_admin).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_me uuid; v_uid uuid; v_email text; v_txt text; v_n integer; v_a integer; v_b integer; v_alle integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');
  insert into audit_log (actor_person_id, action, object_type, object_id) values
    (v_me, 'zztest.protokoll', 'zztest', 'p1'), (null, 'zztest.protokoll', 'zztest', 's1'), (v_me, 'zztest.protokoll', 'zztest', 'p2');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01
  select count(*) filter (where actor_person_id is not null), count(*) filter (where actor_person_id is null), max(total)
    into v_a, v_b, v_n from audit_log_admin(p_action => 'zztest.protokoll', p_by => 'person');
  v_txt := 'person=' || v_a || '/' || v_b || '(total=' || coalesce(v_n, 0) || ')';
  select count(*) filter (where actor_person_id is not null), count(*) filter (where actor_person_id is null), max(total)
    into v_a, v_b, v_n from audit_log_admin(p_action => 'zztest.protokoll', p_by => 'system');
  v_txt := v_txt || ' system=' || v_a || '/' || v_b || '(total=' || coalesce(v_n, 0) || ')';
  select count(*), max(total) into v_a, v_n from audit_log_admin(p_action => 'zztest.protokoll');
  v_txt := v_txt || ' alle=' || v_a || '(total=' || v_n || ')';
  insert into t_res values ('01_umschalter', v_txt
    || ' (erwartet person=2/0(total=2) system=0/1(total=1) alle=3(total=3))');

  -- 02 · über den ganzen Bestand (Limit 1 genügt: total zählt alles)
  select max(total) into v_alle from audit_log_admin(p_limit => 1);
  select max(total) into v_a from audit_log_admin(p_limit => 1, p_by => 'person');
  select max(total) into v_b from audit_log_admin(p_limit => 1, p_by => 'system');
  insert into t_res values ('02_summe', 'person=' || v_a || ' system=' || v_b || ' alle=' || v_alle || ' summe_stimmt=' || (v_a + v_b = v_alle)::text
    || ' (erwartet summe_stimmt=true)');

  -- 03
  begin perform * from audit_log_admin(p_by => 'alle'); v_txt := 'ANGENOMMEN'; exception when sqlstate '22023' then v_txt := sqlerrm; end;
  insert into t_res values ('03_unbekannt', v_txt || ' (erwartet invalid_filter)');

  -- 04 · Gegenprobe: Aktion ist nur von Personen und einem System-Eintrag; falscher Umschalter + passende Aktion
  select count(*) into v_n from audit_log_admin(p_action => 'zztest.protokoll', p_by => 'system', p_actor => v_me);
  insert into t_res values ('04_kombination', 'system_mit_person_filter=' || v_n || ' (erwartet 0: ein Systemeintrag hat keine Person)');

  -- 05
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'talent_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin perform * from audit_log_admin(p_by => 'person'); v_txt := 'ERLAUBT'; exception when sqlstate '42501' then v_txt := '42501'; end;
  insert into t_res values ('05_ohne_abschnitt', v_txt || ' (erwartet 42501)');

  -- 06
  select count(*) into v_n from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace where n.nspname = 'public' and pr.proname = 'audit_log_admin';
  insert into t_res values ('06_eine_signatur', 'funktionen=' || v_n || ' (erwartet 1)');
end $$;
select * from t_res order by step;
rollback;
