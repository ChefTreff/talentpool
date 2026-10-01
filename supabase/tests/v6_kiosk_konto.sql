-- Test zu `v6_kiosk_konto` (ADM-038). Belegt:
--   01 ohne Abschnitt `access` 42501 — auch für eine Teamrolle;
--   02 neues Gerätekonto: Person „Kiosk <Name>", Adresse, Rolle
--      checkin_operator Scope Edition, Ablauf am Folgetag nach Editionsende;
--   03 dieselbe Adresse noch einmal verlängert statt zu doppeln (1 Rolle);
--   04 fremde Domain: team_address_required;
--   05 Adresse eines Menschen mit anderer Rolle: kiosk_email_in_use, Rollen unverändert;
--   06 vergangene Edition: edition_over; unbekannte: P0002;
--   07 Audit-Eintrag.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_me uuid; v_uid uuid; v_email text; v_ed uuid; v_alt uuid; v_mensch uuid;
  v_r jsonb; v_txt text; v_state text; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  select id into v_ed from event where is_edition and slug = 'fls27';
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'partner_team', 'global');
  insert into event (name, slug, is_edition, start_date, end_date, format_tag)
  values ('ZZTEST alt', 'zztest-alt', true, current_date - 30, current_date - 29, 'summit') returning id into v_alt;
  insert into person (first_name, last_name) values ('Mia', 'ZZTEST-Mensch') returning id into v_mensch;
  insert into person_email (person_id, email, is_primary) values (v_mensch, 'zztest-mensch@chef-treff.de', true);
  insert into role_assignment (person_id, role, scope_type) values (v_mensch, 'volunteers_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  begin
    perform create_kiosk_account('Einlass 1', 'zztest-checkin-1@chef-treff.de', v_ed);
    insert into t_res values ('01_ohne_abschnitt', 'ERLAUBT (BUG)');
  exception when sqlstate '42501' then insert into t_res values ('01_ohne_abschnitt', 'abgewiesen 42501');
  end;

  perform set_config('request.jwt.claims', '', true);
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  v_r := create_kiosk_account('Einlass 1', ' ZZTEST-Checkin-1@chef-treff.de ', v_ed);
  select p.first_name || ' ' || p.last_name || ' | ' || ra.role || '/' || ra.scope_type
         || ' | bis ' || to_char(ra.valid_to at time zone 'Europe/Berlin', 'YYYY-MM-DD HH24:MI')
         || ' (Ende ' || e.end_date || ') | neu=' || (v_r->>'created')
    into v_txt
    from person p join role_assignment ra on ra.person_id = p.id
    join event e on e.id = ra.edition_id
   where p.id = (v_r->>'person_id')::uuid;
  insert into t_res values ('02_neu', v_txt);

  v_r := create_kiosk_account('Einlass 1', 'zztest-checkin-1@chef-treff.de', v_ed);
  select count(*) into v_n from role_assignment ra where ra.person_id = (v_r->>'person_id')::uuid;
  insert into t_res values ('03_verlaengert', 'Rollen=' || v_n || ', neu=' || (v_r->>'created') || ' (erwartet 1, false)');

  begin
    perform create_kiosk_account('Fremd', 'kiosk@gmail.com', v_ed);
    insert into t_res values ('04_fremde_domain', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_txt = message_text;
    insert into t_res values ('04_fremde_domain', v_state || ' ' || v_txt);
  end;

  begin
    perform create_kiosk_account('Mensch', 'zztest-mensch@chef-treff.de', v_ed);
    insert into t_res values ('05_mensch', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_txt = message_text;
    insert into t_res values ('05_mensch', v_state || ' ' || v_txt || ' (Rollen danach: '
      || (select string_agg(ra.role, ',') from role_assignment ra where ra.person_id = v_mensch) || ')');
  end;

  begin
    perform create_kiosk_account('Alt', 'zztest-checkin-2@chef-treff.de', v_alt);
    insert into t_res values ('06a_vergangen', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_txt = message_text;
    insert into t_res values ('06a_vergangen', v_state || ' ' || v_txt);
  end;
  begin
    perform create_kiosk_account('X', 'zztest-checkin-3@chef-treff.de', gen_random_uuid());
    insert into t_res values ('06b_unbekannt', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_txt = message_text;
    insert into t_res values ('06b_unbekannt', v_state || ' ' || v_txt);
  end;

  select count(*) into v_n from audit_log a where a.action = 'access.kiosk_account' and a.object_id = v_r->>'person_id';
  insert into t_res values ('07_audit', v_n || ' (erwartet 2)');
end $$;
select * from t_res order by step;
rollback;
