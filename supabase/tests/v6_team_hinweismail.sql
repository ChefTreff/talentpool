-- Test zu `v6_team_hinweismail` (ADM-086). Belegt:
--   01 Vorlage team_member_added in DE und EN, aktiv; Platzhalter roles_de/roles_en und portal_url,
--      kein Magic Link und kein Supabase-Invite im Text;
--   02 Person mit Konto (hier: die handelnde Person selbst) bekommt für NEU vergebene Rollen genau
--      eine Mail in der Warteschlange: Rückgabe mail=queued, Rollen in Worten (DE und EN aus dem
--      Vokabular), Vorlage, Empfänger = Person, Status queued;
--   03 zweiter Aufruf ohne neue Rolle: keine zweite Mail (mail=none), Zahl der Mails unverändert;
--   04 Sprache: Person mit preferred_language en bekommt die englische Fassung;
--   05 Person ohne Konto (neu angelegt): keine Hinweismail (die Einladung geht über Supabase),
--      mail=none, has_login=false;
--   06 gesperrte Adresse (Sperrliste): mail=suppressed, im Protokoll keine Klartext-Adresse;
--   07 Audit `access.team_member` ohne Klartext-Adresse (kein „@" im Payload), mit mail-Wert;
--   08 Rechte unverändert: Teamrolle ohne Abschnitt access ⇒ 42501, nichts queued.
-- Läuft gegen die Datenbank mit der Migration (db.sh dry-run) und rollt zurück; es geht keine Mail raus.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_me uuid; v_uid uuid; v_email text; v_ed uuid; v_j jsonb; v_txt text; v_n integer; v_n0 integer;
  v_id bigint; v_p uuid; v_alt text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  select id into v_ed from event where is_edition order by start_date desc limit 1;

  -- 01
  select string_agg(locale || ':' || active::text || ':' || (body_md like '%{{portal_url}}/login%')::text
                    || ':' || (body_md like '%{{roles_' || locale || '}}%')::text
                    || ':' || (body_md !~* '(magic|invite|token|einladungslink)')::text, ' ' order by locale) into v_txt
    from mail_template where key = 'team_member_added';
  insert into t_res values ('01_vorlage', v_txt || ' (erwartet de:true:true:true:true en:true:true:true:true)');

  -- Handelnde Person: admin, damit create_team_member erlaubt ist; Zielperson = sie selbst (hat ein Konto).
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');
  update person set preferred_language = 'de' where id = v_me;
  delete from suppression where email_hash = email_hash(v_email);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 02
  select count(*) into v_n0 from mail_log where template_key = 'team_member_added' and person_id = v_me;
  v_j := create_team_member('Test', 'ZZTEST', v_email, array['hackathon_team', 'marketing_team'], v_ed);
  select ml.id into v_id from mail_log ml where ml.template_key = 'team_member_added' and ml.person_id = v_me order by ml.id desc limit 1;
  select 'mail=' || (v_j->>'mail') || ' mails=' || (count(*) - v_n0) || ' status=' || max(ml.status) || ' locale=' || max(ml.locale)
         || ' an_person=' || bool_and(ml.person_id = v_me)::text
         || ' rollen_de=' || coalesce(max(ml.meta->'vars'->>'roles_de'), '-')
         || ' rollen_en=' || coalesce(max(ml.meta->'vars'->>'roles_en'), '-')
    into v_txt from mail_log ml where ml.template_key = 'team_member_added' and ml.person_id = v_me;
  insert into t_res values ('02_neue_rollen', v_txt
    || ' (erwartet mail=queued mails=1 status=queued locale=de an_person=true; Rollen in Worten aus dem Vokabular, nicht die Schlüssel)');
  insert into t_res values ('02b_worte', 'de_ohne_schluessel=' || ((v_j->>'mail') = 'queued' and (select meta->'vars'->>'roles_de' from mail_log where id = v_id) !~ '_team')::text
    || ' en_ohne_schluessel=' || ((select meta->'vars'->>'roles_en' from mail_log where id = v_id) !~ '_team')::text
    || ' (erwartet true true)');

  -- 03
  select count(*) into v_n0 from mail_log where template_key = 'team_member_added' and person_id = v_me;
  v_j := create_team_member('Test', 'ZZTEST', v_email, array['hackathon_team', 'marketing_team'], v_ed);
  select count(*) into v_n from mail_log where template_key = 'team_member_added' and person_id = v_me;
  insert into t_res values ('03_ohne_neues', 'mail=' || (v_j->>'mail') || ' neue_mails=' || (v_n - v_n0) || ' vergeben=' || (v_j->'roles')::text
    || ' (erwartet mail=none neue_mails=0 vergeben=[])');

  -- 04
  perform set_config('request.jwt.claims', '', true);
  update person set preferred_language = 'en' where id = v_me;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  v_j := create_team_member('Test', 'ZZTEST', v_email, array['volunteers_team'], v_ed);
  select ml.locale into v_txt from mail_log ml where ml.template_key = 'team_member_added' and ml.person_id = v_me order by ml.id desc limit 1;
  insert into t_res values ('04_sprache', 'mail=' || (v_j->>'mail') || ' locale=' || v_txt || ' (erwartet mail=queued locale=en)');

  -- 05 · neue Person ohne Konto
  v_j := create_team_member('Ada', 'ZZTEST', 'zztest-hinweis-neu@example.org', array['partner_team'], v_ed);
  v_p := (v_j->>'person_id')::uuid;
  insert into t_res values ('05_ohne_konto', 'has_login=' || (v_j->>'has_login') || ' mail=' || (v_j->>'mail')
    || ' mails=' || (select count(*) from mail_log where template_key = 'team_member_added' and person_id = v_p)
    || ' (erwartet has_login=false mail=none mails=0)');

  -- 06 · gesperrte Adresse: Person mit Konto, Adresse auf der Sperrliste (als Superuser gesetzt)
  perform set_config('request.jwt.claims', '', true);
  update person set preferred_language = 'de' where id = v_me;
  insert into suppression (email_hash, reason) values (email_hash(v_email), 'test') on conflict do nothing;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  v_j := create_team_member('Test', 'ZZTEST', v_email, array['production_team'], v_ed);
  select count(*) into v_n from mail_log where template_key = 'team_member_added' and person_id = v_me and status = 'suppressed'
     and to_email = 'suppressed:' || email_hash(v_email);
  insert into t_res values ('06_gesperrt', 'mail=' || (v_j->>'mail') || ' protokoll_ohne_klartext=' || v_n
    || ' (erwartet mail=suppressed protokoll_ohne_klartext=1)');

  -- 07
  select count(*) filter (where after::text like '%@%') || ' mit_adresse von ' || count(*) || ', mail-Werte: '
         || coalesce(string_agg(distinct after->>'mail', ','), '-')
    into v_txt from audit_log where action = 'access.team_member' and actor_person_id = v_me and created_at > now() - interval '1 hour';
  insert into t_res values ('07_audit', v_txt || ' (erwartet 0 mit_adresse; Werte none,queued,suppressed)');

  -- 08 · Teamrolle ohne Abschnitt access
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'talent_team', 'global');
  select count(*) into v_n0 from mail_log where template_key = 'team_member_added';
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin perform create_team_member('Test', 'ZZTEST', v_email, array['partner_team'], v_ed); v_txt := 'ERLAUBT'; exception when sqlstate '42501' then v_txt := '42501'; end;
  select count(*) into v_n from mail_log where template_key = 'team_member_added';
  insert into t_res values ('08_ohne_abschnitt', v_txt || ' neue_mails=' || (v_n - v_n0) || ' (erwartet 42501 neue_mails=0)');
end $$;
select * from t_res order by step;
rollback;
