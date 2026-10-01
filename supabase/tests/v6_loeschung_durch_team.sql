-- Test zu `v6_loeschung_durch_team` (ADM-031). Belegt:
--   01 ohne Admin-Rolle 42501 — auch für eine Person mit Teamrolle;
--   02 das Team legt für eine Person **ohne Konto** einen Antrag an, Status
--      `pending`, `opened_by` gesetzt, auch ohne Hürde;
--   03 die Hürden werden für die **betroffene** Person berechnet, nicht für
--      die handelnde (Gegenprobe: Organisation ⇒ `partner`);
--   04 ein zweiter offener Antrag für dieselbe Person: `deletion_already_open`;
--   05 schon gelöschte Person: `person_already_deleted`; unbekannte: P0002;
--   06 die Warteschlange zeigt, wer angelegt hat;
--   07 erledigt wird über den bestehenden Weg — `resolve_deletion_request`
--      anonymisiert, die Person ist danach gelöscht;
--   08 `my_deletion_blockers()` liefert für die eigene Person dasselbe wie vorher;
--   09 `deletion_blockers` ist für `authenticated` nicht ausführbar;
--   10 Audit-Eintrag beim Anlegen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_admin uuid; v_uid uuid; v_email text;
  v_ohne uuid; v_org_person uuid; v_org uuid; v_req uuid; v_req2 uuid;
  v_txt text; v_state text; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_admin, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_admin;
  delete from profile_deletion_request where person_id = v_admin;
  insert into role_assignment (person_id, role, scope_type) values (v_admin, 'partner_team', 'global');

  insert into person (first_name, last_name) values ('Lena', 'ZZTEST-Ohne-Konto') returning id into v_ohne;
  insert into person_email (person_id, email, is_primary) values (v_ohne, 'zztest-loeschen-ohne@example.org', true);
  insert into person (first_name, last_name) values ('Olaf', 'ZZTEST-Org') returning id into v_org_person;
  insert into person_email (person_id, email, is_primary) values (v_org_person, 'zztest-loeschen-org@example.org', true);
  insert into organization (legal_name) values ('ZZTEST Loeschung GmbH') returning id into v_org;
  insert into org_membership (person_id, org_id, roles) values (v_org_person, v_org, array['primary']);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 Teamrolle reicht nicht.
  begin
    perform open_deletion_request(v_ohne, 'per Mail');
    insert into t_res values ('01_ohne_admin', 'ERLAUBT (BUG)');
  exception when sqlstate '42501' then
    insert into t_res values ('01_ohne_admin', 'abgewiesen 42501');
  end;

  perform set_config('request.jwt.claims', '', true);
  insert into role_assignment (person_id, role, scope_type) values (v_admin, 'admin', 'global');
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 02 Person ohne Konto, ohne Hürde.
  v_req := open_deletion_request(v_ohne, 'Bitte per Mail am 01.10.');
  select r.status || ', opened_by=' || (r.opened_by = v_admin)::text || ', Hürden=' || cardinality(r.blockers)
    into v_txt from profile_deletion_request r where r.id = v_req;
  insert into t_res values ('02_ohne_konto_angelegt', v_txt || ' (erwartet pending, true, 0)');

  -- 03 Hürden der betroffenen Person.
  v_req2 := open_deletion_request(v_org_person, null);
  select array_to_string(r.blockers, ',') into v_txt from profile_deletion_request r where r.id = v_req2;
  insert into t_res values ('03_huerden_der_betroffenen', coalesce(nullif(v_txt, ''), '(leer)') || ' (erwartet partner)');

  -- 04 Doppelt.
  begin
    perform open_deletion_request(v_ohne, null);
    insert into t_res values ('04_doppelt', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_txt = message_text;
    insert into t_res values ('04_doppelt', v_state || ' ' || v_txt);
  end;

  -- 05 Unbekannt.
  begin
    perform open_deletion_request(gen_random_uuid(), null);
    insert into t_res values ('05a_unbekannt', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_txt = message_text;
    insert into t_res values ('05a_unbekannt', v_state || ' ' || v_txt);
  end;

  -- 06 Warteschlange.
  select d.opened_by_name into v_txt from deletion_requests_admin('pending') d where d.id = v_req;
  insert into t_res values ('06_warteschlange_zeigt_anleger', coalesce(v_txt, '(leer — BUG)'));

  -- 07 Erledigen über den bestehenden Weg.
  perform resolve_deletion_request(v_req, 'delete', null);
  select (p.deleted_at is not null)::text || ', Name=' || coalesce(p.last_name, 'null')
    into v_txt from person p where p.id = v_ohne;
  insert into t_res values ('07_erledigt_und_anonymisiert', v_txt || ' (erwartet true, null)');

  -- 05b Schon gelöscht.
  begin
    perform open_deletion_request(v_ohne, null);
    insert into t_res values ('05b_schon_geloescht', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_txt = message_text;
    insert into t_res values ('05b_schon_geloescht', v_state || ' ' || v_txt);
  end;

  -- 08 Eigene Sicht unverändert: Admin hat eine Teamrolle.
  insert into t_res values ('08_eigene_huerden', array_to_string(my_deletion_blockers(), ','));

  -- 10 Audit.
  select count(*) into v_n from audit_log a
   where a.action = 'profile.delete_opened' and a.object_id = v_org_person::text;
  insert into t_res values ('10_audit', v_n::text || ' (erwartet 1)');
end $$;

-- 09 Rechte an der internen Funktion.
insert into t_res values ('09_deletion_blockers_fuer_authenticated',
  case when has_function_privilege('authenticated', 'deletion_blockers(uuid)', 'execute')
       then 'AUSFÜHRBAR (BUG)' else 'gesperrt' end);

select * from t_res order by step;
rollback;
