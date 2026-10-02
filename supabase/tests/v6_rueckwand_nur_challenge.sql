-- Test „Rückwand nur an der Challenge“ (K-50, 20261002085359_v6_rueckwand_nur_challenge.sql). Belegt:
--   01 Vorlage hackathon_backdrop hängt an I-37220;
--   02 Organisation nur mit einem anderen Hackathon-Produkt: offene Rückwand-Pflicht wird
--      not_required (nach sync_deliverables), eingereichte bleibt;
--   03 Organisation mit I-37220 behält bzw. bekommt die Pflicht.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_ed uuid; v_tpl deliverable_template; v_sku text; v_o1 uuid; v_oe1 uuid; v_o2 uuid; v_oe2 uuid; v_o3 uuid; v_oe3 uuid; v_s text;
begin
  select * into v_tpl from deliverable_template where key = 'hackathon_backdrop';
  insert into t_res values ('01_vorlage', case when v_tpl.product_sku = 'I-37220' then 'ok' else coalesce(v_tpl.product_sku, 'null') end);

  select e.id into v_ed from event e where e.is_edition and coalesce(e.end_date, current_date) >= current_date order by e.start_date limit 1;
  select p.sku into v_sku from product p where p.category = 'hackathon' and p.sku <> 'I-37220' and p.active limit 1;

  -- Org 1: anderes Hackathon-Produkt, offene Pflicht aus der alten Regel
  insert into organization (legal_name, type) values ('K50 Logo GmbH', 'corporate') returning id into v_o1;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_o1, v_ed, 'invited') returning id into v_oe1;
  insert into org_product (org_edition_id, product_sku, status) values (v_oe1, v_sku, 'booked');
  insert into deliverable (org_edition_id, template_id, key, status) values (v_oe1, v_tpl.id, 'hackathon_backdrop', 'open')
    on conflict (org_edition_id, template_id) do update set status = 'open';
  -- Org 2: anderes Produkt, Pflicht schon eingereicht
  insert into organization (legal_name, type) values ('K50 Eingereicht GmbH', 'corporate') returning id into v_o2;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_o2, v_ed, 'invited') returning id into v_oe2;
  insert into org_product (org_edition_id, product_sku, status) values (v_oe2, v_sku, 'booked');
  insert into deliverable (org_edition_id, template_id, key, status, submitted_at) values (v_oe2, v_tpl.id, 'hackathon_backdrop', 'submitted', now())
    on conflict (org_edition_id, template_id) do update set status = 'submitted';
  -- Org 3: Challenge
  insert into organization (legal_name, type) values ('K50 Challenge GmbH', 'corporate') returning id into v_o3;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_o3, v_ed, 'invited') returning id into v_oe3;
  insert into org_product (org_edition_id, product_sku, status) values (v_oe3, 'I-37220', 'booked');

  perform sync_deliverables(v_oe1); perform sync_deliverables(v_oe2); perform sync_deliverables(v_oe3);

  select string_agg(coalesce((select d.status from deliverable d where d.org_edition_id = x and d.template_id = v_tpl.id), '-'), ',' order by n)
    into v_s from unnest(array[v_oe1, v_oe2, v_oe3]) with ordinality as u(x, n);
  insert into t_res values ('02_03_abgleich', case when v_s = 'not_required,submitted,open' then 'ok' else coalesce(v_s, 'leer') || ' sku=' || coalesce(v_sku, '-') end);
end $$;
select * from t_res order by step;
rollback;
