-- Smoke-Test v6_shop_angebot (Vorschlag, PART-116): Angebot aus dem Messeshop-Warenkorb — Zustand `quoted`, `shop_quote_begin`, `record_shop_quote`,
-- `shop_quote_abort`, `shop_quote_withdraw`, `shop_quote_info`, `shop_quotes_admin`, Housekeeping, Phasenende, Rechnungslauf. Läuft mit
-- `db.sh dry-run <migration> <test>`. Echter Rollenwechsel (`set local role authenticated` für Partner und Team, `service_role` für die Route); die Ergebnisse
-- legen kleine Helfer in `pg_temp` ab (unter der Rolle darf man nicht in `t_res` schreiben). Jede Abweisung hat ihr Gegenstück (abgewiesen neben erlaubt: Partner mit
-- Bearbeitungsrecht, Team, Leser, fremde Organisation); „0 Treffer“ allein beweist nichts. Erwartung je Schritt als Muster in `t_erw`, `99_auswertung` am Ende.
-- Wegwerfdaten (ZZTEST), alles wird zurückgerollt. `now()` ist in der Transaktion eingefroren: Fristen sind genau `now() + Intervall`.
--   01 Form: Spalten, Status `quoted`, Teilindex, Rechte (nutzbar: begin/withdraw/info/admin; intern: record/abort/housekeeping/hash; service_role darf).
--   02 Festsetzen (A): Warenkorb vorher änderbar, Katalogpreis steigt, dann Preise frisch, Bestand reserviert, Status, Hash, Grundlage, Audit ohne Adresse;
--      Gegenstück: ein Entwurf (F) wird bestellt, sein Preis folgt dem Katalog.
--   03 Abweisungen: fremde Organisation, Leser, ohne Positionen, ohne/blanke Kundennummer, Ausland, Straße fehlt, PLZ blank, Ort leer, schon bestellt,
--      schon Angebot, ohne Anmeldung, falsche Phase, zu wenig Bestand, Merch unvollständig; danach ist nichts verändert.
--   04 Beleg eintragen (service_role): Referenz, Nummer, Kontakt-Id, Gültigkeit +30 Tage, Audit ohne Adresse; Abweisungen (Rolle, Wache, Hash, Summe, Id, zweimal,
--      ohne Angebot).
--   05 Warenkorb gesperrt (Partner und Team); zweiter Entwurf neben dem Angebot nicht möglich (Teilindex), nach Storno schon.
--   06 Auskunft: Partner ohne SevDesk-Id, Leser sieht das Angebot, kann nichts ändern, Team sieht die Id, fremde Organisation 42501; Meine Bestellungen.
--   07 Bestellen aus dem Angebot: Preise des Angebots trotz teurerem Katalog, Reservierung bleibt, Referenz „bestellt“; abgelaufen und „noch im Vorgang“ abgewiesen.
--   08 Zurückziehen (H) und höchstens drei Angebote. 09 Abbrechen (I, service_role). 10 Housekeeping: abgelaufen und hängengeblieben zurück in den Entwurf,
--   frisch und gültig bleiben (auch mit altem Beginn, solange der Beleg da ist). 11 Team-Liste (nur Angebote, Reihenfolge), Team- und Partner-Storno.
--   12 Phasenende und Rechnungslauf. 83 Erwartungen; Mutationsproben: 85 an der Migration (alle rot), 30 am TypeScript-Test `tests/shop-angebot.test.ts`.
begin;
create temp table t_res (step text, result text) on commit drop;
create temp table t_erw (step text, muster text) on commit drop;
create temp table t_ctx (pid uuid, uid uuid, email text, claims text, ed uuid, p integer) on commit drop;
insert into t_erw values
  ('01_form', '^ok spalten=2 status_quoted=true index_quoted=true nutzbar=true intern_gesperrt=true service_darf=true anon_nichts=true$'),
  ('02a_warenkorb_vorher_aenderbar', '^ok$'),
  ('02_festsetzen', '^ok status=quoted reserviert=2 preis_frisch=true hash_gleich=true gestartet=true gueltig_leer=true summe=true positionen=2 org=true audit=true audit_ohne_adresse=true$'),
  ('02f_entwurf_bestellt', '^ok status=pending preis_folgt_katalog=true$'),
  ('03a_fremde_org', '^rejected 42501 not allowed$'),
  ('03b_leser', '^rejected 42501 not allowed$'),
  ('03c_leer', '^rejected 22023 empty_order$'),
  ('03d_ohne_kundennummer', '^rejected P0001 quote_customer_number_required$'),
  ('03e_blanke_kundennummer', '^rejected P0001 quote_customer_number_required$'),
  ('03f_ausland', '^rejected P0001 quote_country_unsupported$'),
  ('03g_strasse_fehlt', '^rejected P0001 quote_address_incomplete$'),
  ('03h_plz_blank', '^rejected P0001 quote_address_incomplete$'),
  ('03h2_ort_leer', '^rejected P0001 quote_address_incomplete$'),
  ('03i_schon_bestellt', '^rejected P0001 not_editable$'),
  ('03j_schon_angebot', '^rejected P0001 order_quoted$'),
  ('03k_ohne_anmeldung', '^rejected 28000 not authenticated$'),
  ('03l_phase_zu', '^rejected P0001 phase_closed$'),
  ('03m_zu_wenig_bestand', '^rejected P0001 out_of_stock$'),
  ('03n_merch_unvollstaendig', '^rejected P0001 merch_incomplete$'),
  ('03z_nichts_veraendert', '^ok entwuerfe=12 lagerzeilen=0$'),
  ('04a_record', '^ok$'),
  ('04_beleg', '^ok referenz=true nummer=AN-ZZ-1 kontakt=true gueltig_30_tage=true probe=false verlauf=0 status=quoted audit=true audit_ohne_adresse=true$'),
  ('04b_rolle_authenticated', '^rejected 42501 permission denied for function record_shop_quote$'),
  ('04c_wache_mit_claims', '^rejected 42501 not allowed$'),
  ('04d_hash_falsch', '^rejected P0001 quote_hash_mismatch$'),
  ('04e_summe_falsch', '^rejected P0001 quote_hash_mismatch$'),
  ('04f_ohne_id', '^rejected 22023 quote_id_required$'),
  ('04g_zweimal', '^rejected P0001 quote_recorded$'),
  ('04h_ohne_angebot', '^rejected P0001 not_quoted$'),
  ('05a_partner_zeile', '^rejected P0001 order_quoted$'),
  ('05b_partner_menge_0', '^rejected P0001 order_quoted$'),
  ('05c_partner_entfernen', '^rejected P0001 order_quoted$'),
  ('05d_team_zeile', '^rejected P0001 order_quoted$'),
  ('05e_team_status_pending', '^rejected P0001 order_quoted$'),
  ('05f_team_status_completed', '^rejected P0001 order_quoted$'),
  ('05g_zweiter_entwurf', '^rejected 23505 duplicate key value violates unique constraint "shop_order_active_uidx"$'),
  ('05z_unveraendert', '^ok hash_gleich=true status=quoted zeilen=2$'),
  ('06a_partner_info', '^ok nummer=AN-ZZ-1 aktiv=true gueltig=true sevdesk_id_leer=true genutzt=1 probe=false$'),
  ('06b_team_beginnt', '^ok$'),
  ('06b_record_probe', '^ok$'),
  ('06c_leser_info', '^ok nummer=AN-ZZ-R aktiv=true probe=true sevdesk_id_leer=true$'),
  ('06d_leser_zurueckziehen', '^rejected 42501 not allowed$'),
  ('06e_leser_bestellen', '^rejected 42501 not allowed$'),
  ('06f_leser_beginnt', '^rejected 42501 not allowed$'),
  ('06g_team_info', '^ok sevdesk_id=SD-ZZ-R$'),
  ('06h_fremde_info', '^rejected 42501 not allowed$'),
  ('06i_ohne_angebot', '^ok null$'),
  ('06j_meine_bestellungen', '^ok a_status=quoted a_editable=false f_status=pending f_editable=true$'),
  ('06p_vorbereitung', '^ok g1=quoted g2=quoted g3=quoted g4=quoted t=quoted p=quoted$'),
  ('07a_bestellen', '^ok$'),
  ('07_bestellen', '^ok status=pending preis_aus_angebot=true katalog_teurer=true netto_gleich=true reserviert=2 lagerzeilen=1 po=PO-ZZ-1 felder_leer=true referenz=ordered audit_aus_angebot=true mail=1$'),
  ('07b_abgelaufen', '^rejected P0001 quote_expired$'),
  ('07c_im_vorgang', '^rejected P0001 quote_in_progress$'),
  ('07d_bestellt_nicht_zurueckziehen', '^rejected P0001 not_quoted$'),
  ('07e_bestellt_kein_neues_angebot', '^rejected P0001 not_editable$'),
  ('08a_fremd_zurueckziehen', '^rejected 42501 not allowed$'),
  ('08b_zurueckziehen_ohne_angebot', '^rejected P0001 not_quoted$'),
  ('08c_zurueckziehen', '^ok$'),
  ('08_zurueckgezogen', '^ok status=draft reserviert=0 referenz=withdrawn felder_leer=true audit=true begin_land_leer=true info_aktiv=false info_closed=withdrawn info_genutzt=1$'),
  ('08_zweites_angebot', '^ok genutzt=2 nummer=AN-ZZ-H2 verlauf=1 verlauf_nummer=AN-ZZ-H1 kontakt_bleibt=true$'),
  ('08_drittes_angebot', '^ok genutzt=3 nummer=AN-ZZ-H3 verlauf=2$'),
  ('08d_viertes_angebot', '^rejected P0001 quote_limit_reached$'),
  ('08_nach_limit', '^ok status=draft reserviert=0$'),
  ('09a_abbrechen_rolle', '^rejected 42501 permission denied for function shop_quote_abort$'),
  ('09b_abbrechen_mit_claims', '^rejected 42501 not allowed$'),
  ('09c_abbrechen', '^ok$'),
  ('09_abgebrochen', '^ok status=draft reserviert=0 felder_leer=true audit_grund=test$'),
  ('09d_abbrechen_zweimal', '^ok$'),
  ('09_zweimal_still', '^ok audits=1$'),
  ('09e_abbrechen_nach_beleg', '^rejected P0001 quote_recorded$'),
  ('10_lauf', '^ok expired=1 stale=1$'),
  ('10_zustand', '^ok g1=draft g2=draft g3=quoted g4=quoted reserviert_g1=0 reserviert_g2=0 reserviert_g3=2 referenz_g1=expired audit_abgelaufen=true audit_haengengeblieben=true$'),
  ('10_zweiter_lauf', '^ok expired=0 stale=0$'),
  ('11a_team_liste', '^ok zeilen=5 erste_g3=true nummer_g4=AN-ZZ-G4 probe_r=true nur_angebote=0$'),
  ('11b_partner_liste', '^rejected 42501 not allowed$'),
  ('11f_admin_reihenfolge', '^ok pending_vor_quoted=true quoted_vor_draft=true$'),
  ('11c_team_storno', '^ok$'),
  ('11_team_storno', '^ok status=cancelled reserviert=0 referenz=cancelled felder_leer=true$'),
  ('11d_neuer_entwurf_nach_storno', '^ok$'),
  ('11e_partner_storno', '^ok$'),
  ('11_partner_storno', '^ok status=cancelled reserviert=0 referenz=cancelled felder_leer=true$'),
  ('12_phasenende', '^ok p=cancelled g3=cancelled r=cancelled a=completed f=completed reserviert_p=0 reserviert_g3=0 felder_leer_p=true referenz_p=phase_end referenz_r=phase_end mails_a=1$'),
  ('13_rechnungslauf', '^ok kandidat_a=true preis_aus_angebot=true p_fehlt=true g3_fehlt=true$');

