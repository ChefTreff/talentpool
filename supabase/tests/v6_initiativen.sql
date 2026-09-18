-- Smoke-Test 0116 (Initiativen · Funnel und Leistungen, A3.1/A3.2/A3.4). Belegt:
--   01 ohne Partner-Team sind Liste, Stufe und Leistungen zu (42501);
--   02 eine erfundene Stufe ⇒ 22023 `invalid_stage`;
--   03 eine unbekannte Organisation ⇒ P0002 `org_edition_not_found`;
--   04 die Stufe wird gesetzt und steht mit Vorher/Nachher im Protokoll;
--   05 `abgelehnt` ist eine Stufe und kein Loeschen — die Zeile bleibt in der Liste;
--   06 die Liste nennt nur Initiativen, keine Partner;
--   07 Leistungen anlegen: Zeilen mit `source = 'agreement'` und Preis **0**, nicht null;
--   08 die Pflichten entstehen von allein (Trigger aus 0041);
--   09 ein zweiter Aufruf **ersetzt** den Stand, statt zu ergaenzen;
--   10 Zeilen aus HubSpot bleiben dabei unberuehrt;
--   11 eine unbekannte SKU ⇒ P0002 `unknown_sku`, **und nichts ist geloescht**
--      (erst pruefen, dann schreiben);
--   12 qty 0 ⇒ 22023 `invalid_items`;
--   13 die Zahlen in der Liste stimmen (Produkte, offene Pflichten);
--   14 die vier INI-Produkte stehen im Stamm, unsichtbar im Shop und mit Preis 0;
--   15 `upsert_product` nimmt eine INI-SKU an (vorher 22023 `invalid_sku`) und weist
--      erfundene Muster weiter ab — sonst waeren die Produkte nur im Studio pflegbar;
--   16 die bestehende Initiative traegt `source = 'portal'`, nicht den Default `hubspot`.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid;
  v_org uuid; v_oe uuid; v_partner_org uuid; v_partner_oe uuid;
  v_n integer; v_bestand integer; v_txt text;
