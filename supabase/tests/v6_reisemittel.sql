-- Smoke-Test zum Vorschlag v6_reisemittel (SPK-059). Belegt:
--   01 beide Begriffe gibt es — Vorbedingung, sonst wäre 02 auch ohne sie grün;
--   02 „Fernbus“ und „Wohnt in Hamburg“ sind stillgelegt (gegen live: FEHLER);
--   03 die übrigen Verkehrsmittel bleiben angeboten;
--   04 die Labels bleiben erhalten — ein alter Wert zeigt weiter seinen Namen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_da int; v_aktiv int; v_rest int; v_label text;
begin
  select count(*) into v_da from vocab_term where vocabulary = 'travel_mode' and key in ('fernbus', 'vor_ort');
  insert into t_res values ('01_begriffe_da', case when v_da = 2 then 'ok' else 'FEHLER ' || v_da end);

  select count(*) into v_aktiv from vocab_term
   where vocabulary = 'travel_mode' and key in ('fernbus', 'vor_ort') and active;
  insert into t_res values ('02_stillgelegt', case when v_aktiv = 0 then 'ok' else 'FEHLER noch aktiv: ' || v_aktiv end);

  select count(*) into v_rest from vocab_term
   where vocabulary = 'travel_mode' and key in ('bahn', 'flug', 'auto', 'sonstiges') and active;
  insert into t_res values ('03_rest_aktiv', case when v_rest = 4 then 'ok' else 'FEHLER ' || v_rest end);

  select label_de into v_label from vocab_term where vocabulary = 'travel_mode' and key = 'fernbus';
  insert into t_res values ('04_label_bleibt', case when v_label = 'Fernbus' then 'ok' else 'FEHLER ' || coalesce(v_label, 'null') end);
end $$;
select * from t_res order by step;
rollback;
