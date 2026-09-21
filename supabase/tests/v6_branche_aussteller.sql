-- Smoke-Test 0138 (Branche des Ausstellers). Belegt:
--   01 ohne Pflegerecht 42501 (die Branche haengt an den Stammdaten, nicht daneben);
--   02 erfundene Branche ⇒ 22023 `invalid_industry`;
--   03 setzen, und leerer Text nimmt sie wieder weg — sonst liesse sich eine
--      falsche Angabe ueber die Oberflaeche nie wieder entfernen;
--   04 eine Namenskorrektur ohne `industry` laesst die Branche stehen
--      (Feld nicht mitgeschickt heisst „nicht anfassen", Lehre aus 0114);
--   05 `event_app_exhibitors` gibt die Branche mit;
--   06 **ein deaktivierter Begriff geht nicht mehr hinaus**: in der Spalte bleibt er
--      stehen, die Ausstellerliste liefert null — Swapcard behaelt dann, was dort
--      steht, statt eine tote Auswahl zu bekommen;
--   07 die vierzehn Schluessel des Swapcard-Feldes stehen im Vokabular;
--   08 die Ausgabespalten aus 0135 sind alle noch da (Lehre aus 0099);
--   09 der Verzeichniseintrag steht, die Vokabularpflege zaehlt die Organisation mit
--      und verweigert damit das Loeschen einer benutzten Branche;
--   10 `partner_overview` gibt die Branche mit — ohne das stuende sie in der
--      Datenbank, die Maske bekaeme sie aber nie zu sehen.
-- Der Test legt sich eine eigene Organisation an und rollt zurueck.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid;
  v_org uuid; v_oe uuid; v_n integer; v_txt text;
begin
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  insert into organization (legal_name, communication_name, type, slug)
  values ('ZZTEST Branche GmbH', 'ZZTEST Branche', 'corporate', 'zztest-branche') returning id into v_org;
  insert into org_edition (org_id, edition_id) values (v_org, v_ed) returning id into v_oe;

  -- 01 ohne Recht ---------------------------------------------------------------
  begin
    perform update_partner_onboarding(v_org, jsonb_build_object('industry', 'tech-and-it'), v_ed);
    insert into t_res values ('01_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01_ohne_recht', 'abgewiesen ' || sqlstate); end;

  insert into role_assignment (person_id, role, scope_type, valid_from)
  values (v_pid, 'area_lead_partner', 'global', now() - interval '1 hour');

  -- 02 erfundene Branche ----------------------------------------------------------
  begin
    perform update_partner_onboarding(v_org, jsonb_build_object('industry', 'raumfahrt'), v_ed);
    insert into t_res values ('02_erfunden', 'ANGENOMMEN (BUG)');
  exception when others then
    insert into t_res values ('02_erfunden', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 03 setzen und leeren -----------------------------------------------------------
  perform update_partner_onboarding(v_org, jsonb_build_object('industry', 'tech-and-it'), v_ed);
  select coalesce(o.industry, '(null)') into v_txt from organization o where o.id = v_org;
  insert into t_res values ('03a_gesetzt', v_txt);
  perform update_partner_onboarding(v_org, jsonb_build_object('industry', ''), v_ed);
  select coalesce(o.industry, '(null)') into v_txt from organization o where o.id = v_org;
  insert into t_res values ('03b_geleert', v_txt);
  perform update_partner_onboarding(v_org, jsonb_build_object('industry', 'banking-and-finance'), v_ed);

  -- 04 Feld nicht mitgeschickt ------------------------------------------------------
  perform update_partner_onboarding(v_org, jsonb_build_object('communication_name', 'ZZTEST Branche neu'), v_ed);
  select coalesce(o.industry, '(null)') into v_txt from organization o where o.id = v_org;
  insert into t_res values ('04_unberuehrt', v_txt);

  -- 05 in der Ausstellerliste --------------------------------------------------------
  select coalesce(x.industry, '(null)') into v_txt from event_app_exhibitors(v_ed) x where x.org_id = v_org;
  insert into t_res values ('05_in_der_liste', v_txt);

  -- 06 deaktivierter Begriff ------------------------------------------------------------
  update vocab_term set active = false where vocabulary = 'industry' and key = 'banking-and-finance';
  select coalesce(x.industry, '(null)') into v_txt from event_app_exhibitors(v_ed) x where x.org_id = v_org;
  insert into t_res values ('06a_liste_nach_deaktivierung', v_txt);
  select coalesce(o.industry, '(null)') into v_txt from organization o where o.id = v_org;
  insert into t_res values ('06b_spalte_bleibt', v_txt);
  update vocab_term set active = true where vocabulary = 'industry' and key = 'banking-and-finance';

  -- 07 Vokabular vollstaendig ------------------------------------------------------------
  select count(*) into v_n from vocab_term v where v.vocabulary = 'industry' and v.active;
  insert into t_res values ('07a_anzahl', v_n::text || ' Branchen');
  select count(*) into v_n from (values
    ('tech-and-it'),('consulting'),('banking-and-finance'),('industrie'),('logistics'),('fmcg'),('e-commerce'),
    ('marketing-and-advertising'),('b2b-services'),('energy-and-sustainability'),('health'),
    ('deep-tech-and-science'),('education'),('accelerator')) as s(key)
   where not exists (select 1 from vocab_term v where v.vocabulary = 'industry' and v.key = s.key);
  insert into t_res values ('07b_fehlende_swapcard_schluessel', v_n::text);

  -- 08 alte Ausgabespalten -----------------------------------------------------------------
  select count(*) into v_n
    from pg_proc p, unnest(p.proargnames) as spalte
   where p.proname = 'event_app_exhibitors' and p.pronargs = 1
     and spalte in ('org_edition_id','org_id','edition_id','edition_slug','swapcard_event_id','name','legal_name','slug',
                    'description_de','description_en','website','sponsoring_level','sponsoring_key','sponsoring_rank',
                    'level_key','level_rank','level_source','categories','partner_category','org_type','booth_number',
                    'onboarding_status','logo_svg_path','logo_png_path','logo_png_asset_id','swapcard_exhibitor_id','members');
  insert into t_res values ('08_alte_spalten', v_n::text || ' von 27');

  -- 10 die Maske sieht die Branche ----------------------------------------------
  select coalesce(partner_overview(v_org, v_ed)->'org'->>'industry', '(null)') into v_txt;
  insert into t_res values ('10_in_den_stammdaten', v_txt);

  -- 09 Verzeichniseintrag -------------------------------------------------------------------
  select count(*) into v_n from vocab_binding
   where vocabulary = 'industry' and table_name = 'organization' and column_name = 'industry';
  insert into t_res values ('09a_binding', v_n::text || ' Eintrag');
  select coalesce(vocab_term_usage('industry', 'banking-and-finance')::text, 'NULL') into v_txt;
  insert into t_res values ('09b_verwendung', v_txt);
end $$;

select * from t_res order by step;
rollback;

-- Lauf 21.09.2026 gegen jqmqvgaiyjudkvtncijw (Probelauf, zurueckgerollt): 14/14 gruen.
--   01 abgewiesen 42501; 02 abgewiesen 22023 invalid_industry;
--   03a 'tech-and-it', 03b (null); 04 'banking-and-finance' (unberuehrt);
--   05 'banking-and-finance'; 06a (null) nach dem Deaktivieren, 06b Spalte steht noch;
--   07a 14 Branchen, 07b 0 fehlende Swapcard-Schluessel; 08 27 von 27 Spalten;
--   09a 1 Eintrag, 09b Verwendung 1; 10 'banking-and-finance' in den Stammdaten.
