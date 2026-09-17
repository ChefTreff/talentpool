-- Smoke-Test 0112 (Messeshop: zwei Phasen, Zugang nur mit Stand, Lunch-Paket). Belegt:
--   01 es gibt genau zwei Phasenfristen, `shop_phase_2` ist weg;
--   02 `shop_phase` rechnet mit zwei Stufen: heute Phase 1 ohne `late_only`;
--   03 nach der ersten Frist gilt Phase 2 mit `late_only`, danach geschlossen;
--   04 eine Org **ohne** Stand bekommt einen leeren Katalog und darf nichts einlegen
--      (P0001 `booth_required`) — die Sperre sitzt im Server, nicht im Menü;
--   05 die Standbühne öffnet den Shop, der Hackathon-Stand **nicht** (Konrad, 17.09.);
--   06 eine Standfläche öffnet ihn ebenfalls;
--   07 das Lunch-Paket steht nicht mehr im Katalog (`shop_visible = false`) …
--   08 … ist aber für eine Org **ohne** Stand über die Pflicht bestellbar (PART-049),
--      und `order_lunch_package` legt eine echte, bestätigte Bestellung an;
--   09 die Pflicht gilt danach als erledigt (Trigger aus 0054 — derselbe Weg, andere Tür);
--   10 die Lunch-Vorlage ist ein Angebot, kein Muss: `required = false`, ohne Kategorie,
--      und `mark_overdue_deliverables` macht sie nicht überfällig (Bedingung 3 des Reviews);
--   11 ein anderer unsichtbarer Artikel bleibt trotz Pflicht-Ausnahme gesperrt;
--   12 `order_lunch_package` ohne Menge ⇒ 22023, für eine fremde Org ⇒ 42501.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_d1 timestamptz; v_d2 timestamptz;
  v_org uuid; v_oe uuid; v_org2 uuid; v_oe2 uuid; v_org3 uuid; v_oe3 uuid;
  v_n integer; v_txt text; v_j jsonb; v_res jsonb; v_order uuid; v_status text; v_req boolean; v_cat text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 Zwei Fristen
  select count(*)::integer into v_n from deadline
   where edition_id = v_ed and key in ('shop_phase1_end', 'shop_phase2_end');
  select count(*)::integer into v_n from deadline where edition_id = v_ed and key like 'shop_phase%';
  insert into t_res values ('01_zwei_fristen',
    case when v_n = 2 then 'genau zwei (richtig)' else 'unerwartet ' || v_n end);

  -- 02 Heute Phase 1
  v_j := shop_phase(v_ed);
  insert into t_res values ('02_phase_heute',
    case when (v_j->>'phase')::integer = 1 and (v_j->>'late_only')::boolean = false
         then 'Phase 1, alles bestellbar (richtig)'
         else 'unerwartet ' || v_j::text end);

  -- 03 Fristen verschieben, um Phase 2 und „zu" zu sehen
  select due_at into v_d1 from deadline where edition_id = v_ed and key = 'shop_phase1_end';
  select due_at into v_d2 from deadline where edition_id = v_ed and key = 'shop_phase2_end';
  update deadline set due_at = now() - interval '1 day' where edition_id = v_ed and key = 'shop_phase1_end';
  v_j := shop_phase(v_ed);
  insert into t_res values ('03_phase_2',
    case when (v_j->>'phase')::integer = 2 and (v_j->>'late_only')::boolean
         then 'Phase 2 nur kurzfristig (richtig)' else 'unerwartet ' || v_j::text end);
  update deadline set due_at = now() - interval '1 day' where edition_id = v_ed and key = 'shop_phase2_end';
  insert into t_res values ('03b_geschlossen',
    case when (shop_phase(v_ed)->>'phase')::integer = 0 then 'zu (richtig)'
         else 'unerwartet ' || shop_phase(v_ed)::text end);
  update deadline set due_at = v_d1 where edition_id = v_ed and key = 'shop_phase1_end';
  update deadline set due_at = v_d2 where edition_id = v_ed and key = 'shop_phase2_end';

  -- Drei Organisationen: ohne Stand, mit Standbühne, mit Hackathon-Stand.
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into organization (legal_name, communication_name, type) values ('ZZ Ohne Stand GmbH', 'ZZOhne', 'corporate') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  insert into organization (legal_name, communication_name, type) values ('ZZ Buehne GmbH', 'ZZBuehne', 'corporate') returning id into v_org2;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org2, v_ed, 'invited') returning id into v_oe2;
  insert into org_product (org_edition_id, product_sku, qty, status) values (v_oe2, 'I-79895', 1, 'booked');
  insert into organization (legal_name, communication_name, type) values ('ZZ Hack GmbH', 'ZZHack', 'corporate') returning id into v_org3;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org3, v_ed, 'invited') returning id into v_oe3;
  insert into org_product (org_edition_id, product_sku, qty, status) values (v_oe3, 'I-10729', 1, 'booked');
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}');
  perform upsert_partner_contact(v_org2, v_email, 'Test', 'Person', '{primary_ops}');
  perform upsert_partner_contact(v_org3, v_email, 'Test', 'Person', '{primary_ops}');
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';

  -- 04 Ohne Stand: leerer Katalog, kein Einlegen
  select count(*)::integer into v_n from shop_catalogue(v_org, v_ed);
  insert into t_res values ('04_katalog_ohne_stand',
    case when v_n = 0 then 'leer (richtig)' else 'ALLOWED (BUG): ' || v_n || ' Artikel' end);
  begin
    perform shop_upsert_line(v_org, 'I-17066', 1, null, v_ed);
    insert into t_res values ('04b_einlegen_ohne_stand', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('04b_einlegen_ohne_stand', 'abgewiesen ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 05 Standbühne öffnet, Hackathon-Stand nicht
  insert into t_res values ('05_buehne_oeffnet',
    case when org_has_booth(v_oe2) then 'ja (richtig)' else 'FEHLT' end);
  insert into t_res values ('05b_hackathon_stand_nicht',
    case when org_has_booth(v_oe3) then 'ALLOWED (BUG): Hackathon-Stand oeffnet den Shop'
         else 'nein (richtig)' end);
  select count(*)::integer into v_n from shop_catalogue(v_org2, v_ed);
  insert into t_res values ('05c_katalog_mit_buehne',
    case when v_n > 0 then v_n || ' Artikel (richtig)' else 'leer (FEHLER)' end);

  -- 06 Standfläche öffnet ebenfalls
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into org_product (org_edition_id, product_sku, qty, status) values (v_oe3, 'I-50131', 1, 'booked');
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  insert into t_res values ('06_standflaeche_oeffnet',
    case when org_has_booth(v_oe3) then 'ja (richtig)' else 'FEHLT' end);

  -- 07 Lunch-Paket nicht mehr im Katalog
  select count(*)::integer into v_n from shop_catalogue(v_org2, v_ed) where sku = 'I-79520';
  insert into t_res values ('07_lunch_nicht_im_katalog',
    case when v_n = 0 then 'unsichtbar (richtig)' else 'ALLOWED (BUG): steht im Katalog' end);

  -- 08 … aber über die Pflicht bestellbar, auch ohne Stand
  select count(*)::integer into v_n from deliverable d join deliverable_template t on t.id = d.template_id
   where d.org_edition_id = v_oe and t.key = 'lunch_package';
  insert into t_res values ('08_pflicht_auch_ohne_stand',
    case when v_n = 1 then 'Pflicht vorhanden (richtig)' else 'unerwartet ' || v_n end);
  begin
    v_res := order_lunch_package(v_org, 5, v_ed);
    v_order := (v_res->>'order_id')::uuid;
    select status into v_status from shop_order where id = v_order;
    insert into t_res values ('08b_bestellung_angelegt',
      case when v_status in ('pending', 'completed') and (v_res->>'sku') = 'I-79520'
           then 'bestaetigte Bestellung ueber den Shop-Weg (richtig)'
           else 'unerwartet ' || coalesce(v_status, 'keine') || '/' || coalesce(v_res->>'sku', 'leer') end);
  exception when others then
    insert into t_res values ('08b_bestellung_angelegt', 'FEHLGESCHLAGEN ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 09 Pflicht gilt als erledigt
  select d.status into v_txt from deliverable d join deliverable_template t on t.id = d.template_id
   where d.org_edition_id = v_oe and t.key = 'lunch_package';
  insert into t_res values ('09_pflicht_erledigt',
    case when v_txt = 'accepted' then 'accepted (richtig)' else 'unerwartet ' || coalesce(v_txt, 'leer') end);

  -- 10 Angebot, kein Muss
  select required, category into v_req, v_cat from deliverable_template where key = 'lunch_package';
  insert into t_res values ('10_angebot_statt_pflicht',
    case when v_req = false and v_cat is null then 'required=false, ohne Kategorie (richtig)'
         else 'unerwartet ' || v_req::text || '/' || coalesce(v_cat, 'null') end);
  -- Überfälligkeit: Frist in die Vergangenheit, Status offen — darf trotzdem nicht overdue werden.
  update deliverable d set status = 'open', due_at = now() - interval '1 day'
    from deliverable_template t where t.id = d.template_id and t.key = 'lunch_package' and d.org_edition_id = v_oe;
  perform mark_overdue_deliverables();
  select d.status into v_txt from deliverable d join deliverable_template t on t.id = d.template_id
   where d.org_edition_id = v_oe and t.key = 'lunch_package';
  insert into t_res values ('10b_keine_ueberfaelligkeit',
    case when v_txt = 'overdue' then 'ALLOWED (BUG): ein Angebot wird gemahnt'
         else 'bleibt ' || coalesce(v_txt, 'leer') || ' (richtig)' end);

  -- 11 Ein anderer unsichtbarer Artikel bleibt gesperrt
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  perform upsert_product(jsonb_build_object('sku', 'I-99999', 'name_de', 'ZZ Unsichtbar', 'type', 'shop_item',
                                            'category', 'mobiliar', 'net_price_cents', 1000, 'shop_visible', false));
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  begin
    perform shop_upsert_line(v_org, 'I-99999', 1, null, v_ed);
    insert into t_res values ('11_anderer_unsichtbarer', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('11_anderer_unsichtbarer', 'abgewiesen ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 12 Eingaben und Rechte
  begin
    perform order_lunch_package(v_org, 0, v_ed);
    insert into t_res values ('12_menge_null', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('12_menge_null', 'abgewiesen ' || sqlstate); end;
end $$;

-- Fremde Organisation: eine Org, in der die Testperson kein Kontakt ist.
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_fremd uuid;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into organization (legal_name, communication_name, type) values ('ZZ Fremd GmbH', 'ZZFremd', 'corporate') returning id into v_fremd;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_fremd, v_ed, 'invited');
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin
    perform order_lunch_package(v_fremd, 2, v_ed);
    insert into t_res values ('12b_fremde_org', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('12b_fremde_org', 'abgewiesen ' || sqlstate); end;
end $$;

select * from t_res order by step;
rollback;
