-- Smoke-Test 0139 (Sponsoren-Kategorien fuer die Logo-Wand). Belegt:
--   01 die sieben Kategorien des 27er-Events stehen im Vokabular;
--   02 Konrads Zuordnung sitzt, Stufe fuer Stufe;
--   03 **niemand rutscht durch**: wer nur eine Masterclass gebucht hat und damit
--      keine Stufe traegt, bekommt `official_partner` statt null — das ist der
--      ganze Punkt der Uebung;
--   04 dasselbe fuer einen Partner ganz ohne gebuchte Produkte;
--   05 eine gebuchte Standflaeche bestimmt die Kategorie (General ⇒ Official);
--   06 das **beste** Level bestimmt sie: Premium-Aufpreis auf General ⇒ Premium;
--   07 Signature ⇒ Presenting, Start-Up ⇒ Startup, Gemeinschaftsstand ⇒ Official;
--   08 `main_stage_loge` ist bewusst **nicht** zugeordnet und faellt ins Netz;
--   09 eine deaktivierte Kategorie faellt ebenfalls ins Netz, statt eine tote
--      Auswahl zu liefern;
--   10 die Zuordnung laesst sich ueber die Vokabularpflege aendern (0130), ohne
--      Migration — sonst muesste Konrad fuer jede Umbenennung hierher kommen;
--   11 die 28 Ausgabespalten aus 0138 sind alle noch da (Lehre aus 0099);
--   12 Aussteller- und Sponsorenreferenz stehen **nebeneinander** — vor 0139 schrieb
--      `set_event_app_ref` immer `exhibitor` und ein Sponsorenlauf haette die
--      Standreferenz derselben Teilnahme ueberschrieben; erfundene Art 22023.
-- Der Test legt sich eigene Organisationen an und rollt zurueck.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid;
  v_n integer; v_txt text;
  v_org_a uuid; v_oe_a uuid; v_org_b uuid; v_oe_b uuid; v_org_c uuid; v_oe_c uuid;
