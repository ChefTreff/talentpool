-- Smoke-Test 0111 (Frist der Hackathon-Challenge, Welle 6 B3 / PART-040, PART-032). Belegt:
--   00 **vor** der Migration war die Pflicht ohne Frist — der Test hält den Befund fest,
--      indem er die alte Regel nachstellt und zeigt, dass `deliverable_due` NULL liefert;
--   01 die Frist der Edition steht auf dem 18.03.2027 (vier Wochen vor dem Hackathon);
--   02 die Vorlage zeigt jetzt auf `deadline_key`, nicht mehr auf `weeks_before`;
--   03 eine neu entstehende Pflicht bekommt die Frist mit;
--   04 eine **schon vorhandene** Pflicht wurde nachgezogen (`due_at` ist eine Kopie, kein
--      Verweis — ohne den Nachtrag stünde dort weiter „ohne Frist");
--   05 mit Frist wird die Pflicht auch überfällig, wenn sie verstreicht — das war der
--      eigentliche Schaden: kein Erinnerungs-Digest, kein Countdown, keine Überfälligkeit;
--   06 `upsert_deliverable_template` weist eine unbekannte Regel ab (22023 `invalid_due_rule`)
--      — damit kann sich der Fehler nicht wiederholen;
--   07 `{}` (ohne Frist) bleibt erlaubt, `offset_days` ebenfalls;
--   08 die Fassung aus 0056 ist erhalten: `answers_schema` und `fulfilled_by_sku` gehen beim
--      Speichern nicht verloren, `unknown_sku` greift weiter;
--   09 Pflege bleibt dem Partner-Team vorbehalten ⇒ 42501.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_oe uuid;
  v_tpl deliverable_template; v_oe_row org_edition; v_due timestamptz; v_soll timestamptz;
  v_txt text; v_n integer; v_id uuid; v_del uuid;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  delete from staff_user where auth_user_id = v_uid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  v_soll := timestamptz '2027-03-18 23:59 Europe/Berlin';

  -- 00 Der Befund von damals, nachgestellt: eine Regel, die niemand auswertet.
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into organization (legal_name, communication_name, type)
    values ('ZZ Challenge GmbH', 'ZZChallenge', 'corporate') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status)
    values (v_org, v_ed, 'invited') returning id into v_oe;
  select * into v_oe_row from org_edition where id = v_oe;
  select * into v_tpl from deliverable_template where key = 'hackathon_challenge' limit 1;
  v_tpl.due_rule := '{"weeks_before": 8}'::jsonb;          -- nur lokal, nicht in der Tabelle
  insert into t_res values ('00_alte_regel_ohne_frist',
    case when deliverable_due(v_tpl, v_oe_row) is null then 'NULL wie befundet (Grund der Migration)'
         else 'unerwartet ' || deliverable_due(v_tpl, v_oe_row)::text end);

  -- 01 Frist der Edition
  select due_at into v_due from deadline where edition_id = v_ed and key = 'hackathon_challenge';
  insert into t_res values ('01_frist_18_03_2027',
    case when v_due = v_soll then '18.03.2027 (richtig)' else 'unerwartet ' || coalesce(v_due::text, 'fehlt') end);

  -- 02 Vorlage zeigt auf die Frist
  select due_rule->>'deadline_key' into v_txt from deliverable_template where key = 'hackathon_challenge';
  insert into t_res values ('02_vorlage_deadline_key',
    case when v_txt = 'hackathon_challenge' then 'deadline_key gesetzt (richtig)'
         else 'unerwartet ' || coalesce(v_txt, 'leer') end);

  -- 03 Neue Pflicht bekommt die Frist. Das Challenge-Produkt bucht die Org jetzt —
  --    der Trigger auf `org_product` legt die Pflicht an.
  insert into org_product (org_edition_id, product_sku, qty, status)
    values (v_oe, 'I-37220', 1, 'booked');
  select d.id, d.due_at into v_del, v_due
    from deliverable d join deliverable_template t on t.id = d.template_id
   where d.org_edition_id = v_oe and t.key = 'hackathon_challenge';
  insert into t_res values ('03_neue_pflicht_mit_frist',
    case when v_due = v_soll then 'Frist übernommen (richtig)'
         else 'unerwartet ' || coalesce(v_due::text, 'ohne Frist') end);

  -- 04 Bestandspflicht nachgezogen: auf „ohne Frist" zurücksetzen, dann den Nachtrag der
  --    Migration wiederholen — er muss die Kopie wieder füllen.
  update deliverable set due_at = null where id = v_del;
  update deliverable d
     set due_at = dl.due_at
    from deliverable_template t, org_edition oe, deadline dl
   where d.template_id = t.id and d.org_edition_id = oe.id
     and dl.edition_id = oe.edition_id and dl.key = 'hackathon_challenge'
     and t.key = 'hackathon_challenge' and d.due_at is distinct from dl.due_at;
  select due_at into v_due from deliverable where id = v_del;
  insert into t_res values ('04_bestand_nachgezogen',
    case when v_due = v_soll then 'Kopie wieder gefüllt (richtig)'
         else 'unerwartet ' || coalesce(v_due::text, 'ohne Frist') end);

  -- 05 Der eigentliche Schaden: ohne Frist wird nichts überfällig.
  update deliverable set due_at = now() - interval '1 day', status = 'open' where id = v_del;
  perform mark_overdue_deliverables();
  select status into v_txt from deliverable where id = v_del;
  insert into t_res values ('05_wird_ueberfaellig',
    case when v_txt = 'overdue' then 'overdue (richtig — vorher unmöglich)'
         else 'unerwartet ' || coalesce(v_txt, 'leer') end);

  -- 06 Unbekannte Regel wird abgewiesen
  begin
    perform upsert_deliverable_template(jsonb_build_object(
      'key', 'zz_test_regel', 'type', 'info', 'label_de', 'ZZ Test', 'label_en', 'ZZ test',
      'due_rule', jsonb_build_object('weeks_before', 8)));
    insert into t_res values ('06_unbekannte_regel', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('06_unbekannte_regel', 'abgewiesen ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 07 Erlaubte Regeln
  begin
    v_id := upsert_deliverable_template(jsonb_build_object(
      'key', 'zz_ohne_frist', 'type', 'info', 'label_de', 'ZZ ohne Frist', 'label_en', 'ZZ no deadline',
      'due_rule', '{}'::jsonb));
    v_id := upsert_deliverable_template(jsonb_build_object(
      'key', 'zz_offset', 'type', 'info', 'label_de', 'ZZ Offset', 'label_en', 'ZZ offset',
      'due_rule', jsonb_build_object('offset_days', 14)));
    insert into t_res values ('07_erlaubte_regeln', 'leer und offset_days gehen (richtig)');
  exception when others then
    insert into t_res values ('07_erlaubte_regeln', 'ABGEWIESEN (BUG) ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 08 Die Fassung aus 0056 ist erhalten geblieben.
  v_id := upsert_deliverable_template(jsonb_build_object(
    'key', 'zz_schema', 'type', 'form', 'label_de', 'ZZ Schema', 'label_en', 'ZZ schema',
    'answers_schema', jsonb_build_array(jsonb_build_object('key','a','type','text','required',true)),
    'fulfilled_by_sku', 'I-79520'));
  select jsonb_array_length(answers_schema), fulfilled_by_sku into v_n, v_txt
    from deliverable_template where id = v_id;
  insert into t_res values ('08_0056_erhalten',
    case when v_n = 1 and v_txt = 'I-79520' then 'answers_schema und fulfilled_by_sku bleiben (richtig)'
         else 'unerwartet ' || coalesce(v_n::text, 'null') || '/' || coalesce(v_txt, 'leer') end);
  begin
    perform upsert_deliverable_template(jsonb_build_object(
      'key', 'zz_sku', 'type', 'info', 'label_de', 'ZZ SKU', 'label_en', 'ZZ SKU',
      'fulfilled_by_sku', 'I-00000'));
    insert into t_res values ('08b_unknown_sku', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('08b_unknown_sku', 'abgewiesen ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 09 Ohne Team-Rolle keine Pflege
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  begin
    perform upsert_deliverable_template(jsonb_build_object(
      'key', 'zz_verboten', 'type', 'info', 'label_de', 'ZZ', 'label_en', 'ZZ'));
    insert into t_res values ('09_pflege_ohne_rolle', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('09_pflege_ohne_rolle', 'abgewiesen ' || sqlstate); end;
end $$;

select * from t_res order by step;
rollback;
