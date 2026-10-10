-- Test zu `v6_grant_team_role` (ADM-086, Plan 10.10.2026). Belegt `grant_team_role(person, role, edition)` — „+ Rolle“ und „Aus dem Talentpool“:
--   01 Person mit Konto + neue Teamrolle für die Edition: Zuweisung steht (edition-gebunden), genau eine Mail `team_member_added` in der Warteschlange
--      (mail=queued, Status queued, Rolle in Worten aus dem Vokabular, nicht der Schlüssel), granted=true;
--   02 dieselbe Rolle nochmal: keine zweite Mail (mail=none, granted=false), Zahl der Mails unverändert;
--   03 Person ohne Konto: Rolle ja, Mail nein (mail=none, has_login=false), nichts in mail_log;
--   04 `admin` ist immer global: mit Edition aufgerufen steht die Zuweisung trotzdem ohne Edition; Person mit Konto bekommt die Mail;
--   05 abgelaufene Zuweisung gilt als neu: nach `valid_to` in der Vergangenheit erneut vergeben ⇒ granted=true, mail=queued;
--   06 gesperrte Person ⇒ access_blocked, keine Zuweisung, keine Mail;
--   07 Abweisungen: Rolle `talent` ⇒ invalid_role, unbekannte Edition ⇒ edition_not_found, unbekannte Person ⇒ person_not_found; nichts angelegt;
--   08 gesperrte Adresse (Sperrliste) ⇒ mail=suppressed, im Protokoll keine Klartext-Adresse;
--   09 Audit `access.team_role` ohne Klartext-Adresse (kein „@“ im Payload), mit Mailstatus;
--   10 Rechte: Teamrolle ohne Abschnitt access ⇒ 42501, keine Zuweisung, keine Mail.
-- Läuft gegen die Datenbank mit der Migration (db.sh dry-run) und rollt zurück; es geht keine Mail raus.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_me uuid; v_uid uuid; v_email text; v_ed uuid; v_j jsonb; v_txt text; v_n integer; v_n0 integer;
  v_a uuid; v_b uuid; v_c uuid; v_acct uuid := gen_random_uuid(); v_acct2 uuid := gen_random_uuid();
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  select id into v_ed from event where is_edition order by start_date desc limit 1;

  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');
  -- A: mit Konto · B: ohne Konto · C: mit Konto, gesperrt
  insert into auth.users (id, email, aud, role) values
    (v_acct, 'zztest-rolle-a@example.org', 'authenticated', 'authenticated'),
    (v_acct2, 'zztest-rolle-c@example.org', 'authenticated', 'authenticated');
  insert into person (first_name, last_name, auth_user_id) values ('Anna', 'ZZTEST-Rolle', v_acct) returning id into v_a;
  insert into person_email (person_id, email, is_primary) values (v_a, 'zztest-rolle-a@example.org', true);
  insert into person (first_name, last_name) values ('Bert', 'ZZTEST-Rolle') returning id into v_b;
  insert into person_email (person_id, email, is_primary) values (v_b, 'zztest-rolle-b@example.org', true);
  insert into person (first_name, last_name, auth_user_id, access_blocked_at) values ('Cleo', 'ZZTEST-Rolle', v_acct2, now()) returning id into v_c;
  insert into person_email (person_id, email, is_primary) values (v_c, 'zztest-rolle-c@example.org', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01
  v_j := grant_team_role(v_a, 'programme_team', v_ed);
  select 'granted=' || (v_j->>'granted') || ' mail=' || (v_j->>'mail') || ' login=' || (v_j->>'has_login')
         || ' zuweisung=' || (select count(*) from role_assignment where person_id = v_a and role = 'programme_team' and scope_type = 'edition' and edition_id = v_ed and valid_to is null)
         || ' mails=' || count(*) || ' status=' || coalesce(max(ml.status), '-')
         || ' an_person=' || coalesce(bool_and(ml.person_id = v_a)::text, '-')
         || ' rolle_de=' || coalesce(max(ml.meta->'vars'->>'roles_de'), '-')
         || ' schluessel_im_text=' || coalesce(bool_or(ml.meta->'vars'->>'roles_de' ~ '_team')::text, '-')
    into v_txt from mail_log ml where ml.template_key = 'team_member_added' and ml.person_id = v_a;
  insert into t_res values ('01_neue_rolle_mit_konto', v_txt || ' (erwartet granted=true mail=queued login=true zuweisung=1 mails=1 status=queued an_person=true; Rolle in Worten, schluessel_im_text=false)');

  -- 02
  select count(*) into v_n0 from mail_log where template_key = 'team_member_added' and person_id = v_a;
  v_j := grant_team_role(v_a, 'programme_team', v_ed);
  select count(*) into v_n from mail_log where template_key = 'team_member_added' and person_id = v_a;
  insert into t_res values ('02_gleiche_rolle', 'granted=' || (v_j->>'granted') || ' mail=' || (v_j->>'mail') || ' neue_mails=' || (v_n - v_n0)
    || ' zuweisungen=' || (select count(*) from role_assignment where person_id = v_a and role = 'programme_team')
    || ' (erwartet granted=false mail=none neue_mails=0 zuweisungen=1)');

  -- 03
  v_j := grant_team_role(v_b, 'partner_team', v_ed);
  insert into t_res values ('03_ohne_konto', 'granted=' || (v_j->>'granted') || ' mail=' || (v_j->>'mail') || ' login=' || (v_j->>'has_login')
    || ' zuweisung=' || (select count(*) from role_assignment where person_id = v_b and role = 'partner_team')
    || ' mails=' || (select count(*) from mail_log where template_key = 'team_member_added' and person_id = v_b)
    || ' (erwartet granted=true mail=none login=false zuweisung=1 mails=0)');

  -- 04
  v_j := grant_team_role(v_a, 'admin', v_ed);
  insert into t_res values ('04_admin_global', 'mail=' || (v_j->>'mail')
    || ' scope=' || (select scope_type || '/' || coalesce(edition_id::text, 'ohne') from role_assignment where person_id = v_a and role = 'admin')
    || ' (erwartet mail=queued scope=global/ohne)');

  -- 05
  perform set_config('request.jwt.claims', '', true);
  update role_assignment set valid_from = now() - interval '2 days', valid_to = now() - interval '1 day' where person_id = v_a and role = 'programme_team';
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  v_j := grant_team_role(v_a, 'programme_team', v_ed);
  insert into t_res values ('05_abgelaufen', 'granted=' || (v_j->>'granted') || ' mail=' || (v_j->>'mail')
    || ' gueltig=' || (select count(*) from role_assignment where person_id = v_a and role = 'programme_team' and valid_to is null)
    || ' (erwartet granted=true mail=queued gueltig=1)');

  -- 06
  select count(*) into v_n0 from mail_log where template_key = 'team_member_added' and person_id = v_c;
  begin perform grant_team_role(v_c, 'programme_team', v_ed); v_txt := 'ERLAUBT'; exception when others then v_txt := sqlerrm; end;
  insert into t_res values ('06_gesperrt', v_txt || ' zuweisung=' || (select count(*) from role_assignment where person_id = v_c)
    || ' neue_mails=' || ((select count(*) from mail_log where template_key = 'team_member_added' and person_id = v_c) - v_n0)
    || ' (erwartet access_blocked zuweisung=0 neue_mails=0)');

  -- 07
  v_txt := '';
  begin perform grant_team_role(v_b, 'talent', v_ed); v_txt := v_txt || 'ERLAUBT '; exception when others then v_txt := v_txt || sqlerrm || ' '; end;
  begin perform grant_team_role(v_b, 'marketing_team', gen_random_uuid()); v_txt := v_txt || 'ERLAUBT '; exception when others then v_txt := v_txt || sqlerrm || ' '; end;
  begin perform grant_team_role(gen_random_uuid(), 'marketing_team', v_ed); v_txt := v_txt || 'ERLAUBT'; exception when others then v_txt := v_txt || sqlerrm; end;
  insert into t_res values ('07_abgewiesen', v_txt || ' angelegt=' || (select count(*) from role_assignment where person_id = v_b and role in ('talent', 'marketing_team'))
    || ' (erwartet invalid_role edition_not_found person_not_found angelegt=0)');

  -- 08
  perform set_config('request.jwt.claims', '', true);
  insert into suppression (email_hash, reason) values (email_hash('zztest-rolle-a@example.org'), 'test') on conflict (email_hash) do nothing;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  v_j := grant_team_role(v_a, 'marketing_team', v_ed);
  insert into t_res values ('08_gesperrte_adresse', 'mail=' || (v_j->>'mail')
    || ' protokoll_ohne_klartext=' || (select count(*) from mail_log where person_id = v_a and status = 'suppressed' and to_email::text not like '%@%')
    || ' (erwartet mail=suppressed protokoll_ohne_klartext=1)');

  -- 09
  select count(*) filter (where after::text like '%@%'), string_agg(distinct after->>'mail', ',' order by after->>'mail') into v_n, v_txt
    from audit_log where action = 'access.team_role' and object_id in (v_a::text, v_b::text);
  insert into t_res values ('09_audit', v_n || ' mit_adresse, mail-Werte: ' || coalesce(v_txt, '-') || ' (erwartet 0 mit_adresse; Werte none,queued,suppressed)');

  -- 10
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'talent_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  select count(*) into v_n0 from mail_log where template_key = 'team_member_added';
  begin perform grant_team_role(v_b, 'marketing_team', v_ed); v_txt := 'ERLAUBT'; exception when sqlstate '42501' then v_txt := '42501'; end;
  insert into t_res values ('10_ohne_abschnitt', v_txt || ' zuweisung=' || (select count(*) from role_assignment where person_id = v_b and role = 'marketing_team')
    || ' neue_mails=' || ((select count(*) from mail_log where template_key = 'team_member_added') - v_n0) || ' (erwartet 42501 zuweisung=0 neue_mails=0)');
end $$;
select * from t_res order by step;
rollback;