-- Hilfsfunktionen (nur in dieser Transaktion) --------------------------------------------------------------------------------------------------
-- Ausführen, optional unter einer Rolle; Fehler laufen durch (Aufbau und Vorbereitung).
create function pg_temp.zz_x(p_sql text, p_role text default null) returns void language plpgsql as $$
begin
  if p_role is not null then execute 'set local role ' || quote_ident(p_role); end if;
  execute p_sql;
  execute 'reset role';
end $$;

-- Ausführen und das Ergebnis als Zeile ablegen: „ok“ oder „rejected <SQLSTATE> <Meldung>“.
create function pg_temp.zz_r(p_step text, p_sql text, p_role text default null) returns void language plpgsql as $$
declare v_r text;
begin
  begin
    if p_role is not null then execute 'set local role ' || quote_ident(p_role); end if;
    execute p_sql;
    v_r := 'ok';
  exception when others then
    v_r := 'rejected ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  insert into t_res values (p_step, v_r);
end $$;

-- Eine Abfrage mit einem jsonb-Ergebnis, optional unter einer Rolle.
create function pg_temp.zz_j(p_sql text, p_role text default null) returns jsonb language plpgsql as $$
declare v_j jsonb;
begin
  if p_role is not null then execute 'set local role ' || quote_ident(p_role); end if;
  execute p_sql into v_j;
  execute 'reset role';
  return v_j;
end $$;

-- Wer handelt: 'partner' (die Person, ohne Teamrolle), 'team' (mit Rolle area_lead_partner), 'service' (ohne Anmeldung, wie die Route).
create function pg_temp.zz_als(p_wer text) returns void language plpgsql as $$
declare v_pid uuid;
begin
  select pid into v_pid from t_ctx;
  perform set_config('request.jwt.claims', case when p_wer = 'service' then '' else (select claims from t_ctx) end, true);
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  if p_wer = 'team' then insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global'); end if;
end $$;

-- Die Anweisung für den Beleg einer Bestellung (Summe und Hash aus dem Stand der Bestellung, wie die Route sie aus der Antwort von shop_quote_begin nimmt).
create function pg_temp.zz_rec(p_order uuid, p_sd text, p_nr text, p_contact text, p_probe boolean default false) returns text language sql as $$
  select format('select record_shop_quote(%L, %L, %L, %L, %s, %L, %L)', p_order, p_sd, p_nr, p_contact,
                (select net_cents from shop_order_totals(p_order)), shop_quote_lines_hash(p_order), p_probe)
$$;

create function pg_temp.zz_zeile(p_order uuid, p_sku text, p_qty numeric) returns void language sql as $$
  insert into shop_order_line (order_id, product_sku, name_de, name_en, category, unit, vat_rate, price_net_cents, qty)
  select p_order, p.sku, p.name_de, p.name_en, p.category, p.unit, p.vat_rate, p.net_price_cents, p_qty from product p where p.sku = p_sku