begin
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  -- Partner-Team liest die Ausstellerliste, Admin pflegt das Vokabular (Schritt 10).
  insert into role_assignment (person_id, role, scope_type, valid_from)
  values (v_pid, 'area_lead_partner', 'global', now() - interval '1 hour'),
         (v_pid, 'admin', 'global', now() - interval '1 hour');
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01/02 Vokabular und Zuordnung ------------------------------------------------
  select count(*) into v_n from vocab_term where vocabulary = 'swapcard_sponsor_category' and active;
  insert into t_res values ('01_kategorien', v_n::text);
  select string_agg(l.key || '→' || coalesce(l.parent_key, '(offen)'), ', ' order by l.sort_order)
    into v_txt from vocab_term l where l.vocabulary = 'sponsoring_level';
  insert into t_res values ('02_zuordnung', v_txt);

  -- Testdaten ---------------------------------------------------------------------
  insert into organization (legal_name, communication_name, type, slug)
  values ('ZZTEST Sponsor A GmbH', 'ZZTEST Sponsor A', 'corporate', 'zztest-sponsor-a') returning id into v_org_a;
  insert into org_edition (org_id, edition_id) values (v_org_a, v_ed) returning id into v_oe_a;
  insert into organization (legal_name, type, slug)
  values ('ZZTEST Sponsor B GmbH', 'corporate', 'zztest-sponsor-b') returning id into v_org_b;
  insert into org_edition (org_id, edition_id) values (v_org_b, v_ed) returning id into v_oe_b;
  insert into organization (legal_name, type, slug)
  values ('ZZTEST Sponsor C GmbH', 'corporate', 'zztest-sponsor-c') returning id into v_org_c;
  insert into org_edition (org_id, edition_id) values (v_org_c, v_ed) returning id into v_oe_c;

  -- 03 nur eine Masterclass, keine Standflaeche --------------------------------------
  insert into org_product (org_edition_id, product_sku, qty, status)
  values (v_oe_a, 'I-33783', 1, 'booked');
  select coalesce(x.level_key, '(kein Level)') || ' ⇒ ' || coalesce(x.sponsor_category, 'NULL (BUG)')
    into v_txt from event_app_exhibitors(v_ed) x where x.org_id = v_org_a;
  insert into t_res values ('03_nur_masterclass', v_txt);

  -- 04 gar nichts gebucht ---------------------------------------------------------------
  select coalesce(x.level_key, '(kein Level)') || ' ⇒ ' || coalesce(x.sponsor_category, 'NULL (BUG)')
    into v_txt from event_app_exhibitors(v_ed) x where x.org_id = v_org_b;
  insert into t_res values ('04_ohne_produkte', v_txt);

  -- 05/06 Standflaeche und bestes Level ---------------------------------------------------
  insert into org_product (org_edition_id, product_sku, qty, status)
  values (v_oe_c, 'I-50131', 1, 'booked');
  select x.level_key || ' ⇒ ' || x.sponsor_category into v_txt
    from event_app_exhibitors(v_ed) x where x.org_id = v_org_c;
  insert into t_res values ('05_general', v_txt);
  insert into org_product (org_edition_id, product_sku, qty, status)
  values (v_oe_c, 'I-69384', 1, 'booked');
  select x.level_key || ' ⇒ ' || x.sponsor_category into v_txt
    from event_app_exhibitors(v_ed) x where x.org_id = v_org_c;
  insert into t_res values ('06_bestes_level', v_txt);

  -- 07 die uebrigen Stufen ------------------------------------------------------------------
  delete from org_product where org_edition_id = v_oe_c;
  insert into org_product (org_edition_id, product_sku, qty, status) values (v_oe_c, 'I-91411', 1, 'booked');
  select x.level_key || '⇒' || x.sponsor_category into v_txt from event_app_exhibitors(v_ed) x where x.org_id = v_org_c;
  insert into t_res values ('07a_signature', v_txt);
  delete from org_product where org_edition_id = v_oe_c;
  insert into org_product (org_edition_id, product_sku, qty, status) values (v_oe_c, 'I-65476', 1, 'booked');
  select x.level_key || '⇒' || x.sponsor_category into v_txt from event_app_exhibitors(v_ed) x where x.org_id = v_org_c;
  insert into t_res values ('07b_startup', v_txt);
  delete from org_product where org_edition_id = v_oe_c;
  insert into org_product (org_edition_id, product_sku, qty, status) values (v_oe_c, 'INI-STAND-2T', 1, 'booked');
  select x.level_key || '⇒' || x.sponsor_category into v_txt from event_app_exhibitors(v_ed) x where x.org_id = v_org_c;
  insert into t_res values ('07c_gemeinschaft', v_txt);

  -- 08 main_stage_loge ist offen und faellt ins Netz --------------------------------------------
  update org_edition set sponsoring_level = 'Main Stage Loge' where id = v_oe_b;
  select coalesce(x.level_key, '-') || ' ⇒ ' || coalesce(x.sponsor_category, 'NULL (BUG)') into v_txt
    from event_app_exhibitors(v_ed) x where x.org_id = v_org_b;
  insert into t_res values ('08_main_stage_loge', v_txt);
  update org_edition set sponsoring_level = null where id = v_oe_b;

  -- 09 deaktivierte Kategorie -------------------------------------------------------------------
  update vocab_term set active = false where vocabulary = 'swapcard_sponsor_category' and key = 'startup_partner';
  delete from org_product where org_edition_id = v_oe_c;
  insert into org_product (org_edition_id, product_sku, qty, status) values (v_oe_c, 'I-65476', 1, 'booked');
  select x.level_key || '⇒' || x.sponsor_category into v_txt from event_app_exhibitors(v_ed) x where x.org_id = v_org_c;
  insert into t_res values ('09_kategorie_deaktiviert', v_txt);
  update vocab_term set active = true where vocabulary = 'swapcard_sponsor_category' and key = 'startup_partner';

  -- 10 ueber die Vokabularpflege aenderbar -----------------------------------------------------
  perform upsert_vocab_term(jsonb_build_object(
    'vocabulary', 'sponsoring_level', 'key', 'start_up', 'label_de', 'Start-Up', 'label_en', 'Start-up',
    'sort_order', 70, 'active', true,
    'parent_vocabulary', 'swapcard_sponsor_category', 'parent_key', 'family_partner'));
  select x.level_key || '⇒' || x.sponsor_category into v_txt from event_app_exhibitors(v_ed) x where x.org_id = v_org_c;
  insert into t_res values ('10_umgehaengt', v_txt);

  -- 12 Fremdschluessel: Aussteller und Logo-Wand nebeneinander -------------------
  -- Vor 0139 schrieb `set_event_app_ref` immer `object_type = 'exhibitor'`; ein
  -- Sponsorenlauf haette die Standreferenz derselben Teilnahme ueberschrieben.
  perform set_event_app_ref(v_oe_a, 'swapcard', 'ZZTEST-EXH-1');
  perform set_event_app_ref(v_oe_a, 'swapcard', 'ZZTEST-SPO-1', null, 'sponsor');
  select string_agg(r.object_type || '=' || r.external_id, ', ' order by r.object_type) into v_txt
    from external_ref r where r.system = 'swapcard' and r.object_id = v_oe_a;
  insert into t_res values ('12a_beide_refs', v_txt);
  begin
    perform set_event_app_ref(v_oe_a, 'swapcard', 'ZZTEST-X', null, 'planning');
    insert into t_res values ('12b_erfundene_art', 'ANGENOMMEN (BUG)');
  exception when others then
    insert into t_res values ('12b_erfundene_art', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 11 alte Ausgabespalten ----------------------------------------------------------------------
  select count(*) into v_n from pg_proc p, unnest(p.proargnames) as spalte
   where p.proname = 'event_app_exhibitors' and p.pronargs = 1
     and spalte in ('org_edition_id','org_id','edition_id','edition_slug','swapcard_event_id','name','legal_name','slug',
                    'description_de','description_en','website','sponsoring_level','sponsoring_key','sponsoring_rank',
                    'level_key','level_rank','level_source','categories','industry','partner_category','org_type',
                    'booth_number','onboarding_status','logo_svg_path','logo_png_path','logo_png_asset_id',
                    'swapcard_exhibitor_id','members');
  insert into t_res values ('11_alte_spalten', v_n::text || ' von 28');
end $$;

select * from t_res order by step;
rollback;

-- Lauf 21.09.2026 gegen jqmqvgaiyjudkvtncijw (Probelauf, zurueckgerollt): 15/15 gruen.
--   01 sieben Kategorien; 02 Zuordnung wie von Konrad, main_stage_loge offen;
--   03 und 04 '(kein Level) ⇒ official_partner'; 05 general ⇒ official_partner;
--   06 premium ⇒ premium_partner; 07a signature⇒presenting, 07b start_up⇒startup,
--   07c gemeinschaftsstand⇒official; 08 main_stage_loge ⇒ official_partner;
--   09 deaktivierte Kategorie ⇒ official_partner; 10 umgehaengt ⇒ family_partner;
--   11 28 von 28 Spalten; 12a 'exhibitor=…, sponsor=…', 12b abgewiesen 22023.
