-- Smoke-Test 0110 (product.format_key, Welle 6 B1 / PART-042). Belegt:
--   01 das Vokabular `partner_format` steht mit allen neun Schlüsseln;
--   02 der Seed trifft die Zuordnung, die Konrad am 17.09. bestätigt hat —
--      und zwar an den Stellen, an denen die Kategorie **nicht** genügt hätte:
--      Masterclass, Standbühne und die sechs Talk-Artikel liegen alle in
--      `stage_products`, bekommen aber drei verschiedene Schlüssel;
--   03 Side Event (I-81745) ist zugeordnet, obwohl es in „Specials" liegt;
--   04 `interview_table` hat bewusst kein Produkt — solange der Artikel fehlt,
--      darf die Seite bei niemandem auftauchen;
--   05 Zusatzleistungen der Company Tour (Bus-Branding) bekommen **keinen**
--      Schlüssel: wer sie bucht, kann die neun Tour-Fragen nicht beantworten;
--   06 `partner_overview` gibt `format_key` je gebuchtem Produkt heraus —
--      ohne das müsste die Oberfläche die SKU-Liste doch wieder selbst kennen;
--   06b dieselbe Übersicht liefert die Beschreibung aus der **Organisation**
--      (seit `20260917183022`), nicht mehr aus der Edition — belegt, dass diese
--      Fassung auf dem Live-Stand aufsetzt und nicht auf einer älteren;
--   07 ein Partner **ohne** das Produkt bekommt den Schlüssel auch nicht
--      (die Forderung aus dem Review: die Seite verschwindet);
--   08 `upsert_product` weist einen erfundenen Schlüssel mit `invalid_format`
--      ab statt mit einem nackten Constraint-Fehler;
--   08b/c dieselbe Funktion prüft weiterhin `pass_type` und `grants_role` — die
--      Fassung setzt auf dem Live-Stand auf und hat die beiden nicht verloren
--      (Befund aus dem Review dieses PRs);
--   09 leerer Text löscht die Zuordnung (sonst ließe sie sich über die
--      Oberfläche nie wieder entfernen), und ein Teilupdate ohne das Feld
--      lässt sie stehen;
--   10 Pflege bleibt dem Partner-Team vorbehalten ⇒ 42501;
--   11 `authenticated` liest die neue Spalte (Spalten-Grant), schreibt aber nicht.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_oe uuid;
  v_n integer; v_txt text; v_ov jsonb; v_sku text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 Vokabular
  select count(*)::integer into v_n from vocab_term
   where vocabulary = 'partner_format' and active
     and key in ('booth','masterclass','company_tour','side_event','interview_table','hackathon','branding','talk','stage');
  insert into t_res values ('01_vokabular',
    case when v_n = 9 then '9 Schlüssel (richtig)' else 'unerwartet ' || v_n end);

  -- 02 Dieselbe Kategorie, drei Schlüssel: hier hätte eine Kategorie-Regel versagt.
  select string_agg(distinct coalesce(format_key, 'null'), ',' order by coalesce(format_key, 'null'))
    into v_txt from product where category = 'stage_products' and sku in
    ('I-87007','I-13114','I-21110','I-75747','I-15248','I-21363','I-33783','I-79895');
  insert into t_res values ('02_stage_products_aufgeteilt',
    case when v_txt = 'masterclass,stage,talk' then 'talk/masterclass/stage getrennt (richtig)'
         else 'unerwartet ' || coalesce(v_txt, 'leer') end);

  select count(*)::integer into v_n from product where format_key = 'talk';
  insert into t_res values ('02b_talk_anzahl',
    case when v_n = 6 then '6 Redebeiträge (richtig)' else 'unerwartet ' || v_n end);

  -- 03 Side Event liegt in „Specials" und wäre über die Kategorie nicht zu finden.
  select format_key into v_txt from product where sku = 'I-81745';
  insert into t_res values ('03_side_event',
    case when v_txt = 'side_event' then 'I-81745 zugeordnet (richtig)'
         else 'unerwartet ' || coalesce(v_txt, 'leer') end);

  -- 04 Interview Table hat noch kein Produkt — die Seite darf nirgends auftauchen.
  select count(*)::integer into v_n from product where format_key = 'interview_table';
  insert into t_res values ('04_interview_table_ohne_produkt',
    case when v_n = 0 then 'kein Produkt (richtig, Artikel fehlt noch)' else 'unerwartet ' || v_n end);

  -- 05 Zusatzleistung der Company Tour bleibt ohne Schlüssel.
  select format_key into v_txt from product where sku = 'I-54632';   -- Branding am Bus (Logo außen)
  insert into t_res values ('05_tour_zusatzleistung',
    case when v_txt is null then 'ohne Schlüssel (richtig)' else 'ALLOWED (BUG): ' || v_txt end);
  select count(*)::integer into v_n from product where format_key = 'company_tour';
  insert into t_res values ('05b_tour_spots',
    case when v_n = 6 then '6 Tour-Spots (richtig)' else 'unerwartet ' || v_n end);

  -- Organisation mit genau einem Produkt: der Masterclass.
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into organization (legal_name, communication_name, type)
    values ('ZZ Formatschluessel GmbH', 'ZZFormat', 'corporate') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status)
    values (v_org, v_ed, 'invited') returning id into v_oe;
  insert into org_product (org_edition_id, product_sku, qty, status)
    values (v_oe, 'I-33783', 1, 'booked');
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}');
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';

  -- 06 partner_overview reicht den Schlüssel durch.
  v_ov := partner_overview(v_org, v_ed);
  insert into t_res values ('06_overview_liefert_schluessel',
    case when v_ov #>> '{products,0,format_key}' = 'masterclass' then 'masterclass (richtig)'
         else 'unerwartet ' || coalesce(v_ov #>> '{products,0,format_key}', 'leer') end);

  -- 06b Die Beschreibung kommt aus der Organisation, nicht aus der Edition.
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  update organization set description_de = 'ZZ Beschreibung der Organisation' where id = v_org;
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  v_ov := partner_overview(v_org, v_ed);
  insert into t_res values ('06b_beschreibung_aus_org',
    case when v_ov #>> '{org,description_de}' = 'ZZ Beschreibung der Organisation'
          and v_ov #>> '{edition,description_de}' = 'ZZ Beschreibung der Organisation'
         then 'Org-Beschreibung in beiden Bloecken (richtig)'
         else 'unerwartet ' || coalesce(v_ov #>> '{org,description_de}', 'leer') end);

  -- 07 Was die Org nicht gebucht hat, taucht auch nicht auf — die Seite verschwindet.
  select count(*)::integer into v_n
    from jsonb_array_elements(v_ov->'products') p
   where p->>'format_key' in ('booth','talk','hackathon','branding','company_tour','side_event','stage');
  insert into t_res values ('07_ohne_produkt_keine_seite',
    case when v_n = 0 then 'nur das gebuchte Format (richtig)' else 'ALLOWED (BUG): ' || v_n || ' fremde' end);

  -- 08 Erfundener Schlüssel
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  begin
    perform upsert_product(jsonb_build_object('sku', 'I-33783', 'format_key', 'gibt_es_nicht'));
    insert into t_res values ('08_unbekannter_schluessel', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('08_unbekannter_schluessel', 'abgewiesen ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 08b Die Live-Fassung ist erhalten: pass_type und grants_role gehen nicht verloren.
  begin
    perform upsert_product(jsonb_build_object('sku', 'I-33783', 'pass_type', 'gibt_es_nicht'));
    insert into t_res values ('08b_pass_type_pruefung', 'ERLAUBT (BUG): Pruefung verloren');
  exception when others then
    insert into t_res values ('08b_pass_type_pruefung', 'abgewiesen ' || sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform upsert_product(jsonb_build_object('sku', 'I-33783', 'grants_role', 'gibt_es_nicht'));
    insert into t_res values ('08c_grants_role_pruefung', 'ERLAUBT (BUG): Pruefung verloren');
  exception when others then
    insert into t_res values ('08c_grants_role_pruefung', 'abgewiesen ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 09 Leeren löscht, Teilupdate lässt stehen
  perform upsert_product(jsonb_build_object('sku', 'I-33783', 'format_key', ''));
  select format_key into v_txt from product where sku = 'I-33783';
  insert into t_res values ('09_leeren_loescht',
    case when v_txt is null then 'geleert (richtig)' else 'unerwartet ' || v_txt end);
  perform upsert_product(jsonb_build_object('sku', 'I-33783', 'format_key', 'masterclass'));
  perform upsert_product(jsonb_build_object('sku', 'I-33783', 'name_de', 'Masterclass'));
  select format_key into v_txt from product where sku = 'I-33783';
  insert into t_res values ('09b_teilupdate_laesst_stehen',
    case when v_txt = 'masterclass' then 'bleibt masterclass (richtig)' else 'unerwartet ' || coalesce(v_txt, 'leer') end);

  -- 10 Ohne Team-Rolle keine Pflege
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  begin
    perform upsert_product(jsonb_build_object('sku', 'I-33783', 'format_key', 'talk'));
    insert into t_res values ('10_pflege_ohne_rolle', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('10_pflege_ohne_rolle', 'abgewiesen ' || sqlstate); end;
end $$;

-- 11 Grants: lesen ja, schreiben nein. Der Test läuft als Superuser und übergeht
--    Grants, deshalb wird hier gefragt statt ausprobiert.
insert into t_res
select '11_grant_lesen',
       case when has_column_privilege('authenticated', 'product', 'format_key', 'select')
            then 'authenticated liest (richtig)' else 'FEHLT' end;
insert into t_res
select '11b_grant_schreiben',
       case when has_column_privilege('authenticated', 'product', 'format_key', 'update')
            then 'ALLOWED (BUG): authenticated schreibt' else 'kein Schreibrecht (richtig)' end;

select * from t_res order by step;
rollback;
