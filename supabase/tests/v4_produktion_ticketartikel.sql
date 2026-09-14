-- Smoke-Test 0087 (Produktion · Ticketartikel). Belegt:
--   01 ein gebuchtes Ticket-Kontingent (`addon` / category `tickets`) steht
--      **nicht** auf der Stand-Checkliste, ein gebuchter Shop-Artikel schon;
--   02 dasselbe Kontingent taucht in der Bestellliste je Dienstleister nicht auf;
--   03 der Filter hängt nicht am Namen: ein Artikel, der nur `pass_type` trägt,
--      fällt ebenfalls raus;
--   04 die Rechteprüfung bleibt, wo sie war (ohne Rolle 42501).
-- Vor 0087 waren 01–03 rot: `type in ('shop_item','addon')` liess die
-- Kontingente durch (Walkthrough 14.09.2026).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_oe uuid;
        v_ticket_sku text; v_shop_sku text; v_pass_sku text; v_n integer;
        v_supplier text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  delete from staff_user where auth_user_id = v_uid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';

  -- 04 zuerst, solange die Rolle noch fehlt
  begin
    perform booth_checklist(v_ed, null);
    insert into t_res values ('04_ohne_rolle', 'ALLOWED (BUG)');
  exception when others then
    insert into t_res values ('04_ohne_rolle', 'abgewiesen ' || sqlstate);
  end;

  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, valid_from)
  values (v_pid, 'production_team', 'edition', null, v_ed, now() - interval '1 day');

  -- Wegwerf-Stammdaten: der Test darf keinen Katalogstand voraussetzen.
  -- `supplier` muss im Vokabular stehen (trg_product_supplier, P0001
  -- supplier_unknown) — also einen vorhandenen Eintrag nehmen statt erfinden.
  select key into v_supplier from vocab_term
   where vocabulary = 'supplier' and active order by key limit 1;
  insert into product (sku, name_de, name_en, type, category, unit, supplier,
                       net_price_cents, purchase_price_cents, pass_type, active)
  values ('I-99001', 'ZZTEST Kontingent', 'ZZTEST contingent',
          'addon', 'tickets', 'piece', null, 0, 0, 'partner', true),
         ('I-99002', 'ZZTEST Stuhl', 'ZZTEST chair',
          'shop_item', 'mobiliar', 'piece', v_supplier, 1000, 500, null, true),
         ('I-99003', 'ZZTEST Pass ohne Kategorie', 'ZZTEST pass',
          'addon', 'specials', 'piece', v_supplier, 0, 0, 'talent', true);
  -- `sku` folgt dem Katalogmuster I-#####, `unit`/`status` den Check-Constraints.
  v_ticket_sku := 'I-99001'; v_shop_sku := 'I-99002'; v_pass_sku := 'I-99003';

  select oe.id into v_oe from org_edition oe where oe.edition_id = v_ed limit 1;
  if v_oe is null then
    insert into t_res values ('01_checkliste', 'uebersprungen (keine Organisation in der Edition)');
    insert into t_res values ('02_bestellliste', 'uebersprungen');
    insert into t_res values ('03_pass_ohne_kategorie', 'uebersprungen');
  else
    insert into org_product (org_edition_id, product_sku, qty, status)
    values (v_oe, v_ticket_sku, 10, 'booked'),
           (v_oe, v_shop_sku, 2, 'booked'),
           (v_oe, v_pass_sku, 3, 'booked');

    -- 01 Checkliste: Stuhl ja, Kontingent nein
    select count(*) into v_n from booth_checklist(v_ed, null)
     where org_edition_id = v_oe and product_sku = v_ticket_sku;
    insert into t_res values ('01_checkliste_kontingent',
      case when v_n = 0 then 'nicht gelistet (richtig)' else 'GELISTET (BUG)' end);
    select count(*) into v_n from booth_checklist(v_ed, null)
     where org_edition_id = v_oe and product_sku = v_shop_sku;
    insert into t_res values ('01_checkliste_shopartikel',
      case when v_n = 1 then 'gelistet (richtig)' else 'FEHLT (BUG)' end);

    -- 02 Bestellliste
    select count(*) into v_n from supplier_order_list(v_ed, null)
     where product_sku = v_ticket_sku;
    insert into t_res values ('02_bestellliste_kontingent',
      case when v_n = 0 then 'nicht gelistet (richtig)' else 'GELISTET (BUG)' end);
    select count(*) into v_n from supplier_order_list(v_ed, null)
     where product_sku = v_shop_sku;
    insert into t_res values ('02_bestellliste_shopartikel',
      case when v_n = 1 then 'gelistet (richtig)' else 'FEHLT (BUG)' end);

    -- 03 nur `pass_type`, Kategorie unverdaechtig
    select count(*) into v_n from booth_checklist(v_ed, null)
     where org_edition_id = v_oe and product_sku = v_pass_sku;
    insert into t_res values ('03_pass_ohne_kategorie',
      case when v_n = 0 then 'nicht gelistet (richtig)' else 'GELISTET (BUG)' end);
  end if;
end $$;
select * from t_res order by step;
rollback;
-- Lauf am 14.09. gegen Frankfurt: ohne 0087 rot (01, 02, 03 „GELISTET (BUG)"),
-- mit 0087 im selben Transaktionsblock alle sechs gruen.