begin
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  insert into organization (legal_name, communication_name, type, slug)
  values ('ZZTEST Initiative e.V.', 'ZZTEST Initiative', 'initiative', 'zztest-initiative')
  returning id into v_org;
  insert into org_edition (org_id, edition_id, source)
  values (v_org, v_ed, 'portal') returning id into v_oe;

  insert into organization (legal_name, type, slug)
  values ('ZZTEST Partner GmbH', 'corporate', 'zztest-partner') returning id into v_partner_org;
  insert into org_edition (org_id, edition_id) values (v_partner_org, v_ed) returning id into v_partner_oe;

  -- 01 ohne Recht -------------------------------------------------------------
  begin
    perform initiatives_admin(v_ed);
    insert into t_res values ('01a_liste_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01a_liste_ohne_recht', 'abgewiesen ' || sqlstate); end;
  begin
    perform set_initiative_stage(v_oe, 'gespraech');
    insert into t_res values ('01b_stufe_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01b_stufe_ohne_recht', 'abgewiesen ' || sqlstate); end;
  begin
    perform assign_org_products(v_oe, '[]'::jsonb);
    insert into t_res values ('01c_leistungen_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01c_leistungen_ohne_recht', 'abgewiesen ' || sqlstate); end;

  insert into role_assignment (person_id, role, scope_type, valid_from)
  values (v_pid, 'area_lead_partner', 'global', now() - interval '1 hour');

  -- 02/03 falsche Eingaben ------------------------------------------------------
  begin
    perform set_initiative_stage(v_oe, 'verhandlung');
    insert into t_res values ('02_erfundene_stufe', 'ANGENOMMEN (BUG)');
  exception when others then
    insert into t_res values ('02_erfundene_stufe', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  begin
    perform set_initiative_stage(gen_random_uuid(), 'outreach');
    insert into t_res values ('03_unbekannte_org', 'ANGENOMMEN (BUG)');
  exception when others then
    insert into t_res values ('03_unbekannte_org', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 04 Stufe setzen und protokollieren -------------------------------------------
  perform set_initiative_stage(v_oe, 'outreach');
  perform set_initiative_stage(v_oe, 'agreement');
  select count(*)::integer into v_n from audit_log a
   where a.action = 'initiative.stage' and a.object_id = v_oe::text
     and a.before->>'pipeline_stage' = 'outreach' and a.after->>'pipeline_stage' = 'agreement'
     and a.actor_person_id = v_pid;
  insert into t_res values ('04_stufe_gesetzt',
    case when v_n = 1 then 'Vorher und Nachher im Protokoll (richtig)' else 'FEHLT (' || v_n || ')' end);

  -- 05 abgelehnt bleibt sichtbar --------------------------------------------------
  perform set_initiative_stage(v_oe, 'abgelehnt');
  select count(*)::integer into v_n from initiatives_admin(v_ed) i where i.org_edition_id = v_oe;
  insert into t_res values ('05_abgelehnt_bleibt',
    case when v_n = 1 then 'bleibt in der Liste (richtig)' else 'verschwunden (BUG)' end);
  perform set_initiative_stage(v_oe, 'agreement');

  -- 06 nur Initiativen -------------------------------------------------------------
  select count(*)::integer into v_n from initiatives_admin(v_ed) i where i.org_edition_id = v_partner_oe;
  insert into t_res values ('06_nur_initiativen',
    case when v_n = 0 then 'Partner nicht in der Liste (richtig)' else 'Partner erscheint (BUG)' end);

  -- 07/08 Leistungen und Pflichten --------------------------------------------------
  v_n := assign_org_products(v_oe, jsonb_build_array(
           jsonb_build_object('sku', 'INI-PARTNERSCHAFT', 'qty', 1),
           jsonb_build_object('sku', 'INI-BEACHFLAG', 'qty', 2)));
  -- `qty` ist numeric und schreibt sich als `2.00`; fuer den Vergleich zaehlt die
  -- Menge, nicht die Nachkommastelle.
  select string_agg(op.product_sku || ':' || op.qty::integer || ':' || coalesce(op.unit_price_cents::text, 'null')
                    || ':' || op.source, ', ' order by op.product_sku)
    into v_txt from org_product op where op.org_edition_id = v_oe;
  insert into t_res values ('07_leistungen',
    case when v_n = 2 and v_txt = 'INI-BEACHFLAG:2:0:agreement, INI-PARTNERSCHAFT:1:0:agreement'
         then 'zwei Zeilen, Preis 0, source agreement (richtig)' else 'unerwartet ' || coalesce(v_txt, 'null') end);

  select count(*)::integer into v_n from deliverable d
   where d.org_edition_id = v_oe and d.key in ('initiative_description', 'initiative_volunteers', 'beachflag_print');
  insert into t_res values ('08_pflichten_von_allein',
    case when v_n = 3 then 'drei Pflichten abgeleitet (richtig)' else 'unerwartet ' || v_n end);

  -- 09 ersetzen statt ergaenzen ------------------------------------------------------
  perform assign_org_products(v_oe, jsonb_build_array(jsonb_build_object('sku', 'INI-STAND-1T', 'qty', 1)));
  select string_agg(op.product_sku, ', ' order by op.product_sku) into v_txt
    from org_product op where op.org_edition_id = v_oe and op.source = 'agreement';
  insert into t_res values ('09_ersetzt',
    case when v_txt = 'INI-STAND-1T' then 'ersetzt (richtig)' else 'unerwartet ' || coalesce(v_txt, 'null') end);

  -- 10 HubSpot-Zeilen bleiben ----------------------------------------------------------
  insert into org_product (org_edition_id, product_sku, qty, unit_price_cents, status, source)
  values (v_oe, 'INI-BEACHFLAG', 1, 12345, 'booked', 'hubspot');
  perform assign_org_products(v_oe, jsonb_build_array(jsonb_build_object('sku', 'INI-STAND-2T', 'qty', 1)));
  select count(*)::integer into v_n from org_product op
   where op.org_edition_id = v_oe and op.source = 'hubspot' and op.unit_price_cents = 12345;
  insert into t_res values ('10_hubspot_unberuehrt',
    case when v_n = 1 then 'fremde Zeile bleibt (richtig)' else 'FEHLT (' || v_n || ')' end);

  -- 11 unbekannte SKU: nichts geloescht -------------------------------------------------
  begin
    perform assign_org_products(v_oe, jsonb_build_array(
      jsonb_build_object('sku', 'INI-STAND-2T', 'qty', 1),
      jsonb_build_object('sku', 'GIBT-ES-NICHT', 'qty', 1)));
    insert into t_res values ('11_unbekannte_sku', 'ANGENOMMEN (BUG)');
  exception when others then
    select count(*)::integer into v_n from org_product op
     where op.org_edition_id = v_oe and op.source = 'agreement';
    insert into t_res values ('11_unbekannte_sku',
      'abgewiesen ' || sqlstate || ' ' || sqlerrm ||
      case when v_n = 1 then ', Stand unveraendert (richtig)' else ', STAND ZERSTOERT (' || v_n || ')' end);
  end;

  -- 12 qty 0 -----------------------------------------------------------------------------
  begin
    perform assign_org_products(v_oe, jsonb_build_array(jsonb_build_object('sku', 'INI-STAND-2T', 'qty', 0)));
    insert into t_res values ('12_qty_null', 'ANGENOMMEN (BUG)');
  exception when others then
    insert into t_res values ('12_qty_null', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 13 Zahlen in der Liste -----------------------------------------------------------------
  select i.produkte || '|' || (i.pflichten_offen > 0)::text || '|' || i.pipeline_stage || '|' || i.source
    into v_txt from initiatives_admin(v_ed) i where i.org_edition_id = v_oe;
  insert into t_res values ('13_zahlen',
    case when v_txt = '2|true|agreement|portal' then 'Produkte, offene Pflichten, Stufe, Quelle (richtig)'
         else 'unerwartet ' || coalesce(v_txt, 'null') end);

  -- 14 Produktstamm ---------------------------------------------------------------------------
  select count(*)::integer into v_n from product p
   where p.sku like 'INI-%' and p.active and not p.shop_visible and p.net_price_cents = 0;
  insert into t_res values ('14_produkte',
    case when v_n = 4 then 'vier Produkte, unsichtbar, Preis 0 (richtig)' else 'unerwartet ' || v_n end);

  -- 15 die Pflege nimmt die neuen Schluessel an -------------------------------
  begin
    perform upsert_product(jsonb_build_object('sku', 'INI-BEACHFLAG', 'name_de', 'Beachflag (geaendert)'));
    select name_de into v_txt from product where sku = 'INI-BEACHFLAG';
    insert into t_res values ('15a_ini_sku_pflegbar',
      case when v_txt = 'Beachflag (geaendert)' then 'angenommen (richtig)' else 'unerwartet ' || coalesce(v_txt, 'null') end);
  exception when others then
    insert into t_res values ('15a_ini_sku_pflegbar', 'ABGEWIESEN (BUG) ' || sqlstate || ' ' || sqlerrm); end;
  begin
    perform upsert_product(jsonb_build_object('sku', 'BLA-123', 'name_de', 'Unsinn'));
    insert into t_res values ('15b_erfundenes_muster', 'ANGENOMMEN (BUG)');
  exception when others then
    insert into t_res values ('15b_erfundenes_muster', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 16 Bestand nachgezogen ------------------------------------------------------
  -- Zaehlt die Initiativen **ohne** die selbst angelegte: nur dann belegt der
  -- Schritt, dass der Nachtrag den Bestand erwischt hat und nicht bloss die
  -- eigene Zeile, die ohnehin mit `portal` entsteht.
  select count(*) filter (where oe.source <> 'portal')::integer,
         count(*)::integer
    into v_n, v_bestand
    from org_edition oe join organization o on o.id = oe.org_id
   where o.type = 'initiative' and oe.id <> v_oe;
  insert into t_res values ('16_bestand_portal',
    case when v_bestand = 0 then 'kein Bestand zum Pruefen (Schritt sagt nichts)'
         when v_n = 0 then 'Bestand auf portal (richtig, ' || v_bestand || ' Zeile(n))'
         else 'FEHLT — ' || v_n || ' von ' || v_bestand || ' noch auf hubspot' end);
end $$;
select * from t_res order by step;
rollback;
-- Lauf am 18.09. gegen die Datenbank (Migration + Test in einer Transaktion, rollback): 16/16 gruen.
-- Nachtrag 18.09. (Auflagen der Architektur-Session): Schritte 15 und 16 neu. Einzeln geprueft —
-- die erweiterte SKU-Bedingung nimmt `I-39740`, `INI-PARTNERSCHAFT` und `INI-STAND-2T` an und weist
-- `BLA-123` und `ini-klein` mit 22023 ab; der Bestandsnachtrag erwischt die eine vorhandene
-- Initiative (danach 0 auf `hubspot`). Der Gesamtlauf mit den neuen Schritten steht aus.
