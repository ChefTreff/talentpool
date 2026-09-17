-- Smoke-Test 0112 (Mail-Vorlagen im Admin). Belegt:
--   01 ohne Admin-Rolle keine Pflege ⇒ 42501 (die Texte gehen an alle);
--   02 auch nicht lesen — die Liste nennt Betreff und Text;
--   03 eine unbekannte Sprache ⇒ 22023 `invalid_locale`;
--   04 leerer Betreff oder leerer Text ⇒ 22023 `fields_required` — der Versand
--      nähme die Vorlage sonst und verschickte eine leere Mail;
--   05 anlegen und ändern; die Version steigt bei jeder Änderung;
--   06 ein weggelassenes Feld bleibt stehen, ein leeres wird abgewiesen;
--   07 **die Zahl der wartenden Mails steht in der Zeile** — das ist der Grund,
--      warum es diese Funktion gibt: wer den Text ändert, ändert die wartenden
--      Mails mit;
--   08 die Historie liefert den vollen Text **vor** der Änderung;
--   09 und `restore_mail_template` holt ihn als neue Fassung zurück.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_n integer; v_txt text; v_version integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  -- `staff_user` gibt es seit dem 17.09. nicht mehr; Team heisst die Rolle admin (0107).
  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01/02 · Ohne Admin.
  begin
    perform upsert_mail_template(jsonb_build_object('key', 'test_vorlage', 'locale', 'de',
                                                    'subject', 'A', 'body_md', 'B'));
    insert into t_res values ('01_schreiben_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('01_schreiben_ohne_recht', 'abgewiesen ' || sqlstate); end;
  begin
    perform mail_templates_admin();
    insert into t_res values ('02_lesen_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('02_lesen_ohne_recht', 'abgewiesen ' || sqlstate); end;

  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');

  -- 03 · Unbekannte Sprache.
  begin
    perform upsert_mail_template(jsonb_build_object('key', 'test_vorlage', 'locale', 'fr',
                                                    'subject', 'A', 'body_md', 'B'));
    insert into t_res values ('03_sprache', 'ANGENOMMEN (BUG)');
  exception when others then
    insert into t_res values ('03_sprache', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 04 · Leere Pflichtfelder beim Anlegen.
  begin
    perform upsert_mail_template(jsonb_build_object('key', 'test_vorlage', 'locale', 'de',
                                                    'subject', '   ', 'body_md', 'B'));
    insert into t_res values ('04_leer', 'ANGENOMMEN (BUG)');
  exception when others then
    insert into t_res values ('04_leer', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 05 · Anlegen und ändern.
  v_version := upsert_mail_template(jsonb_build_object(
    'key', 'test_vorlage', 'locale', 'de', 'subject', 'Erster Betreff',
    'body_md', 'Hallo {{first_name}}', 'description', 'Test'));
  v_version := upsert_mail_template(jsonb_build_object(
    'key', 'test_vorlage', 'locale', 'de', 'subject', 'Zweiter Betreff'));
  select subject || '|' || body_md || '|' || version into v_txt
    from mail_template where key = 'test_vorlage' and locale = 'de';
  insert into t_res values ('05_version',
    case when v_txt = 'Zweiter Betreff|Hallo {{first_name}}|2'
         then 'geaendert, Text bleibt, Version 2 (richtig)'
         else 'unerwartet ' || coalesce(v_txt, 'null') end);

  -- 06 · Leeres Feld beim Ändern.
  begin
    perform upsert_mail_template(jsonb_build_object('key', 'test_vorlage', 'locale', 'de', 'body_md', '  '));
    insert into t_res values ('06_leer_beim_aendern', 'ANGENOMMEN (BUG)');
  exception when others then
    insert into t_res values ('06_leer_beim_aendern', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 07 · Die wartenden Mails.
  insert into mail_log (to_email, template_key, locale, status)
  values ('wartet@example.test', 'test_vorlage', 'de', 'queued'),
         ('wartet2@example.test', 'test_vorlage', 'de', 'queued'),
         ('raus@example.test', 'test_vorlage', 'de', 'sent');
  select m.queued into v_n from mail_templates_admin() m
   where m.key = 'test_vorlage' and m.locale = 'de';
  insert into t_res values ('07_wartende',
    case when v_n = 2 then 'zwei wartende Mails in der Zeile (richtig)' else 'unerwartet ' || v_n end);

  -- 08 · Die Historie kennt den alten Text.
  select h.subject_before into v_txt from mail_template_history('test_vorlage', 'de') h limit 1;
  insert into t_res values ('08_historie',
    case when v_txt = 'Erster Betreff' then 'voller Text vor der Aenderung (richtig)'
         else 'unerwartet ' || coalesce(v_txt, 'null') end);

  -- 09 · Zurückholen.
  perform restore_mail_template('test_vorlage', 'de', 'Erster Betreff', 'Hallo {{first_name}}');
  select subject || '|' || version into v_txt
    from mail_template where key = 'test_vorlage' and locale = 'de';
  insert into t_res values ('09_zurueckholen',
    case when v_txt = 'Erster Betreff|3' then 'alte Fassung als neue Version (richtig)'
         else 'unerwartet ' || coalesce(v_txt, 'null') end);
end $$;
select * from t_res order by step;
rollback;
