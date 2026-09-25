-- Smoke-Test (Standpakete, PART-085/086). Nummer offen. Belegt:
--   01 Eigenproduktion General (I-84869) und Premium (I-36848): Stromanschluss 230V ×1, Teppich 9 bzw. 18 qm,
--      Standbeleuchtung ×1 — und nichts sonst;
--   02 „Agency Area Partner“ (I-40175) ist stillgelegt, nicht gelöscht;
--   03 `booth_packages` aus Partnersicht: die Initiativen-Stände (INI-STAND-1T/2T) fehlen, Stände mit
--      format_key booth/stage stehen drin (Vorbedingung: Standbühne I-79895 und ein All-Inclusive-Stand), die
--      Eigenproduktion trägt ihre Stückliste;
--   04 zweiter Lauf der Stückliste ändert nichts (Upsert).
-- Probelauf der Build-Session am 25.09.2026 gegen die Live-Datenbank (`sh scripts/db.sh dry-run`, alles
-- zurückgerollt): 4 von 4 Schritten grün. `booth_packages` aus dem Snapshot, fn-diff rein additiv.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_org uuid; v_n integer; v_txt text; v_b boolean;
begin
  -- 01
  select string_agg(component_sku || '=' || qty::text, ',' order by component_sku) into v_txt
    from product_component where bundle_sku = 'I-84869';
  select count(*)::integer into v_n from product_component where bundle_sku = 'I-36848'
     and ((component_sku = 'I-76440' and qty = 1) or (component_sku = 'I-73593' and qty = 18) or (component_sku = 'I-62157' and qty = 1));
  insert into t_res values ('01_stueckliste',
    case when v_txt = 'I-62157=1.00,I-73593=9.00,I-76440=1.00' and v_n = 3
              and (select count(*) from product_component where bundle_sku = 'I-36848') = 3
         then 'General und Premium: Strom, Teppich, Beleuchtung (richtig)'
         else 'unerwartet: general=' || coalesce(v_txt, 'leer') || ' premium_treffer=' || v_n end);

  -- 02
  select not p.active into v_b from product p where p.sku = 'I-40175';
  insert into t_res values ('02_agency', case when v_b then 'stillgelegt, Zeile bleibt (richtig)' else 'unerwartet: ' || coalesce(v_b::text, 'fehlt') end);

  -- 03 als Partner (Rolle partner_contact einer Wegwerf-Organisation)
  select p.id, p.auth_user_id into v_pid, v_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at limit 1;
  delete from role_assignment where person_id = v_pid;
  insert into organization (legal_name) values ('ZZ Standpakete GmbH') returning id into v_org;
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'partner_contact', 'org', v_org);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  select count(*)::integer into v_n from booth_packages() b where b.sku in ('INI-STAND-1T', 'INI-STAND-2T', 'I-40175');
  select exists (select 1 from booth_packages() b where b.sku = 'I-79895')
     and exists (select 1 from booth_packages() b where b.sku = 'I-50131')
     and exists (select 1 from booth_packages() b where b.sku = 'I-84869' and jsonb_array_length(b.components) = 3)
    into v_b;
  insert into t_res values ('03_standliste',
    case when v_n = 0 and v_b then 'ohne Initiativen-Stände und Agency, mit Ständen und Stückliste (richtig)'
         else 'unerwartet: fremde=' || v_n || ' staende=' || coalesce(v_b::text, 'null') end);
  perform set_config('request.jwt.claims', '', true);

  -- 04 Upsert: derselbe Einfügeblock noch einmal
  insert into product_component (bundle_sku, component_sku, qty) values
    ('I-84869', 'I-76440', 1), ('I-84869', 'I-73593', 9),  ('I-84869', 'I-62157', 1),
    ('I-36848', 'I-76440', 1), ('I-36848', 'I-73593', 18), ('I-36848', 'I-62157', 1)
  on conflict (bundle_sku, component_sku) do update set qty = excluded.qty;
  select count(*)::integer into v_n from product_component where bundle_sku in ('I-84869', 'I-36848');
  insert into t_res values ('04_wiederholbar', case when v_n = 6 then 'sechs Zeilen, keine doppelt (richtig)' else 'unerwartet: ' || v_n end);
end $$;
select * from t_res order by step;
rollback;
