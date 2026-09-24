-- Smoke-Test (Eure Daten, PART-059/061). Nummer offen. Belegt:
--   01 der Partner speichert den Adresszusatz, `partner_overview` liefert ihn (`org.address.extra`);
--   02 schickt der Partner eine Kundennummer mit, bleibt sie leer — `update_partner_onboarding`
--      schreibt sie nicht (Vorbedingung: vorher leer, sonst belegte „unverändert" nichts);
--   03 `set_org_customer_number` als Partner ⇒ 42501;
--   04 das Team setzt sie, der Partner sieht sie in `partner_overview`, das Audit hält alt und neu;
--   05 derselbe Wert noch einmal schreibt kein zweites Audit; 06 leer löscht sie;
--   07 mehr als 40 Zeichen ⇒ 22023 `too_long`; 08 dieselbe Nummer an einer zweiten Organisation ⇒
--      P0001 `customer_number_taken`;
--   09 `shop_invoice_candidates` behält die alten Spalten in Reihenfolge (drop + create) und liefert
--      den Adresszusatz einer Organisation mit abgeschlossener Bestellung;
--   10 `anon` darf `set_org_customer_number` nicht.
-- Probelauf Bau-Chat 24.09.2026 auf main 258ad6b (`sh scripts/db.sh dry-run`, fn-diff ohne
-- unerklärte Zeile): **10/10 grün**, zurückgerollt.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_org2 uuid; v_oe uuid; v_ord uuid;
  v_n integer; v_txt text; v_txt2 text; v_j jsonb; v_sku text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  insert into organization (legal_name) values ('ZZ Eure Daten GmbH') returning id into v_org;
  insert into organization (legal_name) values ('ZZ Zweite Daten GmbH') returning id into v_org2;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}', 'Geschäftsführung');
  delete from role_assignment where person_id = v_pid and role = 'admin';

  -- 01 Adresszusatz (als Hauptkontakt)
  perform update_partner_onboarding(v_org, jsonb_build_object('address_street', 'Weg 1', 'address_extra', '  3. OG, Haus B  '), v_ed);
  select address_extra into v_txt from organization where id = v_org;
  v_j := partner_overview(v_org, v_ed);
  insert into t_res values ('01_adresszusatz',
    case when v_txt = '3. OG, Haus B' and v_j->'org'->'address'->>'extra' = '3. OG, Haus B'
              and v_j->'org'->'address'->>'street' = 'Weg 1'
         then 'gespeichert (getrimmt) und in der Übersicht (richtig)'
         else 'unerwartet: ' || coalesce(v_txt, 'null') || ' / ' || coalesce(v_j->'org'->'address'->>'extra', 'null') end);

  -- 02 Kundennummer über die Partner-Speicherung: bleibt leer
  select customer_number into v_txt from organization where id = v_org;
  perform update_partner_onboarding(v_org, jsonb_build_object('customer_number', 'SELBST-1'), v_ed);
  insert into t_res values ('02_partner_schreibt_keine_nummer',
    case when v_txt is not null then 'VORBEDINGUNG: Nummer war schon gesetzt — Schritt belegt nichts'
         when (select customer_number from organization where id = v_org) is null then 'bleibt leer (richtig)'
         else 'ALLOWED (BUG): Partner hat die Kundennummer gesetzt' end);

  -- 03 Setzen als Partner
  begin
    perform set_org_customer_number(v_org, 'K-1');
    insert into t_res values ('03_partner_setzt_nicht', 'ALLOWED (BUG)');
  exception
    when sqlstate '42501' then insert into t_res values ('03_partner_setzt_nicht', '42501 (richtig)');
    when others then insert into t_res values ('03_partner_setzt_nicht', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 04 Das Team setzt, der Partner sieht
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  perform set_org_customer_number(v_org, ' K-1234 ');
  delete from role_assignment where person_id = v_pid and role = 'admin';
  v_j := partner_overview(v_org, v_ed);
  select count(*)::integer into v_n from audit_log
   where action = 'partner.customer_number' and object_id = v_org::text
     and before->>'customer_number' is null and after->>'customer_number' = 'K-1234';
  insert into t_res values ('04_team_setzt_partner_sieht',
    case when v_j->'org'->>'customer_number' = 'K-1234' and v_n = 1 then 'gesetzt, sichtbar, Audit alt/neu (richtig)'
         else 'unerwartet: ' || coalesce(v_j->'org'->>'customer_number', 'null') || ', Audit ' || v_n end);

  -- 05 Gleicher Wert: kein zweites Audit · 06 leer löscht
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  perform set_org_customer_number(v_org, 'K-1234');
  select count(*)::integer into v_n from audit_log where action = 'partner.customer_number' and object_id = v_org::text;
  insert into t_res values ('05_gleicher_wert', case when v_n = 1 then 'kein zweites Audit (richtig)' else 'unerwartet: ' || v_n || ' Audits' end);
  perform set_org_customer_number(v_org, '  ');
  insert into t_res values ('06_leer_loescht',
    case when (select customer_number from organization where id = v_org) is null then 'gelöscht (richtig)' else 'unerwartet: noch gesetzt' end);

  -- 07 Zu lang
  begin
    perform set_org_customer_number(v_org, repeat('9', 41));
    insert into t_res values ('07_zu_lang', 'ALLOWED (BUG)');
  exception
    when sqlstate '22023' then insert into t_res values ('07_zu_lang',
      case when sqlerrm = 'too_long' then 'too_long (richtig)' else '22023 ' || sqlerrm end);
    when others then insert into t_res values ('07_zu_lang', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 08 Eindeutig über Organisationen
  perform set_org_customer_number(v_org, 'K-7777');
  begin
    perform set_org_customer_number(v_org2, 'K-7777');
    insert into t_res values ('08_eindeutig', 'ALLOWED (BUG): zwei Firmen, eine Nummer');
  exception
    when sqlstate 'P0001' then insert into t_res values ('08_eindeutig',
      case when sqlerrm = 'customer_number_taken' then 'customer_number_taken (richtig)' else 'P0001 ' || sqlerrm end);
    when others then insert into t_res values ('08_eindeutig', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 09 Rechnungskandidaten: alte Spalten, Adresszusatz als Wert
  v_txt := pg_get_function_result('shop_invoice_candidates(uuid)'::regprocedure);
  select sku into v_sku from product order by sku limit 1;
  insert into shop_order (org_edition_id, order_no, phase, status) values (v_oe, 'ZZ-EUREDATEN-1', 1, 'completed')
    returning id into v_ord;
  insert into shop_order_line (order_id, product_sku, name_de, qty, price_net_cents, vat_rate)
  values (v_ord, v_sku, 'ZZ Stehtisch', 1, 1000, 19);
  select x.address_extra into v_txt2 from shop_invoice_candidates(v_ed) x where x.org_id = v_org;
  insert into t_res values ('09_rechnungskandidaten',
    case when v_txt like '%invoice_name text, vat_id text, po_number text, sevdesk_contact_id text,%'
              and v_txt like '%gross_cents bigint, address_extra text)'
              and v_txt2 = '3. OG, Haus B'
         then 'alte Spalten unverändert, Adresszusatz am Ende und als Wert (richtig)'
         else 'unerwartet: ' || coalesce(v_txt2, 'null') || ' · ' || v_txt end);
end $$;

insert into t_res
select '10_anon_gesperrt',
       case when has_function_privilege('anon', 'set_org_customer_number(uuid, text)', 'execute')
            then 'ALLOWED (BUG)' else 'gesperrt (richtig)' end;

select * from t_res order by step;
rollback;
