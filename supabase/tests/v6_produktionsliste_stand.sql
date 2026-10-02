-- Smoke-Test Produktionsliste je Stand (PROD-004) und interne Prüfung (PROD-005). Belegt, mit echtem Rollenwechsel
-- (ohne Rolle, Partner-Team, Produktion, Ausnahme aus der Verwaltung) und einer eigenen Test-Organisation mit Stand,
-- Standpaket, direkt gebuchten Leistungen und Messeshop-Bestellungen in allen Zuständen:
--   01 ohne Rolle sind alle fünf Funktionen dicht (42501), auch lesend;
--   02 das Partner-Team ist nicht Produktion: ebenfalls dicht (42501);
--   03 Quellen: Paketausstattung (Stückliste × Menge), Angebot und Shop stehen getrennt und summiert in der Liste;
--      Shop zählt `pending`, `editing` und `completed` (`qty_shop_open` nur die ersten beiden), nicht `draft`
--      und nicht `cancelled`; storniertes Angebot, Pässe und das Paket selbst fehlen; die alten Spalten
--      (Organisation, Standnummer, Dienstleister, Name, Einheit) bleiben richtig;
--   04 Lieferantenliste: Differenz gegen vorher = genau die Mengen dieses Stands, ein Stand mehr; Filter je Dienstleister;
--   05 Haken: eine reine Paket-Position und eine reine Shop-Position lassen sich abhaken (vorher unmöglich),
--      eine unbekannte oder nur stornierte Position ⇒ P0002 `booth_item_not_found`, Haken nehmen geht immer,
--      Audit je Haken;
--   06 Prüfung: ok, problem ohne Notiz ⇒ 22023 `note_required`, problem mit Notiz, falscher Status ⇒ 22023
--      `invalid_status`, unbekannter Punkt ⇒ 22023 `invalid_vocab_value`, zu lange Notiz ⇒ 22023 `text_too_long`,
--      unbekannter Stand ⇒ P0002 `org_edition_not_found`, `open` nimmt zurück, `open` ohne Prüfung schreibt nichts;
--   07 veraltet: nach einer Änderung der bestätigten Bestellung gilt die Prüfung als veraltet, ein neuer Haken
--      macht sie wieder gültig; eine Änderung am Warenkorb (`draft`) ändert nichts;
--   08 Audit `booth.review` mit vorher/nachher;
--   09 Zusammenfassung: Standnummer, Maße des Stands, gebuchte Fläche, Tage, Standpaket, Prüfpunkte aus dem Vokabular;
--   10 Ausnahme aus der Verwaltung gilt jetzt in der Datenbank: Stände zu ⇒ Lieferantenliste weiter offen, und umgekehrt;
--   11 Grants: die fünf öffentlichen Funktionen für authenticated, die zwei internen für niemanden, anon für keine;
--      `booth_review` ohne Grants und mit RLS;
--   12 alle sieben Funktionen SECURITY DEFINER mit festem search_path;
--   13 Vokabular `booth_review_item` mit Begriff und Eintrag in `vocab_binding`.
-- Probelauf 02.10.2026 (`db.sh dry-run`, gegen live, zurückgerollt): 34/34 grün. Gegen live ohne Migration rot
-- (42703, die neuen Spalten fehlen). Die älteren Tests `v4_produktion_ticketartikel` (6/6) und
-- `v6_produktion_abschnitte` (5/5) laufen gegen die neue Fassung unverändert grün; `v4_produktion` Schritt
-- 11_programme_team zeigt `ALLOWED (BUG)` auch ohne diese Migration (veralteter Prüfsatz, `regie_view` ist seit den
-- Bühnenrechten für das Programm-Team lesbar — Architektur-Session, 02.10.).
begin;
create temp table t_res (step text, result text) on commit drop;
create temp table t_base (sku text primary key, qty numeric, orgs integer) on commit drop;

