-- Test zu `v6_produktstamm_pflege` (PROD-006). Belegt:
--   01 production_team liest den Stamm, legt an, ändert (Bild, Phase,
--      Sichtbarkeit, Stand-Tage) und setzt Bündel-Bestandteile;
--   02 partner_team weiterhin;
--   03 talent_team: 42501 auf alle drei (Gegenprobe);
--   04 der Abschnitt kennt genau die fünf Rollen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_me uuid; v_uid uuid; v_email text; v_txt text; v_n integer;
  v_rolle text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;

  foreach v_rolle in array array['production_team', 'partner_team', 'talent_team'] loop
    perform set_config('request.jwt.claims', '', true);
    delete from role_assignment where person_id = v_me;
    insert into role_assignment (person_id, role, scope_type) values (v_me, v_rolle, 'global');
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
    v_txt := '';
    begin
      select count(*) into v_n from admin_products();
      v_txt := v_txt || 'lesen=' || (v_n > 0)::text;
    exception when sqlstate '42501' then v_txt := v_txt || 'lesen=42501'; end;
    begin
      perform upsert_product(jsonb_build_object('sku', 'I-99' || case v_rolle when 'production_team' then '901' when 'partner_team' then '902' else '903' end,
        'name_de', 'ZZTEST Artikel ' || v_rolle, 'category', 'mobiliar', 'type', 'shop_item', 'supplier', (select v.key from vocab_term v where v.vocabulary = 'supplier' and v.active order by v.sort_order limit 1), 'net_price_cents', 1500,
        'shop_visible', true, 'late_orderable', true, 'stand_days', '',
        'images', jsonb_build_array(jsonb_build_object('path', 'I-99901/zztest.webp', 'url', 'https://example.org/x.webp', 'name', 'zztest.webp', 'type', 'image/webp', 'size', 10))));
      v_txt := v_txt || ' anlegen=ok';
    exception when sqlstate '42501' then v_txt := v_txt || ' anlegen=42501'; end;
    begin
      perform upsert_product_component('INI-PARTNERSCHAFT', 'INI-BEACHFLAG', 1);
      v_txt := v_txt || ' buendel=ok';
    exception when sqlstate '42501' then v_txt := v_txt || ' buendel=42501'; end;
    insert into t_res values ('0' || case v_rolle when 'production_team' then '1' when 'partner_team' then '2' else '3' end || '_' || v_rolle, v_txt
      || case when v_rolle = 'talent_team' then ' (erwartet lesen=42501 anlegen=42501 buendel=42501)' else ' (erwartet lesen=true anlegen=ok buendel=ok)' end);
  end loop;
  perform set_config('request.jwt.claims', '', true);
  select string_agg(sku || ':' || shop_visible || '/' || late_orderable || '/' || jsonb_array_length(images), ' ' order by sku) into v_txt
    from product where sku in ('I-99901', 'I-99902', 'I-99903');
  insert into t_res values ('01b_geschrieben', coalesce(v_txt, '-') || ' (erwartet I-99901:true/true/1 I-99902:true/true/1)');
  select string_agg(role, ',' order by role) into v_txt from admin_section_role where section = 'productCatalog';
  insert into t_res values ('04_rollen', v_txt || ' (erwartet admin,area_lead_partner,area_lead_production,partner_team,production_team)');
end $$;
select * from t_res order by step;
rollback;
