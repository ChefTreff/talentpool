-- Smoke-Test 0095 (PO-Nummer im Messeshop, F11.2). Belegt:
--   01 ohne Eingabe gilt die Vorgabe aus den Stammdaten;
--   02 eine Eingabe schlägt die Vorgabe;
--   03 leerer Text ist „keine" und wird NULL, nicht ein leerer String —
--      sonst stünde in der Rechnung eine leere Zeile;
--   04 `shop_my_orders` gibt die Nummer heraus;
--   05 bestätigen bleibt für Fremde verboten (42501).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_oe uuid;
  v_order uuid; v_txt text; v_sku text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  delete from staff_user where auth_user_id = v_uid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into organization (legal_name, communication_name, type)
    values ('ZZ PO GmbH', 'ZZPO', 'partner') returning id into v_org;
  insert into org_edition (org_id, edition_id, po_number) values (v_org, v_ed, 'PO-STAMM')
    returning id into v_oe;
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}');

  -- Irgendein bestellbarer Artikel der laufenden Phase.
  select c.sku into v_sku from shop_catalogue(v_org, v_ed) c where c.orderable limit 1;
  if v_sku is null then
    insert into t_res values ('00_kein_artikel', 'Katalog leer — Test nicht aussagekräftig');
    return;
  end if;

  v_order := shop_upsert_line(v_org, v_sku, 1, null, v_ed);
  perform shop_confirm(v_order, 'Notiz');
  select po_number into v_txt from shop_order where id = v_order;
  insert into t_res values ('01_vorgabe',
    case when v_txt = 'PO-STAMM' then 'Vorgabe übernommen (richtig)' else 'unerwartet ' || coalesce(v_txt, 'NULL') end);

  perform shop_edit(v_order);
  perform shop_confirm(v_order, null, 'PO-2027-42');
  select po_number into v_txt from shop_order where id = v_order;
  insert into t_res values ('02_eingabe_schlaegt_vorgabe',
    case when v_txt = 'PO-2027-42' then 'Eingabe gewinnt (richtig)' else 'unerwartet ' || coalesce(v_txt, 'NULL') end);

  -- Leerer Text darf nicht als leerer String landen; die schon gesetzte Nummer
  -- bleibt stehen, weil „nichts eingeben" nicht „löschen" heisst.
  perform shop_edit(v_order);
  perform shop_confirm(v_order, null, '   ');
  select po_number into v_txt from shop_order where id = v_order;
  insert into t_res values ('03_leer_ist_keine',
    case when v_txt = 'PO-2027-42' then 'bestehende bleibt (richtig)'
         when v_txt = '' then 'LEERER STRING (BUG)'
         else 'unerwartet ' || coalesce(v_txt, 'NULL') end);

  select o.po_number into v_txt from shop_my_orders(v_org, v_ed) o where o.id = v_order;
  insert into t_res values ('04_lesen',
    case when v_txt = 'PO-2027-42' then 'sichtbar (richtig)' else 'unerwartet ' || coalesce(v_txt, 'NULL') end);

  delete from role_assignment where person_id = v_pid;
  delete from org_membership where org_id = v_org and person_id = v_pid;
  begin
    perform shop_confirm(v_order, null, 'PO-FREMD');
    insert into t_res values ('05_fremde_org', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('05_fremde_org', 'abgewiesen ' || sqlstate); end;
end $$;
select * from t_res order by step;
rollback;