$$;

-- Eine Partner-Organisation mit Edition, Kontakt (die handelnde Person), Stand und Entwurf (Gitterbox ×2, Theke ×1) → array[Organisation, Org-Edition, Bestellung].
-- Optionen: kundennr, land, strasse, plz, ort (auch null), rollen (Kontaktrollen), ohne_kontakt, ohne_zeilen, zeilen ([[sku, menge], …]). Aufruf als Team.
create function pg_temp.zz_org(p_nr integer, p_opt jsonb default '{}'::jsonb) returns uuid[] language plpgsql as $$
declare v_c record; v_org uuid; v_oe uuid; v_o uuid; v_booth uuid; z jsonb;
begin
  select * into v_c from t_ctx;
  insert into organization (legal_name, communication_name, type, customer_number, address_country, address_street, address_zip, address_city)
  values ('ZZTEST Angebot ' || p_nr || ' GmbH', 'ZZTEST Angebot ' || p_nr, 'corporate',
          case when p_opt ? 'kundennr' then p_opt->>'kundennr' else 'ZZTEST-NR-' || p_nr end,
          case when p_opt ? 'land' then p_opt->>'land' else 'Deutschland' end,
          case when p_opt ? 'strasse' then p_opt->>'strasse' else 'Testweg ' || p_nr end,
          case when p_opt ? 'plz' then p_opt->>'plz' else '20095' end,
          case when p_opt ? 'ort' then p_opt->>'ort' else 'Hamburg' end)
  returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status, invoice_email, vat_id)
  values (v_org, v_c.ed, 'invited', 'zz-angebot-' || p_nr || '@example.com', 'DE123456789') returning id into v_oe;
  if not (p_opt ? 'ohne_kontakt') then
    perform upsert_partner_contact(v_org, v_c.email, 'Test', 'Person',
      case when p_opt ? 'rollen' then array(select jsonb_array_elements_text(p_opt->'rollen')) else array['primary_ops'] end);
  end if;
  insert into booth (booth_number, length_m, width_m) values ('ZZ-A' || p_nr, 2, 2) returning id into v_booth;
  insert into booth_assignment (booth_id, org_edition_id) values (v_booth, v_oe);
  insert into shop_order (org_edition_id, order_no, phase, status) values (v_oe, 'MS-2999-' || lpad(p_nr::text, 4, '0'), v_c.p, 'draft') returning id into v_o;
  if not (p_opt ? 'ohne_zeilen') then
    for z in select value from jsonb_array_elements(coalesce(p_opt->'zeilen', '[["I-11329", 2], ["I-12346", 1]]'::jsonb)) loop
      perform pg_temp.zz_zeile(v_o, z->>0, (z->>1)::numeric);
    end loop;
  end if;
  return array[v_org, v_oe, v_o];
end $$;

do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_claims text; v_ed uuid; v_p integer; v_t0 timestamptz := now();
  ra uuid[]; rb uuid[]; rc uuid[]; rc2 uuid[]; rd uuid[]; re uuid[]; re2 uuid[]; re3 uuid[]; rf uuid[]; rh uuid[]; ri uuid[];
  rg1 uuid[]; rg2 uuid[]; rg3 uuid[]; rg4 uuid[]; rp uuid[]; rr uuid[]; rx uuid[]; rt uuid[]; rs uuid[]; rm uuid[]; rz uuid[];
  v_json jsonb; v_info jsonb; v_hash text; v_net bigint; v_preis_alt integer; v_preis_neu integer; v_f_alt integer; v_avail integer; v_hk jsonb;
