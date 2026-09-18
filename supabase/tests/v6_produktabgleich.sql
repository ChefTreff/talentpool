-- Smoke-Test 0120 (Produktstamm abgleichen · A4.3). Belegt:
--   01 ohne Partner-Team ist die Liste zu (42501);
--   02 ein fremdes Zielsystem ⇒ 22023 `invalid_system`;
--   03 die Liste liefert den Stamm, der hinausgeht;
--   04 `INI-%` ist **nicht** dabei — Barter gehoert in kein Vertriebs- oder Rechnungssystem;
--   05 reine Messeshop-Artikel (`source_hubspot = false`) bleiben ebenfalls hier;
--   06 ein gemerkter Fremdschluessel kommt beim naechsten Lauf mit;
--   07 derselbe Schluessel zweimal ergibt **eine** Zeile mit dem neuen Wert (idempotent);
--   08 HubSpot und SevDesk stehen je Produkt nebeneinander;
--   09 eine unbekannte SKU ⇒ P0002 `unknown_sku`;
--   10 ein `external_ref` ohne Ziel wird abgewiesen (genau eines von object_id/object_key).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_n integer; v_txt text; v_sku text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  begin perform products_for_sync('hubspot'); insert into t_res values ('01_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01_ohne_recht', 'abgewiesen ' || sqlstate); end;

  insert into role_assignment (person_id, role, scope_type, valid_from)
  values (v_pid, 'area_lead_partner', 'global', now() - interval '1 hour');

  begin perform products_for_sync('airtable'); insert into t_res values ('02_fremdes_system', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('02_fremdes_system', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  select count(*)::integer into v_n from products_for_sync('hubspot');
  insert into t_res values ('03_liste',
    case when v_n > 0 then v_n || ' Produkte gehen hinaus (richtig)' else 'LEER (BUG)' end);

  select count(*)::integer into v_n from products_for_sync('hubspot') s where s.sku like 'INI-%';
  insert into t_res values ('04_ini_uebersprungen',
    case when v_n = 0 then 'keine INI-Produkte (richtig)' else 'FEHLER: ' || v_n end);

  select count(*)::integer into v_n from products_for_sync('hubspot') s
    join product p on p.sku = s.sku where not p.source_hubspot;
  insert into t_res values ('05_shop_artikel_bleiben',
    case when v_n = 0 then 'keine reinen Shop-Artikel (richtig)' else 'FEHLER: ' || v_n end);

  select s.sku into v_sku from products_for_sync('hubspot') s limit 1;
  perform set_product_external_ref(v_sku, 'hubspot', 'hs-111');
  select s.external_id into v_txt from products_for_sync('hubspot') s where s.sku = v_sku;
  insert into t_res values ('06_fremdschluessel',
    case when v_txt = 'hs-111' then 'gemerkt und mitgeliefert (richtig)' else 'unerwartet ' || coalesce(v_txt, 'null') end);

  perform set_product_external_ref(v_sku, 'hubspot', 'hs-222');
  select count(*)::integer into v_n from external_ref
   where system = 'hubspot' and object_type = 'product' and object_key = v_sku;
  select external_id into v_txt from external_ref
   where system = 'hubspot' and object_type = 'product' and object_key = v_sku;
  insert into t_res values ('07_idempotent',
    case when v_n = 1 and v_txt = 'hs-222' then 'eine Zeile, neuer Wert (richtig)'
         else 'unerwartet ' || v_n || '/' || coalesce(v_txt, 'null') end);

  perform set_product_external_ref(v_sku, 'sevdesk', 'sd-9');
  select count(*)::integer into v_n from external_ref where object_type = 'product' and object_key = v_sku;
  insert into t_res values ('08_zwei_systeme',
    case when v_n = 2 then 'HubSpot und SevDesk nebeneinander (richtig)' else 'unerwartet ' || v_n end);

  begin perform set_product_external_ref('GIBT-ES-NICHT', 'hubspot', 'x');
    insert into t_res values ('09_unbekannte_sku', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('09_unbekannte_sku', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  begin
    insert into external_ref (system, object_type, external_id) values ('hubspot', 'product', 'weder-noch');
    insert into t_res values ('10_ohne_ziel', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('10_ohne_ziel', 'abgewiesen ' || sqlstate); end;
end $$;
select * from t_res order by step;
rollback;
-- Lauf am 18.09. gegen die Datenbank (Migration + Test in einer Transaktion, rollback): 10/10 gruen.
-- Bestand dabei: 86 Produkte gehen hinaus, 76 reine Shop-Artikel bleiben hier.
