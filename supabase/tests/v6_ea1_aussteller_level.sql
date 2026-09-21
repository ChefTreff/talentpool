-- Smoke-Test 0135 (EA1 · Aussteller: Level und Kategorie aus den Produkten). Belegt:
--   01 erfundenes Level am Produkt ⇒ 22023 `invalid_sponsoring_level`;
--   02 Level setzen, und leerer Text nimmt es wieder weg (wie beim Formatschluessel) —
--      ohne das liesse sich eine falsche Zuordnung ueber die Oberflaeche nie loesen;
--   03 die Startbelegung sitzt: die zwoelf eindeutigen Produkte tragen ihr Level,
--      „Standbuehne (18qm)" bewusst **nicht** (Frage an Konrad, kein Ratespiel);
--   04 ein gebuchtes Paket setzt das Level, Quelle `product`;
--   05 **das beste Level gewinnt**: der Premium-Aufpreis schlaegt das General-Paket —
--      genau darum leiten wir ab, statt einen Freitext zu glauben;
--   06 eine stornierte Zeile (`status = 'cancelled'`) zaehlt nicht mit;
--   07 die Kategorien nennen die gebuchten **Pakete** in Vokabular-Reihenfolge;
--   08 ein Shop-Artikel aendert die Kategorien nicht — ein Barhocker macht niemanden
--      zum Hackathon-Partner;
--   09 ohne gebuchtes Produkt faellt die Ableitung auf den HubSpot-Freitext zurueck,
--      Quelle `hubspot`; die alten Spalten bleiben daneben unveraendert;
--   10 ohne beides: Level null, Quelle null, Kategorien **leeres Array statt null**;
--   11 `event_app_exhibitors` bleibt ohne Partner-Team zu (42501) und liest im
--      Servicekontext weiter (der naechtliche Lauf haengt daran, Lehre aus 0120);
--   12 der Verzeichniseintrag aus 0130 steht: die Vokabularpflege zaehlt das Produkt
--      jetzt mit und verweigert das Loeschen eines benutzten Levels (`in_use`).
-- Der Test legt sich eigene Organisationen an und rollt zurueck.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid;
  v_org_a uuid; v_oe_a uuid; v_org_b uuid; v_oe_b uuid; v_org_c uuid; v_oe_c uuid;
  v_n integer; v_txt text; v_cats text[];