begin
  -- Die handelnde Person: ein Konto aus dem Bestand, ohne Vorrechte; die Rolle `area_lead_partner` schalten wir je Schritt zu.
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  v_claims := json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text;
  delete from role_assignment where person_id = v_pid;
  select id into v_ed from event where is_edition and slug = 'fls27';
  insert into deadline (edition_id, key, due_at, label_de, label_en)
  values (v_ed, 'shop_phase1_end', now() + interval '60 days', 'Messeshop Phase 1', 'Shop phase 1'),
         (v_ed, 'shop_phase2_end', now() + interval '90 days', 'Messeshop Phase 2', 'Shop phase 2')
  on conflict (edition_id, key) do update set due_at = excluded.due_at;
  v_p := (shop_phase(v_ed)->>'phase')::integer;
  insert into t_ctx values (v_pid, v_uid, v_email, v_claims, v_ed, v_p);
  -- Gitterbox mit Bestandsführung (50 Stück), die Theke ohne
  update product set track_stock = true, stock_total = 50 where sku = 'I-11329';
  update product set track_stock = false where sku = 'I-12346';

  -- Aufbau als Team: A Hauptfall · B ohne Positionen · C Kundennummer null · C2 blank · D Ausland · E Straße fehlt · E2 PLZ blank · F wird bestellt · H Land leer,
  -- Zurückziehen und Limit · I Abbrechen · G1 abgelaufen · G2 hängengeblieben · G3 frisch im Vorgang · G4 gültig · P Phasenende · R Leser (event_app_member) ·
  -- X fremde Organisation · T Team-Storno · S wenig Bestand · M Merch · Z Phase 2
  perform pg_temp.zz_als('team');
  ra := pg_temp.zz_org(1);
  rb := pg_temp.zz_org(2, '{"ohne_zeilen": true}');
  rc := pg_temp.zz_org(3, '{"kundennr": null}');
  rc2 := pg_temp.zz_org(4, '{"kundennr": " "}');
  rd := pg_temp.zz_org(5, '{"land": "Spanien"}');
  re := pg_temp.zz_org(6, '{"strasse": null}');
  re2 := pg_temp.zz_org(7, '{"plz": " "}');
  re3 := pg_temp.zz_org(22, '{"ort": ""}');
  rf := pg_temp.zz_org(8);
  rh := pg_temp.zz_org(9, '{"land": null}');
  ri := pg_temp.zz_org(10);
  rg1 := pg_temp.zz_org(11);
  rg2 := pg_temp.zz_org(12);
  rg3 := pg_temp.zz_org(13);
  rg4 := pg_temp.zz_org(14);
  rp := pg_temp.zz_org(15);
  rr := pg_temp.zz_org(16, '{"rollen": ["event_app_member"]}');
  rx := pg_temp.zz_org(17, '{"ohne_kontakt": true}');
  rt := pg_temp.zz_org(18);
  rs := pg_temp.zz_org(19);
  rm := pg_temp.zz_org(20, '{"zeilen": [["I-10465", 1]]}');
  rz := pg_temp.zz_org(21);
  update shop_order set phase = 2 where id = rz[3];

  -- === 01 Form ======================================================================================================================
  insert into t_res values ('01_form',
    'ok spalten=' || (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'shop_order' and column_name in ('quote_started_at', 'quote_valid_until'))::text
    || ' status_quoted=' || (select (pg_get_constraintdef(c.oid) like '%quoted%')::text from pg_constraint c where c.conrelid = 'public.shop_order'::regclass and c.conname = 'shop_order_status_check')
    || ' index_quoted=' || (select (indexdef like '%quoted%')::text from pg_indexes where schemaname = 'public' and indexname = 'shop_order_active_uidx')
    || ' nutzbar=' || (has_function_privilege('authenticated', 'shop_quote_begin(uuid)', 'execute') and has_function_privilege('authenticated', 'shop_quote_withdraw(uuid)', 'execute')
                       and has_function_privilege('authenticated', 'shop_quote_info(uuid)', 'execute') and has_function_privilege('authenticated', 'shop_quotes_admin(uuid)', 'execute'))::text
    || ' intern_gesperrt=' || (not exists (
         select 1 from unnest(array['record_shop_quote(uuid, text, text, text, bigint, text, boolean)', 'shop_quote_abort(uuid, text)', 'shop_quotes_housekeeping()', 'shop_quote_lines_hash(uuid)']) f
          where has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute')))::text
    || ' service_darf=' || (has_function_privilege('service_role', 'record_shop_quote(uuid, text, text, text, bigint, text, boolean)', 'execute')
                            and has_function_privilege('service_role', 'shop_quote_abort(uuid, text)', 'execute'))::text
    || ' anon_nichts=' || (not exists (
         select 1 from unnest(array['shop_quote_begin(uuid)', 'shop_quote_withdraw(uuid)', 'shop_quote_info(uuid)', 'shop_quotes_admin(uuid)']) f
          where has_function_privilege('anon', f, 'execute')))::text);

  -- === 02 Festsetzen (A) ===============================================================================================================
  perform pg_temp.zz_als('partner');
  perform pg_temp.zz_r('02a_warenkorb_vorher_aenderbar', format('select shop_upsert_line(%L, %L, 1)', ra[1], 'I-12346'), 'authenticated');
  v_preis_alt := (select price_net_cents from shop_order_line where order_id = ra[3] and product_sku = 'I-12346');
  update product set net_price_cents = net_price_cents + 500 where sku = 'I-12346';       -- der Katalog ist inzwischen teurer
  v_preis_neu := (select net_price_cents from product where sku = 'I-12346');
  v_json := pg_temp.zz_j(format('select shop_quote_begin(%L)', ra[3]), 'authenticated');
  v_hash := v_json->>'lines_hash';
  v_net := (v_json->'totals'->>'net_cents')::bigint;
  insert into t_res values ('02_festsetzen',
    'ok status=' || (select status from shop_order where id = ra[3])
    || ' reserviert=' || shop_order_reserved(ra[3], 'I-11329')::text
    || ' preis_frisch=' || ((select price_net_cents from shop_order_line where order_id = ra[3] and product_sku = 'I-12346') = v_preis_neu and v_preis_neu <> v_preis_alt)::text
    || ' hash_gleich=' || (v_hash = shop_quote_lines_hash(ra[3]))::text
    || ' gestartet=' || (select (quote_started_at = v_t0)::text from shop_order where id = ra[3])
    || ' gueltig_leer=' || (select (quote_valid_until is null)::text from shop_order where id = ra[3])
    || ' summe=' || (v_net = (select sum(round(qty * price_net_cents)) from shop_order_line where order_id = ra[3]))::text
    || ' positionen=' || jsonb_array_length(v_json->'lines')::text
    || ' org=' || ((v_json->'org'->>'customer_number') = 'ZZTEST-NR-1' and (v_json->'org'->>'address_street') = 'Testweg 1' and (v_json->'org'->>'vat_id') = 'DE123456789')::text
    || ' audit=' || exists (select 1 from audit_log where action = 'shop.quote_begin' and object_id = ra[3]::text)::text
    || ' audit_ohne_adresse=' || (not exists (select 1 from audit_log where action like 'shop.quote_%' and object_id = ra[3]::text
                                              and (coalesce(before::text, '') || coalesce(after::text, '')) ~* 'Testweg|20095|Hamburg'))::text);

  -- Gegenstück: ein Entwurf (F) wird bestellt, sein Preis folgt dem Katalog (anders als beim Angebot, Schritt 07)
  v_f_alt := (select price_net_cents from shop_order_line where order_id = rf[3] and product_sku = 'I-12346');
  perform pg_temp.zz_x(format('select shop_confirm(%L, null, %L)', rf[3], 'PO-ZZ-F'), 'authenticated');
  insert into t_res values ('02f_entwurf_bestellt',
    'ok status=' || (select status from shop_order where id = rf[3])
    || ' preis_folgt_katalog=' || ((select price_net_cents from shop_order_line where order_id = rf[3] and product_sku = 'I-12346') = v_preis_neu and v_f_alt <> v_preis_neu)::text);

  -- === 03 Abweisungen (alle als Partner mit Bearbeitungsrecht, außer wo vermerkt) ======================================================================
  perform pg_temp.zz_r('03a_fremde_org', format('select shop_quote_begin(%L)', rx[3]), 'authenticated');
  perform pg_temp.zz_r('03b_leser', format('select shop_quote_begin(%L)', rr[3]), 'authenticated');
  perform pg_temp.zz_r('03c_leer', format('select shop_quote_begin(%L)', rb[3]), 'authenticated');
  perform pg_temp.zz_r('03d_ohne_kundennummer', format('select shop_quote_begin(%L)', rc[3]), 'authenticated');
  perform pg_temp.zz_r('03e_blanke_kundennummer', format('select shop_quote_begin(%L)', rc2[3]), 'authenticated');
  perform pg_temp.zz_r('03f_ausland', format('select shop_quote_begin(%L)', rd[3]), 'authenticated');
  perform pg_temp.zz_r('03g_strasse_fehlt', format('select shop_quote_begin(%L)', re[3]), 'authenticated');
  perform pg_temp.zz_r('03h_plz_blank', format('select shop_quote_begin(%L)', re2[3]), 'authenticated');
  perform pg_temp.zz_r('03h2_ort_leer', format('select shop_quote_begin(%L)', re3[3]), 'authenticated');
  perform pg_temp.zz_r('03i_schon_bestellt', format('select shop_quote_begin(%L)', rf[3]), 'authenticated');
  perform pg_temp.zz_r('03j_schon_angebot', format('select shop_quote_begin(%L)', ra[3]), 'authenticated');
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.zz_r('03k_ohne_anmeldung', format('select shop_quote_begin(%L)', rb[3]));
  perform pg_temp.zz_als('partner');
  perform pg_temp.zz_r('03l_phase_zu', format('select shop_quote_begin(%L)', rz[3]), 'authenticated');
  -- Bestand: nur noch ein Stück frei, die Bestellung braucht zwei
  v_avail := shop_stock_available('I-11329');
  update product set stock_total = stock_total - v_avail + 1 where sku = 'I-11329';
  perform pg_temp.zz_r('03m_zu_wenig_bestand', format('select shop_quote_begin(%L)', rs[3]), 'authenticated');
  update product set stock_total = stock_total + v_avail - 1 where sku = 'I-11329';
  -- Merch: die Zeile verlangt eine Antwort, die fehlt
  update product set merch_config = '[{"key":"text","type":"text","required":true}]'::jsonb where sku = 'I-10465';
  perform pg_temp.zz_r('03n_merch_unvollstaendig', format('select shop_quote_begin(%L)', rm[3]), 'authenticated');
  update product set merch_config = null where sku = 'I-10465';
  insert into t_res values ('03z_nichts_veraendert',
    'ok entwuerfe=' || (select count(*) from shop_order where id = any(array[rb[3], rc[3], rc2[3], rd[3], re[3], re2[3], re3[3], rr[3], rx[3], rz[3], rs[3], rm[3]])
                          and status = 'draft' and quote_started_at is null and quote_valid_until is null)::text
    || ' lagerzeilen=' || (select count(*) from stock_ledger where order_id = any(array[rb[3], rc[3], rc2[3], rd[3], re[3], re2[3], re3[3], rr[3], rx[3], rz[3], rs[3], rm[3]]))::text);

  -- === 04 Beleg eintragen (A, service_role) ================================================================================================
  perform pg_temp.zz_als('partner');
  perform pg_temp.zz_x(format('select shop_quote_begin(%L)', ri[3]), 'authenticated');     -- I: im Vorgang, ohne Beleg (für die Abweisungen und Schritt 09)
  perform pg_temp.zz_als('service');
  perform pg_temp.zz_r('04a_record', pg_temp.zz_rec(ra[3], 'SD-ZZ-1', 'AN-ZZ-1', 'SD-KONTAKT-1'), 'service_role');
  insert into t_res values ('04_beleg',
    'ok referenz=' || exists (select 1 from external_ref where system = 'sevdesk' and object_type = 'shop_quote' and object_id = ra[3] and external_id = 'SD-ZZ-1')::text
    || ' nummer=' || coalesce((select meta->>'number' from external_ref where system = 'sevdesk' and object_type = 'shop_quote' and object_id = ra[3]), '-')
    || ' kontakt=' || (coalesce((select sevdesk_contact_id from organization where id = ra[1]), '-') = 'SD-KONTAKT-1')::text
    || ' gueltig_30_tage=' || (select (quote_valid_until = v_t0 + interval '30 days')::text from shop_order where id = ra[3])
    || ' probe=' || coalesce((select meta->>'probe' from external_ref where system = 'sevdesk' and object_type = 'shop_quote' and object_id = ra[3]), '-')
    || ' verlauf=' || coalesce((select jsonb_array_length(meta->'history') from external_ref where system = 'sevdesk' and object_type = 'shop_quote' and object_id = ra[3]), -1)::text
    || ' status=' || (select status from shop_order where id = ra[3])
    || ' audit=' || exists (select 1 from audit_log where action = 'shop.quote_created' and object_id = ra[3]::text and after->>'quote_number' = 'AN-ZZ-1')::text
    || ' audit_ohne_adresse=' || (not exists (select 1 from audit_log where action like 'shop.quote_%' and object_id = ra[3]::text
                                              and (coalesce(before::text, '') || coalesce(after::text, '')) ~* 'Testweg|20095|Hamburg'))::text);
  perform pg_temp.zz_r('04b_rolle_authenticated', pg_temp.zz_rec(ra[3], 'SD-ZZ-1', 'AN-ZZ-1', null), 'authenticated');
  perform pg_temp.zz_als('partner');
  perform pg_temp.zz_r('04c_wache_mit_claims', pg_temp.zz_rec(ra[3], 'SD-ZZ-1', 'AN-ZZ-1', null));
  perform pg_temp.zz_als('service');
  perform pg_temp.zz_r('04d_hash_falsch', format('select record_shop_quote(%L, %L, %L, null, %s, %L, false)', ri[3], 'SD-ZZ-I', 'AN-ZZ-I',
                                                   (select net_cents from shop_order_totals(ri[3])), 'falscher-hash'), 'service_role');
  perform pg_temp.zz_r('04e_summe_falsch', format('select record_shop_quote(%L, %L, %L, null, %s, %L, false)', ri[3], 'SD-ZZ-I', 'AN-ZZ-I',
                                                    (select net_cents from shop_order_totals(ri[3])) + 1, shop_quote_lines_hash(ri[3])), 'service_role');
  perform pg_temp.zz_r('04f_ohne_id', pg_temp.zz_rec(ri[3], '  ', 'AN-ZZ-I', null), 'service_role');
  perform pg_temp.zz_r('04g_zweimal', pg_temp.zz_rec(ra[3], 'SD-ZZ-1b', 'AN-ZZ-1b', null), 'service_role');
  perform pg_temp.zz_r('04h_ohne_angebot', pg_temp.zz_rec(rb[3], 'SD-ZZ-B', 'AN-ZZ-B', null), 'service_role');

  -- === 05 Warenkorb gesperrt (A) =============================================================================================================
  perform pg_temp.zz_als('partner');
  perform pg_temp.zz_r('05a_partner_zeile', format('select shop_upsert_line(%L, %L, 3)', ra[1], 'I-12346'), 'authenticated');
  perform pg_temp.zz_r('05b_partner_menge_0', format('select shop_upsert_line(%L, %L, 0)', ra[1], 'I-12346'), 'authenticated');
  perform pg_temp.zz_r('05c_partner_entfernen', format('select shop_remove_line(%L, %L)', ra[3], 'I-12346'), 'authenticated');
  perform pg_temp.zz_als('team');
  perform pg_temp.zz_r('05d_team_zeile', format('select shop_admin_set_line(%L, %L, 3)', ra[3], 'I-12346'), 'authenticated');
  perform pg_temp.zz_r('05e_team_status_pending', format('select shop_admin_set_status(%L, %L)', ra[3], 'pending'), 'authenticated');
  perform pg_temp.zz_r('05f_team_status_completed', format('select shop_admin_set_status(%L, %L)', ra[3], 'completed'), 'authenticated');
  perform pg_temp.zz_r('05g_zweiter_entwurf', format('insert into shop_order (org_edition_id, order_no, phase, status) values (%L, %L, %s, %L)', ra[2], 'MS-2999-9001', v_p, 'draft'));
  insert into t_res values ('05z_unveraendert',
    'ok hash_gleich=' || (shop_quote_lines_hash(ra[3]) = v_hash)::text
    || ' status=' || (select status from shop_order where id = ra[3])
    || ' zeilen=' || (select count(*) from shop_order_line where order_id = ra[3])::text);

  -- === 06 Auskunft ============================================================================================================================
  perform pg_temp.zz_als('partner');
  v_info := pg_temp.zz_j(format('select shop_quote_info(%L)', ra[3]), 'authenticated');
  insert into t_res values ('06a_partner_info',
    'ok nummer=' || coalesce(v_info->>'quote_number', '-') || ' aktiv=' || coalesce(v_info->>'active', '-')
    || ' gueltig=' || ((v_info->>'valid_until')::timestamptz = v_t0 + interval '30 days')::text
    || ' sevdesk_id_leer=' || ((v_info->>'sevdesk_order_id') is null)::text
    || ' genutzt=' || coalesce(v_info->>'quotes_used', '-') || ' probe=' || coalesce(v_info->>'probe', '-'));
  -- R: das Team beginnt für den Partner, die Route trägt den Beleg als Probebetrieb ein; die handelnde Person ist dort nur Leser (event_app_member)
  perform pg_temp.zz_als('team');
  perform pg_temp.zz_r('06b_team_beginnt', format('select shop_quote_begin(%L)', rr[3]), 'authenticated');
  perform pg_temp.zz_als('service');
  perform pg_temp.zz_r('06b_record_probe', pg_temp.zz_rec(rr[3], 'SD-ZZ-R', 'AN-ZZ-R', 'SD-KONTAKT-R', true), 'service_role');
  perform pg_temp.zz_als('partner');
  v_info := pg_temp.zz_j(format('select shop_quote_info(%L)', rr[3]), 'authenticated');
  insert into t_res values ('06c_leser_info',
    'ok nummer=' || coalesce(v_info->>'quote_number', '-') || ' aktiv=' || coalesce(v_info->>'active', '-') || ' probe=' || coalesce(v_info->>'probe', '-')
    || ' sevdesk_id_leer=' || ((v_info->>'sevdesk_order_id') is null)::text);
  perform pg_temp.zz_r('06d_leser_zurueckziehen', format('select shop_quote_withdraw(%L)', rr[3]), 'authenticated');
  perform pg_temp.zz_r('06e_leser_bestellen', format('select shop_confirm(%L, null, %L)', rr[3], 'PO-ZZ-R'), 'authenticated');
  perform pg_temp.zz_r('06f_leser_beginnt', format('select shop_quote_begin(%L)', rr[3]), 'authenticated');
  perform pg_temp.zz_als('team');
  v_info := pg_temp.zz_j(format('select shop_quote_info(%L)', rr[3]), 'authenticated');
  insert into t_res values ('06g_team_info', 'ok sevdesk_id=' || coalesce(v_info->>'sevdesk_order_id', '-'));
  perform pg_temp.zz_als('partner');
  perform pg_temp.zz_r('06h_fremde_info', format('select shop_quote_info(%L)', rx[3]), 'authenticated');
  v_info := pg_temp.zz_j(format('select shop_quote_info(%L)', rb[3]), 'authenticated');
  insert into t_res values ('06i_ohne_angebot', 'ok ' || coalesce(v_info::text, 'null'));
  v_json := pg_temp.zz_j(format('select jsonb_agg(to_jsonb(m)) from shop_my_orders(%L) m', ra[1]), 'authenticated');
  v_info := pg_temp.zz_j(format('select jsonb_agg(to_jsonb(m)) from shop_my_orders(%L) m', rf[1]), 'authenticated');
  insert into t_res values ('06j_meine_bestellungen',
    'ok a_status=' || coalesce(v_json->0->>'status', '-') || ' a_editable=' || coalesce(v_json->0->>'editable', '-')
    || ' f_status=' || coalesce(v_info->0->>'status', '-') || ' f_editable=' || coalesce(v_info->0->>'editable', '-'));

  -- Vorbereitung für Housekeeping, Team-Storno und Phasenende: G1 (Beleg, dann abgelaufen), G2 (kein Beleg, hängengeblieben), G3 (kein Beleg, frisch),
  -- G4, T und P (Beleg, gültig)
  perform pg_temp.zz_als('partner');
  perform pg_temp.zz_x(format('select shop_quote_begin(%L)', rg1[3]), 'authenticated');
  perform pg_temp.zz_x(format('select shop_quote_begin(%L)', rg2[3]), 'authenticated');
  perform pg_temp.zz_x(format('select shop_quote_begin(%L)', rg3[3]), 'authenticated');
  perform pg_temp.zz_x(format('select shop_quote_begin(%L)', rg4[3]), 'authenticated');
  perform pg_temp.zz_x(format('select shop_quote_begin(%L)', rt[3]), 'authenticated');
  perform pg_temp.zz_x(format('select shop_quote_begin(%L)', rp[3]), 'authenticated');
  perform pg_temp.zz_als('service');
  perform pg_temp.zz_x(pg_temp.zz_rec(rg1[3], 'SD-ZZ-G1', 'AN-ZZ-G1', null), 'service_role');
  perform pg_temp.zz_x(pg_temp.zz_rec(rg4[3], 'SD-ZZ-G4', 'AN-ZZ-G4', null), 'service_role');
  perform pg_temp.zz_x(pg_temp.zz_rec(rt[3], 'SD-ZZ-T', 'AN-ZZ-T', null), 'service_role');
  perform pg_temp.zz_x(pg_temp.zz_rec(rp[3], 'SD-ZZ-P', 'AN-ZZ-P', null), 'service_role');
  update shop_order set quote_valid_until = now() - interval '1 day' where id = rg1[3];
  update shop_order set quote_started_at = now() - interval '11 minutes' where id = rg2[3];
  update shop_order set quote_started_at = now() - interval '11 minutes' where id = rg4[3];     -- G4 hat seinen Beleg: lange her, aber kein hängengebliebener Vorgang
  insert into t_res values ('06p_vorbereitung',
    'ok g1=' || (select status from shop_order where id = rg1[3]) || ' g2=' || (select status from shop_order where id = rg2[3])
    || ' g3=' || (select status from shop_order where id = rg3[3]) || ' g4=' || (select status from shop_order where id = rg4[3])
    || ' t=' || (select status from shop_order where id = rt[3]) || ' p=' || (select status from shop_order where id = rp[3]));

  -- === 07 Bestellen aus dem Angebot (A) ========================================================================================================
  perform pg_temp.zz_als('partner');
  update product set net_price_cents = net_price_cents + 700 where sku = 'I-12346';       -- der Katalog wird noch einmal teurer
  perform pg_temp.zz_r('07a_bestellen', format('select shop_confirm(%L, %L, %L)', ra[3], 'Bitte liefern', 'PO-ZZ-1'), 'authenticated');
  insert into t_res values ('07_bestellen',
    'ok status=' || (select status from shop_order where id = ra[3])
    || ' preis_aus_angebot=' || ((select price_net_cents from shop_order_line where order_id = ra[3] and product_sku = 'I-12346') = v_preis_neu)::text
    || ' katalog_teurer=' || ((select net_price_cents from product where sku = 'I-12346') = v_preis_neu + 700)::text
    || ' netto_gleich=' || (v_net = (select net_cents from shop_order_totals(ra[3])))::text
    || ' reserviert=' || shop_order_reserved(ra[3], 'I-11329')::text
    || ' lagerzeilen=' || (select count(*) from stock_ledger where order_id = ra[3])::text
    || ' po=' || coalesce((select po_number from shop_order where id = ra[3]), '-')
    || ' felder_leer=' || (select (quote_started_at is null and quote_valid_until is null)::text from shop_order where id = ra[3])
    || ' referenz=' || coalesce((select meta->>'closed' from external_ref where system = 'sevdesk' and object_type = 'shop_quote' and object_id = ra[3]), '-')
    || ' audit_aus_angebot=' || exists (select 1 from audit_log where action = 'shop.confirm' and object_id = ra[3]::text and (after->>'from_quote')::boolean)::text
    || ' mail=' || (select count(*) from mail_log where template_key = 'shop_order_confirmed' and related_id = ra[3])::text);
  perform pg_temp.zz_r('07b_abgelaufen', format('select shop_confirm(%L)', rg1[3]), 'authenticated');
  perform pg_temp.zz_r('07c_im_vorgang', format('select shop_confirm(%L)', rg3[3]), 'authenticated');
  perform pg_temp.zz_r('07d_bestellt_nicht_zurueckziehen', format('select shop_quote_withdraw(%L)', ra[3]), 'authenticated');
  perform pg_temp.zz_r('07e_bestellt_kein_neues_angebot', format('select shop_quote_begin(%L)', ra[3]), 'authenticated');

  -- === 08 Zurückziehen und höchstens drei Angebote (H, Land leer = Deutschland) ===========================================================================
  perform pg_temp.zz_x(format('select shop_quote_begin(%L)', rh[3]), 'authenticated');
  perform pg_temp.zz_als('service');
  perform pg_temp.zz_x(pg_temp.zz_rec(rh[3], 'SD-ZZ-H1', 'AN-ZZ-H1', 'SD-KONTAKT-9'), 'service_role');
  perform pg_temp.zz_als('partner');
  perform pg_temp.zz_r('08a_fremd_zurueckziehen', format('select shop_quote_withdraw(%L)', rx[3]), 'authenticated');
  perform pg_temp.zz_r('08b_zurueckziehen_ohne_angebot', format('select shop_quote_withdraw(%L)', rb[3]), 'authenticated');
  perform pg_temp.zz_r('08c_zurueckziehen', format('select shop_quote_withdraw(%L)', rh[3]), 'authenticated');
  v_info := pg_temp.zz_j(format('select shop_quote_info(%L)', rh[3]), 'authenticated');
  insert into t_res values ('08_zurueckgezogen',
    'ok status=' || (select status from shop_order where id = rh[3])
    || ' reserviert=' || shop_order_reserved(rh[3], 'I-11329')::text
    || ' referenz=' || coalesce((select meta->>'closed' from external_ref where system = 'sevdesk' and object_type = 'shop_quote' and object_id = rh[3]), '-')
    || ' felder_leer=' || (select (quote_started_at is null and quote_valid_until is null)::text from shop_order where id = rh[3])
    || ' audit=' || exists (select 1 from audit_log where action = 'shop.quote_withdrawn' and object_id = rh[3]::text)::text
    || ' begin_land_leer=' || exists (select 1 from audit_log where action = 'shop.quote_begin' and object_id = rh[3]::text)::text
    || ' info_aktiv=' || coalesce(v_info->>'active', '-') || ' info_closed=' || coalesce(v_info->>'closed', '-') || ' info_genutzt=' || coalesce(v_info->>'quotes_used', '-'));
  perform pg_temp.zz_x(format('select shop_quote_begin(%L)', rh[3]), 'authenticated');
  perform pg_temp.zz_als('service');
  perform pg_temp.zz_x(pg_temp.zz_rec(rh[3], 'SD-ZZ-H2', 'AN-ZZ-H2', 'SD-KONTAKT-X'), 'service_role');
  perform pg_temp.zz_als('partner');
  v_info := pg_temp.zz_j(format('select shop_quote_info(%L)', rh[3]), 'authenticated');
  insert into t_res values ('08_zweites_angebot',
    'ok genutzt=' || coalesce(v_info->>'quotes_used', '-') || ' nummer=' || coalesce(v_info->>'quote_number', '-')
    || ' verlauf=' || coalesce((select jsonb_array_length(meta->'history') from external_ref where system = 'sevdesk' and object_type = 'shop_quote' and object_id = rh[3]), -1)::text
    || ' verlauf_nummer=' || coalesce((select meta->'history'->0->>'number' from external_ref where system = 'sevdesk' and object_type = 'shop_quote' and object_id = rh[3]), '-')
    || ' kontakt_bleibt=' || (coalesce((select sevdesk_contact_id from organization where id = rh[1]), '-') = 'SD-KONTAKT-9')::text);
  perform pg_temp.zz_x(format('select shop_quote_withdraw(%L)', rh[3]), 'authenticated');
  perform pg_temp.zz_x(format('select shop_quote_begin(%L)', rh[3]), 'authenticated');
  perform pg_temp.zz_als('service');
  perform pg_temp.zz_x(pg_temp.zz_rec(rh[3], 'SD-ZZ-H3', 'AN-ZZ-H3', null), 'service_role');
  perform pg_temp.zz_als('partner');
  v_info := pg_temp.zz_j(format('select shop_quote_info(%L)', rh[3]), 'authenticated');
  insert into t_res values ('08_drittes_angebot',
    'ok genutzt=' || coalesce(v_info->>'quotes_used', '-') || ' nummer=' || coalesce(v_info->>'quote_number', '-')
    || ' verlauf=' || coalesce((select jsonb_array_length(meta->'history') from external_ref where system = 'sevdesk' and object_type = 'shop_quote' and object_id = rh[3]), -1)::text);
  perform pg_temp.zz_x(format('select shop_quote_withdraw(%L)', rh[3]), 'authenticated');
  perform pg_temp.zz_r('08d_viertes_angebot', format('select shop_quote_begin(%L)', rh[3]), 'authenticated');
  insert into t_res values ('08_nach_limit',
    'ok status=' || (select status from shop_order where id = rh[3]) || ' reserviert=' || shop_order_reserved(rh[3], 'I-11329')::text);

  -- === 09 Abbrechen (I: im Vorgang seit Schritt 04) ===============================================================================================
  perform pg_temp.zz_als('service');
  perform pg_temp.zz_r('09a_abbrechen_rolle', format('select shop_quote_abort(%L, %L)', ri[3], 'x'), 'authenticated');
  perform pg_temp.zz_als('partner');
  perform pg_temp.zz_r('09b_abbrechen_mit_claims', format('select shop_quote_abort(%L, %L)', ri[3], 'x'));
  perform pg_temp.zz_als('service');
  perform pg_temp.zz_r('09c_abbrechen', format('select shop_quote_abort(%L, %L)', ri[3], 'test'), 'service_role');
  insert into t_res values ('09_abgebrochen',
    'ok status=' || (select status from shop_order where id = ri[3])
    || ' reserviert=' || shop_order_reserved(ri[3], 'I-11329')::text
    || ' felder_leer=' || (select (quote_started_at is null and quote_valid_until is null)::text from shop_order where id = ri[3])
    || ' audit_grund=' || coalesce((select after->>'reason' from audit_log where action = 'shop.quote_aborted' and object_id = ri[3]::text limit 1), '-'));
  perform pg_temp.zz_r('09d_abbrechen_zweimal', format('select shop_quote_abort(%L, %L)', ri[3], 'test'), 'service_role');
  insert into t_res values ('09_zweimal_still', 'ok audits=' || (select count(*) from audit_log where action = 'shop.quote_aborted' and object_id = ri[3]::text)::text);
  perform pg_temp.zz_r('09e_abbrechen_nach_beleg', format('select shop_quote_abort(%L, %L)', rr[3], 'x'), 'service_role');

  -- === 10 Housekeeping =============================================================================================================================
  v_hk := run_partner_housekeeping();
  insert into t_res values ('10_lauf', 'ok expired=' || coalesce(v_hk->'quotes'->>'expired', '-') || ' stale=' || coalesce(v_hk->'quotes'->>'stale', '-'));
  insert into t_res values ('10_zustand',
    'ok g1=' || (select status from shop_order where id = rg1[3]) || ' g2=' || (select status from shop_order where id = rg2[3])
    || ' g3=' || (select status from shop_order where id = rg3[3]) || ' g4=' || (select status from shop_order where id = rg4[3])
    || ' reserviert_g1=' || shop_order_reserved(rg1[3], 'I-11329')::text || ' reserviert_g2=' || shop_order_reserved(rg2[3], 'I-11329')::text
    || ' reserviert_g3=' || shop_order_reserved(rg3[3], 'I-11329')::text
    || ' referenz_g1=' || coalesce((select meta->>'closed' from external_ref where system = 'sevdesk' and object_type = 'shop_quote' and object_id = rg1[3]), '-')
    || ' audit_abgelaufen=' || exists (select 1 from audit_log where action = 'shop.quote_expired' and object_id = rg1[3]::text)::text
    || ' audit_haengengeblieben=' || exists (select 1 from audit_log where action = 'shop.quote_aborted' and object_id = rg2[3]::text and after->>'reason' = 'stale')::text);
  v_hk := shop_quotes_housekeeping();
  insert into t_res values ('10_zweiter_lauf', 'ok expired=' || coalesce(v_hk->>'expired', '-') || ' stale=' || coalesce(v_hk->>'stale', '-'));

  -- === 11 Team-Liste, Team- und Partner-Storno ==================================================================================================
  perform pg_temp.zz_als('team');
  v_json := pg_temp.zz_j(format('select jsonb_agg(to_jsonb(q)) from shop_quotes_admin(%L) q', v_ed), 'authenticated');
  insert into t_res values ('11a_team_liste',
    'ok zeilen=' || (select count(*) from jsonb_array_elements(v_json) e where (e->>'order_id')::uuid = any(array[rg3[3], rg4[3], rr[3], rt[3], rp[3]]))::text
    || ' erste_g3=' || ((v_json->0->>'order_id')::uuid = rg3[3])::text
    || ' nummer_g4=' || coalesce((select e->>'quote_number' from jsonb_array_elements(v_json) e where (e->>'order_id')::uuid = rg4[3]), '-')
    || ' probe_r=' || coalesce((select e->>'probe' from jsonb_array_elements(v_json) e where (e->>'order_id')::uuid = rr[3]), '-')
    || ' nur_angebote=' || (select count(*) from jsonb_array_elements(v_json) e join shop_order o on o.id = (e->>'order_id')::uuid where o.status <> 'quoted')::text);
  -- die Bestellungsliste des Teams stellt Angebote hinter die bestellten und vor die Entwürfe
  v_info := pg_temp.zz_j(format('select jsonb_agg(status order by rn) from (select status, row_number() over () as rn from shop_orders_admin(%L)) s', v_ed), 'authenticated');
  insert into t_res
  select '11f_admin_reihenfolge',
         'ok pending_vor_quoted=' || (max(ord) filter (where status = 'pending') < min(ord) filter (where status = 'quoted'))::text
         || ' quoted_vor_draft=' || (max(ord) filter (where status = 'quoted') < min(ord) filter (where status = 'draft'))::text
    from jsonb_array_elements_text(v_info) with ordinality as e(status, ord);
  perform pg_temp.zz_als('partner');
  perform pg_temp.zz_r('11b_partner_liste', format('select * from shop_quotes_admin(%L)', v_ed), 'authenticated');
  perform pg_temp.zz_als('team');
  perform pg_temp.zz_r('11c_team_storno', format('select shop_admin_set_status(%L, %L, %L)', rt[3], 'cancelled', 'Storno'), 'authenticated');
  insert into t_res values ('11_team_storno',
    'ok status=' || (select status from shop_order where id = rt[3])
    || ' reserviert=' || shop_order_reserved(rt[3], 'I-11329')::text
    || ' referenz=' || coalesce((select meta->>'closed' from external_ref where system = 'sevdesk' and object_type = 'shop_quote' and object_id = rt[3]), '-')
    || ' felder_leer=' || (select (quote_started_at is null and quote_valid_until is null)::text from shop_order where id = rt[3]));
  -- Gegenstück zum Teilindex: nach dem Storno ist wieder ein Entwurf in derselben Org-Edition möglich
  perform pg_temp.zz_r('11d_neuer_entwurf_nach_storno', format('insert into shop_order (org_edition_id, order_no, phase, status) values (%L, %L, %s, %L)', rt[2], 'MS-2999-9002', v_p, 'draft'));
  perform pg_temp.zz_als('partner');
  perform pg_temp.zz_r('11e_partner_storno', format('select shop_cancel(%L)', rg4[3]), 'authenticated');
  insert into t_res values ('11_partner_storno',
    'ok status=' || (select status from shop_order where id = rg4[3])
    || ' reserviert=' || shop_order_reserved(rg4[3], 'I-11329')::text
    || ' referenz=' || coalesce((select meta->>'closed' from external_ref where system = 'sevdesk' and object_type = 'shop_quote' and object_id = rg4[3]), '-')
    || ' felder_leer=' || (select (quote_started_at is null and quote_valid_until is null)::text from shop_order where id = rg4[3]));

  -- === 12 Phasenende und Rechnungslauf ===========================================================================================================
  perform pg_temp.zz_als('service');
  update deadline set due_at = now() - interval '1 hour' where edition_id = v_ed and key = 'shop_phase1_end';
  v_hk := run_shop_finalization();
  insert into t_res values ('12_phasenende',
    'ok p=' || (select status from shop_order where id = rp[3]) || ' g3=' || (select status from shop_order where id = rg3[3])
    || ' r=' || (select status from shop_order where id = rr[3]) || ' a=' || (select status from shop_order where id = ra[3])
    || ' f=' || (select status from shop_order where id = rf[3])
    || ' reserviert_p=' || shop_order_reserved(rp[3], 'I-11329')::text || ' reserviert_g3=' || shop_order_reserved(rg3[3], 'I-11329')::text
    || ' felder_leer_p=' || (select (quote_started_at is null and quote_valid_until is null)::text from shop_order where id = rp[3])
    || ' referenz_p=' || coalesce((select meta->>'closed' from external_ref where system = 'sevdesk' and object_type = 'shop_quote' and object_id = rp[3]), '-')
    || ' referenz_r=' || coalesce((select meta->>'closed' from external_ref where system = 'sevdesk' and object_type = 'shop_quote' and object_id = rr[3]), '-')
    || ' mails_a=' || (select count(*) from mail_log where template_key = 'shop_order_completed' and related_id = ra[3])::text);
  perform pg_temp.zz_als('team');
  v_json := pg_temp.zz_j(format('select jsonb_agg(to_jsonb(c)) from shop_invoice_candidates(%L) c', v_ed), 'authenticated');
  insert into t_res values ('13_rechnungslauf',
    'ok kandidat_a=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'org_id')::uuid = ra[1] and (e->'order_ids') ? ra[3]::text)::text
    || ' preis_aus_angebot=' || coalesce((select ((p->>'price_net_cents')::integer = v_preis_neu)::text
                                            from jsonb_array_elements(v_json) e, jsonb_array_elements(e->'positions') p
                                           where (e->>'org_id')::uuid = ra[1] and p->>'sku' = 'I-12346'), 'false')
    || ' p_fehlt=' || (not exists (select 1 from jsonb_array_elements(v_json) e where (e->>'org_id')::uuid = rp[1]))::text
    || ' g3_fehlt=' || (not exists (select 1 from jsonb_array_elements(v_json) e where (e->>'org_id')::uuid = rg3[1]))::text);
end $$;
insert into t_res
  select '99_auswertung',
         case when count(*) filter (where not z.erfuellt) = 0 then 'ok: alle ' || count(*)::text || ' Erwartungen erfüllt'
              else 'FEHLER: ' || string_agg(z.step, ', ' order by z.step) filter (where not z.erfuellt) end
    from (select e.step, exists (select 1 from t_res r where r.step = e.step and r.result ~ e.muster) as erfuellt from t_erw e) z;
select * from t_res order by step;
rollback;
