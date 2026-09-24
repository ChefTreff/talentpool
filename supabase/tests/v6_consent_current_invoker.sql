-- Test zu 0150: `consent_current` folgt der RLS von `consent_record`.
--   01 Eigentümer sieht alle Zeilen (Zahl nur zur Einordnung);
--   02 die Rolle authenticated ohne Person sieht **keine** Zeile — vor 0150 sah sie alle.
begin;
create temp table t_res (step text, result text) on commit drop;
grant insert on t_res to authenticated;
insert into t_res select '01_eigentuemer_zeilen', 'ok, ' || count(*) || ' Zeilen' from consent_current;
set local role authenticated;
insert into t_res
  select '02_authenticated_ohne_person',
         case when count(*) = 0 then 'ok, 0 Zeilen' else 'LECK: ' || count(*) || ' Zeilen' end
    from consent_current;
reset role;
select * from t_res order by step;
rollback;