begin
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 11a ohne Recht ist die Ausstellerliste zu ---------------------------------
  begin
    perform event_app_exhibitors(v_ed);
    insert into t_res values ('11a_liste_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('11a_liste_ohne_recht', 'abgewiesen ' || sqlstate); end;

  insert into role_assignment (person_id, role, scope_type, valid_from)
  values (v_pid, 'area_lead_partner', 'global', now() - interval '1 hour');

  -- 01 erfundenes Level -------------------------------------------------------
  begin
    perform upsert_product(jsonb_build_object('sku', 'I-50131', 'sponsoring_level_key', 'platin'));
    insert into t_res values ('01_erfundenes_level', 'ANGENOMMEN (BUG)');
  exception when others then
    insert into t_res values ('01_erfundenes_level', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 02 setzen und wieder leeren ------------------------------------------------
  perform upsert_product(jsonb_build_object('sku', 'I-50131', 'sponsoring_level_key', 'intro'));
  select sponsoring_level_key into v_txt from product where sku = 'I-50131';
  insert into t_res values ('02a_gesetzt', coalesce(v_txt, '(null)'));
  perform upsert_product(jsonb_build_object('sku', 'I-50131', 'sponsoring_level_key', ''));
  select sponsoring_level_key into v_txt from product where sku = 'I-50131';
  insert into t_res values ('02b_geleert', coalesce(v_txt, '(null)'));
  perform upsert_product(jsonb_build_object('sku', 'I-50131', 'sponsoring_level_key', 'general'));

  -- 03 Startbelegung -----------------------------------------------------------
  select count(*) into v_n from product where sponsoring_level_key is not null;
  insert into t_res values ('03a_mit_level', v_n::text || ' Produkte');
  select string_agg(sku || '=' || sponsoring_level_key, ', ' order by sku) into v_txt
    from product where sponsoring_level_key is not null;
  insert into t_res values ('03b_belegung', v_txt);
  select coalesce(sponsoring_level_key, '(null)') into v_txt from product where sku = 'I-79895';
  insert into t_res values ('03c_standbuehne_offen', v_txt);

  -- Testdaten: drei Organisationen ---------------------------------------------
  insert into organization (legal_name, communication_name, type, slug)
  values ('ZZTEST Level A GmbH', 'ZZTEST Level A', 'corporate', 'zztest-level-a') returning id into v_org_a;
  insert into org_edition (org_id, edition_id) values (v_org_a, v_ed) returning id into v_oe_a;
  insert into organization (legal_name, type, slug)
  values ('ZZTEST Level B GmbH', 'corporate', 'zztest-level-b') returning id into v_org_b;
  insert into org_edition (org_id, edition_id, sponsoring_level)
  values (v_org_b, v_ed, 'Premium') returning id into v_oe_b;
  insert into organization (legal_name, type, slug)
  values ('ZZTEST Level C GmbH', 'corporate', 'zztest-level-c') returning id into v_org_c;
  insert into org_edition (org_id, edition_id) values (v_org_c, v_ed) returning id into v_oe_c;

  -- 04 ein gebuchtes Paket -------------------------------------------------------
  insert into org_product (org_edition_id, product_sku, qty, status)
  values (v_oe_a, 'I-50131', 1, 'booked');
  select x.level_key || '/' || coalesce(x.level_rank::text, '-') || '/' || coalesce(x.level_source, '-')
    into v_txt from event_app_exhibitors(v_ed) x where x.org_id = v_org_a;
  insert into t_res values ('04_paket_setzt_level', v_txt);

  -- 05 bestes Level gewinnt -------------------------------------------------------
  insert into org_product (org_edition_id, product_sku, qty, status)
  values (v_oe_a, 'I-69384', 1, 'booked');
  select x.level_key || '/' || x.level_rank::text into v_txt
    from event_app_exhibitors(v_ed) x where x.org_id = v_org_a;
  insert into t_res values ('05_bestes_gewinnt', v_txt);

  -- 06 eine stornierte Zeile zaehlt nicht ---------------------------------------------
  insert into org_product (org_edition_id, product_sku, qty, status)
  values (v_oe_c, 'I-79031', 1, 'cancelled');
  select coalesce(x.level_key, '(null)') || '/' || coalesce(x.level_source, '(null)') into v_txt
    from event_app_exhibitors(v_ed) x where x.org_id = v_org_c;
  insert into t_res values ('06_storniert_zaehlt_nicht', v_txt);

  -- 07 Kategorien in Vokabular-Reihenfolge -------------------------------------------
  insert into org_product (org_edition_id, product_sku, qty, status)
  values (v_oe_a, 'I-10729', 1, 'booked');
  select x.categories into v_cats from event_app_exhibitors(v_ed) x where x.org_id = v_org_a;
  insert into t_res values ('07_kategorien', array_to_string(v_cats, ', '));

  -- 08 Shop-Artikel zaehlt nicht -------------------------------------------------------
  insert into org_product (org_edition_id, product_sku, qty, status)
  values (v_oe_a, 'I-11329', 2, 'booked');
  select x.categories into v_cats from event_app_exhibitors(v_ed) x where x.org_id = v_org_a;
  insert into t_res values ('08_shop_artikel_aussen', array_to_string(v_cats, ', '));

  -- 09 Rueckfall auf den Freitext ---------------------------------------------------
  select coalesce(x.level_key, '(null)') || '/' || coalesce(x.level_source, '(null)')
         || ' | alt: ' || coalesce(x.sponsoring_level, '-') || '/' || coalesce(x.sponsoring_key, '-')
    into v_txt from event_app_exhibitors(v_ed) x where x.org_id = v_org_b;
  insert into t_res values ('09_rueckfall_hubspot', v_txt);

  -- 10 weder noch -------------------------------------------------------------------
  select coalesce(x.level_key, '(null)') || '/' || coalesce(x.level_source, '(null)')
         || ' | cats=' || case when x.categories is null then 'NULL (BUG)' else '{' || array_to_string(x.categories, ',') || '}' end
    into v_txt from event_app_exhibitors(v_ed) x where x.org_id = v_org_c;
  insert into t_res values ('10_ohne_alles', v_txt);

  -- 12 Verzeichniseintrag der Vokabularpflege --------------------------------------
  select count(*) into v_n from vocab_binding
   where vocabulary = 'sponsoring_level' and table_name = 'product' and column_name = 'sponsoring_level_key';
  insert into t_res values ('12a_binding', v_n::text || ' Eintrag');
  select coalesce(vocab_term_usage('sponsoring_level', 'general')::text, 'NULL') into v_txt;
  insert into t_res values ('12b_verwendung_general', v_txt);
end $$;

-- 11b Servicekontext: der naechtliche Lauf liest ohne Anmeldung ------------------
do $$
declare v_n integer;
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  select count(*) into v_n from event_app_exhibitors(null);
  insert into t_res values ('11b_liste_servicekontext', v_n::text || ' Zeilen');
exception when others then
  insert into t_res values ('11b_liste_servicekontext', 'FEHLER ' || sqlstate || ' ' || sqlerrm);
end $$;

select * from t_res order by step;
rollback;

-- Lauf 21.09.2026 gegen jqmqvgaiyjudkvtncijw (Probelauf, zurueckgerollt): 17/17 gruen.
--   01 abgewiesen 22023 invalid_sponsoring_level; 02a intro, 02b (null);
--   03a 12 Produkte, 03c Standbuehne (null); 04 general/50/product; 05 premium/40;
--   06 (null)/(null); 07 und 08 'standflaeche, hackathon'; 09 premium/hubspot bei
--   unveraendertem 'Premium/premium' daneben; 10 (null)/(null) mit cats={};
--   11a abgewiesen 42501, 11b 6 Zeilen; 12a 1 Eintrag, 12b Verwendung 3.
