-- Test zu `v6_hauptbuehnen_2027` (K-80): sechs Hauptbühnen mit den Namen vom 08.10.2026 in der Reihenfolge 1–6,
-- alle vom Typ main ohne Partner (kind = main); die alten Namen gibt es nicht mehr; Lauf ist idempotent.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_ev uuid; v_txt text; v_n integer;
begin
  select st.event_id into v_ev from stage st where st.slug = 'main' and st.name = 'Main Stage' limit 1;
  select string_agg(st.name, ' | ' order by st.sort_order) into v_txt from stage st
   where st.event_id = v_ev and st.kind = 'main' and st.name not like 'TEST%' and st.name not like 'Testdaten%';
  insert into t_res values ('01_sechs', coalesce(v_txt, '-')
    || ' (erwartet Main Stage | Industry Stage | Leadership & Growth Stage | Tech & Impact Stage | ZEIT:Future Forum | Impossible Founders Stage)');
  select count(*) into v_n from stage st where st.event_id = v_ev and st.name in ('Impact & Tech Stage', 'Startup Stage');
  insert into t_res values ('02_alte_namen_weg', v_n::text || ' (erwartet 0)');
  select count(*) into v_n from stage st where st.event_id = v_ev and st.slug in ('impact-tech', 'startup', 'zeit-future-forum');
  insert into t_res values ('03_slugs', v_n::text || ' (erwartet 3: Slugs bleiben, neue Bühne hat zeit-future-forum)');
end $$;
select * from t_res order by step;
rollback;
