-- Smoke-Test 0113 (Mail-Protokoll als Arbeitsmittel). Belegt:
--   01 ohne Admin kein Lesen ⇒ 42501 (das Protokoll nennt Adressen);
--   02 und kein erneutes Senden ⇒ 42501;
--   03 Filter nach Vorlage, 04 nach Status, 05 nach Person, 06 Suche in Adresse
--      und Betreff;
--   07 die Gesamtzahl steht in der Zeile, auch wenn die Seite nur eine liefert —
--      sonst wüsste das Blättern nicht, wie weit es geht;
--   08 die Detailansicht zeigt die eingesetzten Variablen und sagt, ob erneut
--      gesendet werden kann;
--   09 eine **wartende** Mail lässt sich nicht erneut einreihen (das wäre eine
--      doppelte Mail) ⇒ P0001 `not_resendable`;
--   10 eine **gesperrte** auch nicht — dort steht nur noch der Hash;
--   11 erneut senden legt eine **neue** Zeile mit `queued` und dem Verweis
--      `resend_of` an; versendet wird sie vom Cron wie jede andere;
--   12 die alte Zeile bleibt unverändert — sie ist die Historie;
--   13 das Protokoll trägt alte und neue ID;
--   14 ein `%` im Suchfeld ist ein Zeichen, kein Platzhalter — sonst fände die
--      Eingabe eines einzelnen Prozentzeichens das ganze Protokoll.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_alt bigint; v_neu bigint;
        v_q bigint; v_sup bigint; v_n integer; v_txt text; v_json jsonb;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  insert into mail_log (to_email, person_id, template_key, locale, subject, status, meta, sent_at)
  values ('test-alt@example.test', v_pid, 'test_protokoll', 'de', 'Betreff eins', 'sent',
          jsonb_build_object('vars', jsonb_build_object('first_name', 'Konrad')), now())
  returning id into v_alt;
  insert into mail_log (to_email, template_key, locale, status)
  values ('test-queued@example.test', 'test_protokoll', 'de', 'queued') returning id into v_q;
  insert into mail_log (to_email, template_key, locale, status)
  values ('suppressed:abc', 'test_protokoll', 'de', 'suppressed') returning id into v_sup;

  begin
    perform mail_log_admin();
    insert into t_res values ('01_lesen_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('01_lesen_ohne_recht', 'abgewiesen ' || sqlstate); end;
  begin
    perform requeue_mail(v_alt);
    insert into t_res values ('02_senden_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('02_senden_ohne_recht', 'abgewiesen ' || sqlstate); end;

  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');

  select count(*)::integer into v_n from mail_log_admin(null, 'test_protokoll') m;
  insert into t_res values ('03_filter_vorlage',
    case when v_n = 3 then 'drei Zeilen der Vorlage (richtig)' else 'unerwartet ' || v_n end);
  select count(*)::integer into v_n from mail_log_admin(null, 'test_protokoll', 'queued') m;
  insert into t_res values ('04_filter_status',
    case when v_n = 1 then 'nur die wartende (richtig)' else 'unerwartet ' || v_n end);
  select count(*)::integer into v_n from mail_log_admin(null, 'test_protokoll', null, v_pid) m;
  insert into t_res values ('05_filter_person',
    case when v_n = 1 then 'nur die der Person (richtig)' else 'unerwartet ' || v_n end);
  select count(*)::integer into v_n from mail_log_admin('test-alt@', 'test_protokoll') m;
  insert into t_res values ('06_suche',
    case when v_n = 1 then 'Adresse gefunden (richtig)' else 'unerwartet ' || v_n end);
  select m.total into v_n from mail_log_admin(null, 'test_protokoll', null, null, null, null, 1) m limit 1;
  insert into t_res values ('07_gesamtzahl',
    case when v_n = 3 then 'Gesamtzahl trotz limit 1 (richtig)' else 'unerwartet ' || v_n end);

  v_json := mail_log_detail(v_alt);
  insert into t_res values ('08_detail',
    case when v_json->'vars'->>'first_name' = 'Konrad' and (v_json->>'resendable')::boolean
         then 'Variablen da, erneut moeglich (richtig)' else 'unerwartet ' || v_json::text end);

  begin
    perform requeue_mail(v_q);
    insert into t_res values ('09_queued_nicht', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('09_queued_nicht', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  begin
    perform requeue_mail(v_sup);
    insert into t_res values ('10_suppressed_nicht', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('10_suppressed_nicht', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  v_neu := requeue_mail(v_alt);
  select status || '|' || (meta->>'resend_of') || '|' || to_email::text into v_txt
    from mail_log where id = v_neu;
  insert into t_res values ('11_erneut',
    case when v_txt = 'queued|' || v_alt || '|test-alt@example.test'
         then 'neue Zeile queued mit Verweis (richtig)' else 'unerwartet ' || coalesce(v_txt, 'null') end);
  select status || '|' || coalesce(sent_at::text, '-') into v_txt from mail_log where id = v_alt;
  insert into t_res values ('12_alte_unveraendert',
    case when v_txt like 'sent|2%' then 'alte Zeile unveraendert (richtig)' else 'unerwartet ' || v_txt end);
  select count(*)::integer into v_n from audit_log
   where action = 'mail.requeue' and object_id = v_neu::text and before->>'id' = v_alt::text;
  insert into t_res values ('13_protokoll',
    case when v_n = 1 then 'Audit mit alter und neuer id (richtig)' else 'unerwartet ' || v_n end);

  insert into mail_log (to_email, template_key, locale, subject, status)
  values ('test-prozent@example.test', 'test_protokoll', 'de', 'Rabatt 20 % auf alles', 'sent');
  select count(*)::integer into v_n from mail_log_admin('%', 'test_protokoll') m;
  insert into t_res values ('14_prozent_ist_zeichen',
    case when v_n = 1 then 'nur die Zeile mit dem Prozentzeichen (richtig)' else 'unerwartet ' || v_n end);
end $$;
select * from t_res order by step;
rollback;
-- Lauf am 17.09. gegen die Datenbank (Migration + Test in einer Transaktion, rollback): 14/14 gruen.
