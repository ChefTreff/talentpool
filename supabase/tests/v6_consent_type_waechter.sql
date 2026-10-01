-- Test „Einwilligungstyp-Wächter“ (0231, v6_consent_type_waechter.sql). Belegt:
--   01 keine consent_record-Zeile außerhalb des Vokabulars consent_type (Altwerte bereinigt);
--   02 Einfügen mit erfundenem Typ ⇒ 22023 invalid_vocab_value, detail consent_type;
--   03 Einfügen mit gültigem Typ geht (eigene Testzeile, zurückgerollt);
--   04 ein später deaktivierter Begriff blockiert das Ändern anderer Spalten (revoked_at) nicht;
--   05 Ändern des Typs auf einen ungültigen Wert ⇒ 22023;
--   06 Wächter für anon und authenticated nicht aufrufbar, Trigger vorhanden.
-- Nur selbst angelegte Zeilen werden beurteilt; alles wird zurückgerollt.
-- Probelauf der Architektur-Session am 01.10.2026 (`sh scripts/db.sh dry-run`): 6 von 6 Schritten grün; fn-diff: consent_record_vocab_guard neu.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_id uuid; v_n integer; v_detail text; v_state text; v_msg text;
begin
  select id into v_pid from person where deleted_at is null order by created_at limit 1;

  -- 01 keine fremden Typen mehr
  select count(*) into v_n from consent_record c
   where not exists (select 1 from vocab_term v where v.vocabulary = 'consent_type' and v.key = c.consent_type);
  insert into t_res values ('01_keine_fremden_typen', case when v_n = 0 then 'ok' else 'FEHLER ' || v_n end);

  -- 02 erfundener Typ
  begin
    insert into consent_record (person_id, consent_type, version, granted, source)
    values (v_pid, 'zz_test_unbekannt', '2026-10-test', true, 'test');
    insert into t_res values ('02_unbekannter_typ', 'FEHLER: durchgelassen');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_detail = pg_exception_detail, v_msg = message_text;
    insert into t_res values ('02_unbekannter_typ',
      case when v_state = '22023' and v_msg = 'invalid_vocab_value' and v_detail = 'consent_type' then 'ok'
           else 'FEHLER ' || v_state || ' ' || v_msg || ' ' || coalesce(v_detail, '') end);
  end;

  -- 03 gültiger Typ
  insert into consent_record (person_id, consent_type, version, granted, source)
  values (v_pid, 'photo_video', '2026-10-test', true, 'test') returning id into v_id;
  insert into t_res values ('03_gueltiger_typ', case when v_id is not null then 'ok' else 'FEHLER' end);

  -- 04 deaktivierter Begriff blockiert andere Spalten nicht
  update vocab_term set active = false where vocabulary = 'consent_type' and key = 'photo_video';
  update consent_record set revoked_at = now() where id = v_id;
  select count(*) into v_n from consent_record where id = v_id and revoked_at is not null;
  insert into t_res values ('04_deaktiviert_blockiert_nicht', case when v_n = 1 then 'ok' else 'FEHLER' end);
  update vocab_term set active = true where vocabulary = 'consent_type' and key = 'photo_video';

  -- 05 Änderung auf ungültigen Typ
  begin
    update consent_record set consent_type = 'privacy_policy' where id = v_id;
    insert into t_res values ('05_aenderung_ungueltig', 'FEHLER: durchgelassen');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    insert into t_res values ('05_aenderung_ungueltig', case when v_state = '22023' then 'ok' else 'FEHLER ' || v_state end);
  end;

  -- 06 Grants und Trigger
  insert into t_res values ('06_grants_trigger',
    case when not has_function_privilege('anon', 'consent_record_vocab_guard()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'consent_record_vocab_guard()', 'EXECUTE')
          and exists (select 1 from pg_trigger where tgname = 'trg_consent_record_vocab_guard'
                        and tgrelid = 'public.consent_record'::regclass and not tgisinternal)
         then 'ok' else 'FEHLER' end);
end $$;
select * from t_res order by step;
rollback;
