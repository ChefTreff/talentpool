-- Test zu 0158: die Spalten sind weg, die Sichten und Funktionen darauf laufen weiter.
begin;
create temp table t_res (step text, result text) on commit drop;
insert into t_res select '01_spalten_weg',
  case when exists (select 1 from information_schema.columns where table_schema='public' and table_name in ('audit_log','consent_record') and column_name='ip_hash')
       then 'FEHLER: noch vorhanden' else 'ok' end;
insert into t_res select '02_consent_current_liest', 'ok, ' || count(*) || ' Zeilen' from consent_current;
insert into t_res select '03_audit_log_liest', 'ok, ' || count(*) || ' Zeilen' from audit_log;
select * from t_res order by step;
rollback;