-- Versuch als Zeichenkette: gibt `ALLOWED` oder SQLSTATE und Meldung zurück.
create function pg_temp.versuch(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ALLOWED';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;

-- Wie `versuch`, aber gegen eine Erwartung: `ok: …` oder `FALSCH: …`.
create function pg_temp.erwartet(p_sql text, p_soll text) returns text language plpgsql as $$
declare v_ist text;
begin
  v_ist := pg_temp.versuch(p_sql);
  return case when v_ist = p_soll then 'ok: ' || v_ist else 'FALSCH: ' || v_ist || ' (erwartet ' || p_soll || ')' end;
end $$;

do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid;
  v_org uuid; v_oe uuid; v_booth uuid;
  v_ord1 uuid; v_ord2 uuid; v_ord3 uuid; v_ord4 uuid; v_ord5 uuid;
  v_sku_storniert text; v_sku_pass text;
  v_s text; v_n integer; v_txt text; v_audit_vorher integer;
  k text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  delete from admin_section_override;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';

  -- Aufbau (als Superuser; die Funktionen laufen gleich unter dem JWT oben) ----------------------------------------
  insert into organization (legal_name) values ('ZZTEST Produktionsliste GmbH') returning id into v_org;
  insert into org_edition (org_id, edition_id) values (v_org, v_ed) returning id into v_oe;
  insert into booth (booth_number, length_m, width_m) values ('ZZTEST-PL1', 2, 2) returning id into v_booth;
  insert into booth_assignment (booth_id, org_edition_id) values (v_booth, v_oe);

  -- ein storniertes Add-on, das in keiner Stückliste steht, und ein Pass-Produkt
  select p.sku into v_sku_storniert from product p
   where p.type = 'addon' and coalesce(p.category, '') <> 'tickets' and p.pass_type is null
     and p.sku not in (select component_sku from product_component) and p.sku <> 'I-73593'
   order by p.sku limit 1;
  select p.sku into v_sku_pass from product p where p.pass_type is not null order by p.sku limit 1;

  -- Baseline der Lieferantenliste, bevor der Test-Stand Positionen hat (als Produktion)
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'production_team', 'global');
  -- für alle vier Artikel eine Zeile, auch wenn sie live noch niemand bestellt hat (dann 0)
  insert into t_base (sku, qty, orgs)
    select k.sku, coalesce(s.qty, 0), coalesce(s.orgs, 0)
      from (values ('I-53563'), ('I-27094'), ('I-73593'), ('I-11329')) k(sku)
      left join supplier_order_list(v_ed, null) s on s.product_sku = k.sku;

  -- Angebot: Standpaket Intro (4 qm, Stückliste: Rückwand ×1, Monitor-Rückwand ×1, Teppich ×4, Strom ×1,
  -- Beleuchtung ×1, Barhocker ×2) + 2 Teppich direkt + storniertes Add-on + Pass
  insert into org_product (org_edition_id, product_sku, qty) values (v_oe, 'I-39740', 1);
  insert into org_product (org_edition_id, product_sku, qty) values (v_oe, 'I-73593', 2);
  if v_sku_storniert is not null then
    insert into org_product (org_edition_id, product_sku, qty, status) values (v_oe, v_sku_storniert, 3, 'cancelled');
  end if;
  if v_sku_pass is not null then
    insert into org_product (org_edition_id, product_sku, qty) values (v_oe, v_sku_pass, 5);
  end if;

  -- Messeshop: pending (P1) Barhocker ×4 + Kicker ×1; draft (P2) Gitterbox ×9; editing (P3) Kicker ×2;
  -- completed (P1) Gitterbox ×2; cancelled (P2) Kicker ×5 — aktiv ist je Phase nur eine Bestellung
  insert into shop_order (org_edition_id, order_no, phase, status) values (v_oe, 'ZZTEST-PL-1', 1, 'pending') returning id into v_ord1;
  insert into shop_order (org_edition_id, order_no, phase, status) values (v_oe, 'ZZTEST-PL-2', 2, 'draft') returning id into v_ord2;
  insert into shop_order (org_edition_id, order_no, phase, status) values (v_oe, 'ZZTEST-PL-3', 3, 'editing') returning id into v_ord3;
  insert into shop_order (org_edition_id, order_no, phase, status) values (v_oe, 'ZZTEST-PL-4', 1, 'completed') returning id into v_ord4;
  insert into shop_order (org_edition_id, order_no, phase, status) values (v_oe, 'ZZTEST-PL-5', 2, 'cancelled') returning id into v_ord5;
  insert into shop_order_line (order_id, product_sku, name_de, qty)
    select v_ord1, p.sku, p.name_de, 4 from product p where p.sku = 'I-53563';
  insert into shop_order_line (order_id, product_sku, name_de, qty)
    select v_ord1, p.sku, p.name_de, 1 from product p where p.sku = 'I-27094';
  insert into shop_order_line (order_id, product_sku, name_de, qty)
    select v_ord2, p.sku, p.name_de, 9 from product p where p.sku = 'I-11329';
  insert into shop_order_line (order_id, product_sku, name_de, qty)
    select v_ord3, p.sku, p.name_de, 2 from product p where p.sku = 'I-27094';
  insert into shop_order_line (order_id, product_sku, name_de, qty)
    select v_ord4, p.sku, p.name_de, 2 from product p where p.sku = 'I-11329';
  insert into shop_order_line (order_id, product_sku, name_de, qty)
    select v_ord5, p.sku, p.name_de, 5 from product p where p.sku = 'I-27094';

  -- 01 ohne Rolle: dicht, auch lesend ----------------------------------------------------------------------------
  delete from role_assignment where person_id = v_pid;
  v_s := '';
  for k in select unnest(array[
      format('select * from booth_checklist(%L, null)', v_ed),
      format('select * from supplier_order_list(%L, null)', v_ed),
      format('select * from booth_production_summary(%L)', v_ed),
      format('select set_booth_service_check(%L, %L, true)', v_oe, 'I-24313'),
      format('select set_booth_review(%L, %L, %L)', v_oe, 'orders_fit_size', 'ok')]) loop
    v_s := v_s || left(pg_temp.versuch(k), 5) || ' ';
  end loop;
  insert into t_res values ('01_ohne_rolle', case when v_s = '42501 42501 42501 42501 42501 ' then 'ok: alle fünf abgewiesen (42501)'
                                                  else 'LECK: ' || v_s end);

  -- 02 Partner-Team ist nicht Produktion --------------------------------------------------------------------------
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  v_s := '';
  for k in select unnest(array[
      format('select * from booth_checklist(%L, null)', v_ed),
      format('select * from supplier_order_list(%L, null)', v_ed),
      format('select * from booth_production_summary(%L)', v_ed),
      format('select set_booth_service_check(%L, %L, true)', v_oe, 'I-24313'),
      format('select set_booth_review(%L, %L, %L)', v_oe, 'orders_fit_size', 'ok')]) loop
    v_s := v_s || left(pg_temp.versuch(k), 5) || ' ';
  end loop;
  insert into t_res values ('02_partner_team', case when v_s = '42501 42501 42501 42501 42501 ' then 'ok: alle fünf abgewiesen (42501)'
                                                    else 'LECK: ' || v_s end);

  -- ab hier Produktion
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'production_team', 'global');

  -- 03 Quellen ---------------------------------------------------------------------------------------------------
  select string_agg(c.product_sku || '=' || trim_scale(c.qty_package)::text || '/' || trim_scale(c.qty_offer)::text || '/'
                    || trim_scale(c.qty_shop)::text || '/' || trim_scale(c.qty)::text || '/' || trim_scale(c.qty_shop_open)::text,
                    ' ' order by c.product_sku) into v_txt
    from booth_checklist(v_ed, null) c
   where c.org_edition_id = v_oe;
  -- Paket/Angebot/Shop/Summe/davon offen. Teppich: Paket 4 + Angebot 2; Barhocker: Paket 2 + Shop 4;
  -- Kicker: Shop 1 (pending) + 2 (editing), beides offen; Gitterbox: nur completed ⇒ 2, nichts offen
  insert into t_res values ('03a_mengen',
    case when v_txt = 'I-11329=0/0/2/2/0 I-24313=1/0/0/1/0 I-27094=0/0/3/3/3 I-33612=1/0/0/1/0 I-53563=2/0/4/6/4 '
                      || 'I-62157=1/0/0/1/0 I-73593=4/2/0/6/0 I-76440=1/0/0/1/0'
         then 'ok: ' || v_txt else 'FALSCH: ' || coalesce(v_txt, '(leer)') end);
  select count(*) into v_n from booth_checklist(v_ed, null) c
   where c.org_edition_id = v_oe
     and (c.product_sku = 'I-39740'
          or (v_sku_storniert is not null and c.product_sku = v_sku_storniert)
          or (v_sku_pass is not null and c.product_sku = v_sku_pass));
  insert into t_res values ('03b_ausgeschlossen',
    case when v_n = 0 then 'ok: Paket selbst, storniertes Angebot' || case when v_sku_pass is null then '' else ', Pass' end
                           || ' fehlen (richtig); Warenkorb und Storno nicht gezählt (siehe 03a)'
         else v_n || ' Zeilen zu viel (BUG)' end);
  select c.org_name || '|' || coalesce(c.booth_number, '-') || '|' || coalesce(c.supplier, '-') || '|'
         || coalesce(c.product_name, '-') || '|' || coalesce(c.unit, '-') into v_txt
    from booth_checklist(v_ed, null) c where c.org_edition_id = v_oe and c.product_sku = 'I-53563';
  insert into t_res values ('03c_alte_spalten',
    case when v_txt like 'ZZTEST Produktionsliste GmbH|ZZTEST-PL1|partyrent|Tolix Barhocker|%' then 'ok: ' || v_txt
         else 'FALSCH: ' || coalesce(v_txt, '(leer)') end);

  -- 04 Lieferantenliste ------------------------------------------------------------------------------------------
  select string_agg(s.product_sku || '=+' || trim_scale(s.qty - b.qty)::text || '/Stände+' || (s.orgs - b.orgs)::text
                    || '/Shop' || trim_scale(s.qty_shop)::text, ' ' order by s.product_sku) into v_txt
    from supplier_order_list(v_ed, null) s join t_base b on b.sku = s.product_sku;
  insert into t_res values ('04a_lieferantenliste',
    case when v_txt like 'I-11329=+2/Stände+1/%I-27094=+3/Stände+1/%I-53563=+6/Stände+1/%I-73593=+6/Stände+1/%'
         then 'ok: ' || v_txt else 'FALSCH: ' || coalesce(v_txt, '(leer)') end);
  select count(*) into v_n from supplier_order_list(v_ed, 'partyrent') s where s.supplier <> 'partyrent';
  insert into t_res values ('04b_filter', case when v_n = 0 and exists (select 1 from supplier_order_list(v_ed, 'partyrent'))
                                               then 'ok: nur partyrent' else 'FALSCH (' || v_n || ' fremde Zeilen)' end);

  -- 05 Haken ------------------------------------------------------------------------------------------------------
  select count(*) into v_audit_vorher from audit_log where action = 'booth.service_checked' and object_id = v_oe::text;
  perform set_booth_service_check(v_oe, 'I-24313', true, 'Rückwand steht');     -- nur im Paket
  perform set_booth_service_check(v_oe, 'I-27094', true);                       -- nur im Shop
  select count(*) into v_n from booth_checklist(v_ed, null) c
   where c.org_edition_id = v_oe and c.product_sku in ('I-24313', 'I-27094') and c.checked;
  insert into t_res values ('05a_haken_setzen', case when v_n = 2 then 'ok: Paket- und Shop-Position gehakt' else 'FALSCH (' || v_n || ')' end);
  insert into t_res values ('05b_unbekannt',
    pg_temp.erwartet(format('select set_booth_service_check(%L, %L, true)', v_oe, 'GIBT-ES-NICHT'), 'P0002 booth_item_not_found'));
  if v_sku_storniert is not null then
    insert into t_res values ('05c_nur_storniert',
      pg_temp.erwartet(format('select set_booth_service_check(%L, %L, true)', v_oe, v_sku_storniert), 'P0002 booth_item_not_found'));
  else
    insert into t_res values ('05c_nur_storniert', 'uebersprungen (kein passendes Add-on)');
  end if;
  perform set_booth_service_check(v_oe, 'I-27094', false);
  perform set_booth_service_check(v_oe, 'GIBT-ES-NICHT', false);                -- Haken nehmen geht immer
  select count(*) into v_n from booth_checklist(v_ed, null) c
   where c.org_edition_id = v_oe and c.product_sku = 'I-27094' and not c.checked;
  insert into t_res values ('05d_haken_nehmen', case when v_n = 1 then 'ok: zurückgenommen, unbekannter Artikel ohne Fehler' else 'FALSCH' end);
  select count(*) into v_n from audit_log where action = 'booth.service_checked' and object_id = v_oe::text;
  insert into t_res values ('05e_audit_haken', case when v_n - v_audit_vorher = 4 then 'ok: 4 Einträge' else 'FALSCH: ' || (v_n - v_audit_vorher) end);

  -- 06 Prüfung ----------------------------------------------------------------------------------------------------
  perform set_booth_review(v_oe, 'orders_fit_size', 'ok');
  select string_agg(x->>'status' || '/' || (x->>'stale'), ' ') into v_txt
    from booth_production_summary(v_ed) s, jsonb_array_elements(s.reviews) x where s.org_edition_id = v_oe;
  insert into t_res values ('06a_ok', case when v_txt = 'ok/false' then 'ok: ok, nicht veraltet' else 'FALSCH: ' || coalesce(v_txt, '(leer)') end);
  insert into t_res values ('06b_problem_ohne_notiz',
    pg_temp.erwartet(format('select set_booth_review(%L, %L, %L)', v_oe, 'orders_fit_size', 'problem'), '22023 note_required'));
  insert into t_res values ('06c_problem_nur_leerzeichen',
    pg_temp.erwartet(format('select set_booth_review(%L, %L, %L, %L)', v_oe, 'orders_fit_size', 'problem', '   '), '22023 note_required'));
  perform set_booth_review(v_oe, 'orders_fit_size', 'problem', 'Kicker auf 4 qm');
  select string_agg(x->>'status' || '/' || (x->>'note'), ' ') into v_txt
    from booth_production_summary(v_ed) s, jsonb_array_elements(s.reviews) x where s.org_edition_id = v_oe;
  insert into t_res values ('06d_problem_mit_notiz', case when v_txt = 'problem/Kicker auf 4 qm' then 'ok: ' || v_txt else 'FALSCH: ' || coalesce(v_txt, '(leer)') end);
  insert into t_res values ('06e_falscher_status',
    pg_temp.erwartet(format('select set_booth_review(%L, %L, %L)', v_oe, 'orders_fit_size', 'vielleicht'), '22023 invalid_status'));
  insert into t_res values ('06f_unbekannter_punkt',
    pg_temp.erwartet(format('select set_booth_review(%L, %L, %L)', v_oe, 'gibt_es_nicht', 'ok'), '22023 invalid_vocab_value'));
  insert into t_res values ('06g_zu_lang',
    pg_temp.erwartet(format('select set_booth_review(%L, %L, %L, %L)', v_oe, 'orders_fit_size', 'problem', repeat('x', 1001)), '22023 text_too_long'));
  insert into t_res values ('06h_unbekannter_stand',
    pg_temp.erwartet(format('select set_booth_review(%L, %L, %L)', gen_random_uuid(), 'orders_fit_size', 'ok'), 'P0002 org_edition_not_found'));
  select count(*) into v_audit_vorher from audit_log where action = 'booth.review' and object_id = v_oe::text;
  perform set_booth_review(v_oe, 'orders_fit_size', 'open');
  select count(*) into v_n from booth_review r where r.org_edition_id = v_oe;
  perform set_booth_review(v_oe, 'orders_fit_size', 'open');                    -- nichts zurückzunehmen
  insert into t_res values ('06i_zuruecknehmen',
    case when v_n = 0 and (select count(*) from audit_log where action = 'booth.review' and object_id = v_oe::text) = v_audit_vorher + 1
         then 'ok: zurückgenommen, zweites open ohne Eintrag' else 'FALSCH' end);

  -- 07 veraltet ----------------------------------------------------------------------------------------------------
  perform set_booth_review(v_oe, 'orders_fit_size', 'ok');
  update shop_order_line set qty = 5 where order_id = v_ord2;                   -- Warenkorb: zählt nicht
  select x->>'stale' into v_txt from booth_production_summary(v_ed) s, jsonb_array_elements(s.reviews) x where s.org_edition_id = v_oe;
  insert into t_res values ('07a_warenkorb_aendert_nichts', case when v_txt = 'false' then 'ok' else 'FALSCH: ' || v_txt end);
  update shop_order_line set qty = 5 where order_id = v_ord1 and product_sku = 'I-53563';   -- bestätigte Bestellung
  select x->>'stale' into v_txt from booth_production_summary(v_ed) s, jsonb_array_elements(s.reviews) x where s.org_edition_id = v_oe;
  insert into t_res values ('07b_bestellung_geaendert', case when v_txt = 'true' then 'ok: veraltet' else 'FALSCH: ' || v_txt end);
  perform set_booth_review(v_oe, 'orders_fit_size', 'ok');
  select x->>'stale' into v_txt from booth_production_summary(v_ed) s, jsonb_array_elements(s.reviews) x where s.org_edition_id = v_oe;
  insert into t_res values ('07c_neu_geprueft', case when v_txt = 'false' then 'ok: wieder gültig' else 'FALSCH: ' || v_txt end);

  -- 08 Audit --------------------------------------------------------------------------------------------------------
  perform set_booth_review(v_oe, 'orders_fit_size', 'problem', 'zu eng');
  select a.before->>'status' || ' → ' || (a.after->>'status') || ' (' || (a.after->>'note') || ')' into v_txt
    from audit_log a where a.action = 'booth.review' and a.object_id = v_oe::text and a.after->>'note' = 'zu eng';
  insert into t_res values ('08_audit', case when v_txt = 'ok → problem (zu eng)' then 'ok: ' || v_txt else 'FALSCH: ' || coalesce(v_txt, '(leer)') end);

  -- 09 Zusammenfassung ----------------------------------------------------------------------------------------------
  select s.booth_number || '|' || trim_scale(s.booth_length_m)::text || 'x' || trim_scale(s.booth_width_m)::text || '|'
         || trim_scale(s.stand_sqm)::text || 'qm|' || s.stand_days::text || 'T|' || s.package_names || '|'
         || jsonb_array_length(s.reviews)::text into v_txt
    from booth_production_summary(v_ed) s where s.org_edition_id = v_oe;
  insert into t_res values ('09_zusammenfassung',
    case when v_txt like 'ZZTEST-PL1|2x2|4qm|2T|%Intro%|%' and v_txt not like '%|0' then 'ok: ' || v_txt else 'FALSCH: ' || coalesce(v_txt, '(leer)') end);

  -- 10 Ausnahme aus der Verwaltung gilt in der Datenbank ------------------------------------------------------------
  insert into admin_section_override (section, person_id, allowed, note) values ('productionBooths', v_pid, false, 'ZZTEST');
  v_s := left(pg_temp.versuch(format('select * from booth_checklist(%L, null)', v_ed)), 5) || ' '
      || left(pg_temp.versuch(format('select * from supplier_order_list(%L, null)', v_ed)), 7);
  insert into t_res values ('10a_staende_zu', case when v_s = '42501 ALLOWED' then 'ok: Stände zu, Lieferantenliste offen' else 'FALSCH: ' || v_s end);
  delete from admin_section_override;
  insert into admin_section_override (section, person_id, allowed, note) values ('productionOrders', v_pid, false, 'ZZTEST');
  v_s := left(pg_temp.versuch(format('select * from booth_checklist(%L, null)', v_ed)), 7) || ' '
      || left(pg_temp.versuch(format('select * from supplier_order_list(%L, null)', v_ed)), 5);
  insert into t_res values ('10b_bestellungen_zu', case when v_s = 'ALLOWED 42501' then 'ok: Bestellungen zu, Stände offen' else 'FALSCH: ' || v_s end);
  delete from admin_section_override;

  -- 11 Grants -------------------------------------------------------------------------------------------------------
  insert into t_res values ('11a_grants_oeffentlich',
    case when has_function_privilege('authenticated', 'booth_checklist(uuid,uuid)', 'execute')
              and has_function_privilege('authenticated', 'supplier_order_list(uuid,text)', 'execute')
              and has_function_privilege('authenticated', 'set_booth_service_check(uuid,text,boolean,text)', 'execute')
              and has_function_privilege('authenticated', 'set_booth_review(uuid,text,text,text)', 'execute')
              and has_function_privilege('authenticated', 'booth_production_summary(uuid)', 'execute')
         then 'ok: fünf für authenticated' else 'FEHLT' end);
  insert into t_res values ('11b_grants_intern',
    case when not has_function_privilege('authenticated', 'booth_production_lines(uuid,uuid)', 'execute')
              and not has_function_privilege('authenticated', 'booth_basis_hash(uuid,uuid)', 'execute')
              and not has_function_privilege('anon', 'booth_production_lines(uuid,uuid)', 'execute')
              and not has_function_privilege('anon', 'booth_basis_hash(uuid,uuid)', 'execute')
         then 'ok: intern, für Clients nicht aufrufbar' else 'OFFEN (BUG)' end);
  insert into t_res values ('11c_anon',
    case when not has_function_privilege('anon', 'booth_checklist(uuid,uuid)', 'execute')
              and not has_function_privilege('anon', 'supplier_order_list(uuid,text)', 'execute')
              and not has_function_privilege('anon', 'set_booth_service_check(uuid,text,boolean,text)', 'execute')
              and not has_function_privilege('anon', 'set_booth_review(uuid,text,text,text)', 'execute')
              and not has_function_privilege('anon', 'booth_production_summary(uuid)', 'execute')
         then 'ok: anon ohne EXECUTE' else 'OFFEN (BUG)' end);
  select count(*) into v_n from information_schema.role_table_grants
   where table_name = 'booth_review' and grantee in ('anon', 'authenticated');
  insert into t_res values ('11d_tabelle',
    case when v_n = 0 and (select relrowsecurity from pg_class where oid = 'booth_review'::regclass)
         then 'ok: keine Grants, RLS an' else 'FALSCH (' || v_n || ' Grants)' end);

  -- 12 SECURITY DEFINER mit festem search_path ---------------------------------------------------------------------
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('booth_production_lines', 'booth_basis_hash', 'booth_checklist', 'supplier_order_list',
                       'set_booth_service_check', 'set_booth_review', 'booth_production_summary')
     and p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%');
  insert into t_res values ('12_definer', case when v_n = 7 then 'ok: sieben Funktionen, search_path fest' else 'FALSCH (' || v_n || ' von 7)' end);

  -- 13 Vokabular ----------------------------------------------------------------------------------------------------
  insert into t_res values ('13_vokabular',
    case when exists (select 1 from vocab_term t where t.vocabulary = 'booth_review_item' and t.key = 'orders_fit_size'
                         and t.active and t.label_de = 'Bestellungen passen zur Standgröße' and t.label_en = 'Orders fit the booth size')
              and exists (select 1 from vocab_binding b where b.vocabulary = 'booth_review_item'
                             and b.table_name = 'booth_review' and b.column_name = 'item_key')
         then 'ok: Begriff DE/EN und vocab_binding' else 'FEHLT' end);
end $$;

select * from t_res order by step;
rollback;
