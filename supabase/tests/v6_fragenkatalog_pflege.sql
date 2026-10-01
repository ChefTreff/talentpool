-- Test zu `v6_fragenkatalog_pflege` (ADM-061). Belegt:
--   01 ohne Abschnittsrecht 42501 — Volunteer-Team gehört nicht dazu;
--   02 Partner-Team darf; eine Frage anlegen, `partner_selectable` schalten;
--   03 Schlüssel bleibt beim Ändern fest, auch wenn ein anderer mitkommt;
--   04 Auswahlfrage ohne zwei Optionen: `options_required`; doppelte Option:
--      `invalid_options`; Freitext verliert mitgegebene Optionen;
--   05 Typwechsel einer benutzten Frage: `question_in_use` (Gegenprobe:
--      unbenutzt geht);
--   06 doppelter Schlüssel: `key_taken`; ungültiger: `invalid_key`;
--   07 Reihenfolge: Teilliste `invalid_order`, volle Liste setzt 1..n;
--   08 jede Änderung im Audit-Log;
--   09 `authenticated` darf die Tabelle weiterhin nicht direkt schreiben.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_me uuid; v_uid uuid; v_email text; v_ed uuid;
  v_q uuid; v_sel uuid; v_session uuid; v_ids uuid[]; v_txt text; v_state text; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  select id into v_ed from event where is_edition and slug = 'fls27';
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'volunteers_team', 'global');
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01
  begin
    perform upsert_question_catalog('{"key":"zztest_frage","type":"text","label_de":"ZZTEST","label_en":"ZZTEST"}');
    insert into t_res values ('01_ohne_abschnitt', 'ERLAUBT (BUG)');
  exception when sqlstate '42501' then
    insert into t_res values ('01_ohne_abschnitt', 'abgewiesen 42501');
  end;

  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'partner_team', 'global');
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 02
  v_q := upsert_question_catalog('{"key":"zztest_frage","type":"textarea","label_de":"ZZTEST Frage","label_en":"ZZTEST question"}');
  perform upsert_question_catalog(jsonb_build_object('id', v_q, 'label_de', 'ZZTEST Frage', 'label_en', 'ZZTEST question', 'partner_selectable', true));
  select 'partner=' || q.partner_selectable || ', aktiv=' || q.active into v_txt from question_catalog q where q.id = v_q;
  insert into t_res values ('02_anlegen_und_schalten', v_txt || ' (erwartet true, true)');

  -- 03
  perform upsert_question_catalog(jsonb_build_object('id', v_q, 'key', 'anderer_key', 'label_de', 'ZZTEST Frage 2', 'label_en', 'x'));
  select q.key || ' / ' || q.label_de into v_txt from question_catalog q where q.id = v_q;
  insert into t_res values ('03_schluessel_fest', v_txt || ' (erwartet zztest_frage / ZZTEST Frage 2)');

  -- 04
  begin
    perform upsert_question_catalog('{"key":"zztest_sel","type":"select","label_de":"A","label_en":"A","options":[{"key":"a","label_de":"A","label_en":"A"}]}');
    insert into t_res values ('04a_eine_option', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_txt = message_text;
    insert into t_res values ('04a_eine_option', v_state || ' ' || v_txt);
  end;
  begin
    perform upsert_question_catalog('{"key":"zztest_sel","type":"select","label_de":"A","label_en":"A","options":[{"key":"a","label_de":"A","label_en":"A"},{"key":"a","label_de":"B","label_en":"B"}]}');
    insert into t_res values ('04b_doppelte_option', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_txt = message_text;
    insert into t_res values ('04b_doppelte_option', v_state || ' ' || v_txt);
  end;
  v_sel := upsert_question_catalog('{"key":"zztest_sel","type":"select","label_de":"A","label_en":"A","options":[{"key":"a","label_de":"A","label_en":"A"},{"key":"b","label_de":"B","label_en":"B"}]}');
  perform upsert_question_catalog(jsonb_build_object('id', v_q, 'label_de', 'ZZTEST Frage 2', 'label_en', 'x',
                                                     'options', '[{"key":"z","label_de":"Z","label_en":"Z"}]'::jsonb));
  select coalesce(q.options::text, 'null') into v_txt from question_catalog q where q.id = v_q;
  insert into t_res values ('04c_freitext_ohne_optionen', v_txt || ' (erwartet null)');

  -- 05
  perform set_config('request.jwt.claims', '', true);
  insert into session (event_id, format, title_de) values (v_ed, 'masterclass', 'ZZTEST Katalog') returning id into v_session;
  insert into session_question (session_id, question_id, required, sort_order) values (v_session, v_q, false, 1);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin
    perform upsert_question_catalog(jsonb_build_object('id', v_q, 'type', 'url', 'label_de', 'x', 'label_en', 'x'));
    insert into t_res values ('05a_typwechsel_benutzt', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_txt = message_text;
    insert into t_res values ('05a_typwechsel_benutzt', v_state || ' ' || v_txt);
  end;
  perform upsert_question_catalog(jsonb_build_object('id', v_sel, 'type', 'text', 'label_de', 'A', 'label_en', 'A'));
  select q.type || ', Optionen=' || coalesce(q.options::text, 'null') into v_txt from question_catalog q where q.id = v_sel;
  insert into t_res values ('05b_typwechsel_unbenutzt', v_txt || ' (erwartet text, null)');

  -- 06
  begin
    perform upsert_question_catalog('{"key":"zztest_frage","type":"text","label_de":"x","label_en":"x"}');
    insert into t_res values ('06a_doppelter_schluessel', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_txt = message_text;
    insert into t_res values ('06a_doppelter_schluessel', v_state || ' ' || v_txt);
  end;
  begin
    perform upsert_question_catalog('{"key":"Mit Leerzeichen","type":"text","label_de":"x","label_en":"x"}');
    insert into t_res values ('06b_ungueltiger_schluessel', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_txt = message_text;
    insert into t_res values ('06b_ungueltiger_schluessel', v_state || ' ' || v_txt);
  end;

  -- 07
  begin
    perform reorder_question_catalog(array[v_q]);
    insert into t_res values ('07a_teilliste', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_txt = message_text;
    insert into t_res values ('07a_teilliste', v_state || ' ' || v_txt);
  end;
  select array_agg(q.id order by q.sort_order desc, q.key) into v_ids from question_catalog q;
  perform reorder_question_catalog(v_ids);
  select string_agg(q.sort_order::text, ',' order by q.sort_order) into v_txt from question_catalog q;
  insert into t_res values ('07b_volle_liste', v_txt);
  select (select q.sort_order from question_catalog q where q.id = v_ids[1])::text into v_txt;
  insert into t_res values ('07c_erste_id_vorn', v_txt || ' (erwartet 1)');

  -- 08
  select count(*) into v_n from audit_log a where a.action like 'question_catalog.%'
     and (a.object_id in (v_q::text, v_sel::text) or a.action = 'question_catalog.reordered');
  insert into t_res values ('08_audit', v_n::text || ' Einträge (erwartet ≥ 7)');
end $$;

insert into t_res values ('09_direktes_schreiben',
  case when has_table_privilege('authenticated', 'question_catalog', 'update')
         or has_table_privilege('authenticated', 'question_catalog', 'insert')
       then 'ERLAUBT (BUG)' else 'gesperrt' end);

select * from t_res order by step;
rollback;
