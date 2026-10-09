-- Smoke-Test v6_nachbuchung (Vorschlag, PART-102): Nachbuchungen im HubSpot-Abgleich — `org_product.nachgebucht_am`, Folge-Deal ohne Kontakte,
-- `partner_overview` liefert das Feld. Läuft mit `db.sh dry-run <migration> <test>`; alles wird zurückgerollt, Wegwerfdaten (Firma „ZZ Nachbuchung“).
-- Jede Prüfung hat ein Gegenstück (Erstbuchung neben Nachbuchung, Folge-Deal ohne Kontakte neben neuer Firma ohne Kontakte, ein Hauptkontakt neben
-- „anderer“ und „zwei“); „0 Treffer“ allein beweist nichts. Erwartung je Schritt als Muster in `t_erw`; `99_auswertung` am Ende.
--   01 Form: Spalte `nachgebucht_am` (timestamptz, leer erlaubt), `partner_overview` führt sie.
--   02 Erstbuchung: der erste Deal einer Firma setzt `nachgebucht_am` nirgends.
--   03 Folge-Deal ohne Kontakte und ohne Buchhaltungskontakt wird übernommen (Hauptkontakt und Rechnungs-E-Mail der Organisation gelten).
--   04 Nur die Leistungen des Folge-Deals tragen den Zeitpunkt; die des ersten Deals bleiben leer. 05 Dieselbe SKU in beiden Deals: zwei Zeilen,
--      Menge und Kontingent summieren.
--   06 Gegenstücke zum Gate: neue Firma ohne Kontakte fällt durch (Hauptkontakt und Rechnungs-E-Mail), anderer Hauptkontakt ⇒ `primary_conflict`,
--      zwei Hauptkontakte ⇒ `primary_contact_multiple`.
--   07 Wiederholung desselben Deals: `already`, nichts ändert sich, der Zeitpunkt bleibt. 08 Trifft eine Zeile auf eine vorhandene (gleiche
--      Line-Item-Id), bleibt ihr Zeitpunkt; eine neue Zeile im selben Deal bekommt ihn.
--   09 Org-Edition: der erste Deal bleibt, jeder Deal steht in `partner_deal`.
--   11 Rollen (Befund beim Bau): `sync_granted_roles` darf die Kontaktrolle `partner_contact` nicht beenden, wenn sich `org_product` ändert (Nachbuchung);
--      die von einem Produkt vergebene Rolle (`standbuehne_editor`) endet weiterhin, wenn das Produkt storniert wird; auch eine **ältere** Kontaktrolle
--      (angelegt vor dieser Transaktion: der Zweig „beenden“, nicht „löschen“) bleibt.
--   10 Portal-Sicht mit echtem Rollenwechsel (Hauptkontakt, `set local role authenticated`): `partner_overview.products[]` trägt das Feld, leer an
--      der Erstbuchung, gesetzt an der Nachbuchung; eine fremde Organisation 42501; der Ingest ist für Aufrufer gesperrt.
begin;
create temp table t_res (step text, result text) on commit drop;
create temp table t_erw (step text, muster text) on commit drop;
insert into t_erw values
  ('01_form', '^ok spalte=timestamp with time zone leer_erlaubt=true uebersicht_fuehrt_feld=true$'),
  ('02_erstbuchung', '^ok ok=true new_org=true nachbuchung=false produkte=3 nachgebucht_gesetzt=0$'),
  ('03_folgedeal_ohne_kontakte', '^ok ok=true already=false new_org=false nachbuchung=true produkte=2 kontakte=0$'),
  ('04_zeitpunkt', '^ok erste_leer=true neue_gesetzt=2 genau_jetzt=true$'),
  ('05_gleiche_sku', '^ok zeilen=2 menge=6\.00 nachgebucht=1 kontingent=partner=6$'),
  ('06_gate_neue_firma', '^ok ok=false kontakt_fehlt=true rechnung_fehlt=true org_angelegt=0$'),
  ('06_gate_anderer_hauptkontakt', '^ok ok=false fehler=primary_conflict$'),
  ('06_gate_zwei_hauptkontakte', '^ok ok=false fehler=primary_contact_multiple$'),
  ('07_wiederholung', '^ok already=true zeilen=5 zeitpunkt_blieb=true$'),
  ('08_gleiche_line_item_id', '^ok menge_neu=3\.00 zeitpunkt_blieb=true neue_zeile_gesetzt=true nachbuchung=true$'),
  ('09_org_edition', '^ok deals=3 erster_deal=deal-nb-1 org_editionen=1$'),
  ('10_portal_sicht', '^ok produkte=6 nachgebucht=3 erste_leer=true feld_in_jeder_zeile=true$'),
  ('10_fremde_org_und_ingest', '^ok fremde_org=rejected 42501 ingest=rejected 42501$'),
  ('11_kontaktrolle_bleibt', '^ok partner_contact=true standbuehne_editor=true$'),
  ('11_aeltere_kontaktrolle_bleibt', '^ok partner_contact=true$'),
  ('11_vergebene_rolle_endet', '^ok standbuehne_editor=false partner_contact=true$');

do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_claims text; v_ed uuid;
  v_org uuid; v_oe uuid; v_org_fremd uuid; v_deal jsonb; v_a jsonb; v_b jsonb; v_h jsonb; v_x jsonb; v_o jsonb;
  v_t0 timestamptz := now(); v_fest timestamptz := timestamptz '2026-01-01 10:00:00+00'; v_r text; v_p2 uuid;
begin
  -- Eine Person aus dem Bestand als Hauptkontakt der Testfirma; ohne Vorrechte (der Rollback stellt alles wieder her).
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  v_claims := json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text;
  delete from role_assignment where person_id = v_pid;
  select id into v_ed from event where is_edition and slug = 'fls27';

  -- Edition ↔ Pipeline setzt das Partner-Team; danach die Sicht des Ingests (keine Claims = service_role).
  perform set_config('request.jwt.claims', v_claims, true);
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  perform set_edition_hubspot(v_ed, 'pipe-nb', 'stage-nb');
  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims', '', true);

  -- === 01 Form ====================================================================================================
  insert into t_res values ('01_form',
    'ok spalte=' || (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'org_product' and column_name = 'nachgebucht_am')
    || ' leer_erlaubt=' || (select (is_nullable = 'YES')::text from information_schema.columns where table_schema = 'public' and table_name = 'org_product' and column_name = 'nachgebucht_am')
    || ' uebersicht_fuehrt_feld=' || (pg_get_functiondef('partner_overview(uuid, uuid)'::regprocedure) like '%nachgebucht_am%')::text);

  -- === 02 Erstbuchung: der erste Deal der Firma ======================================================================
  v_a := jsonb_build_object(
    'deal', jsonb_build_object('id', 'deal-nb-1', 'name', 'ZZ Nachbuchung 1', 'pipeline', 'pipe-nb', 'stage', 'stage-nb', 'url', 'https://app.hubspot.com/nb1', 'owner_email', 'owner@example.com'),
    'company', jsonb_build_object('id', 'co-nb', 'legal_name', 'ZZ Nachbuchung GmbH', 'communication_name', 'ZZ Nachbuchung', 'street', 'Weg 3', 'zip', '20095', 'city', 'Hamburg', 'country', 'DE', 'type', 'corporate'),
    'contacts', jsonb_build_array(
      jsonb_build_object('id', 'c1', 'email', v_email, 'first_name', 'Test', 'last_name', 'Person', 'roles', jsonb_build_array('primary_ops')),
      jsonb_build_object('id', 'c2', 'email', 'zz-nb-buchhaltung@example.com', 'first_name', 'Buch', 'last_name', 'Haltung', 'roles', jsonb_build_array('accounting'))),
    'line_items', jsonb_build_array(
      jsonb_build_object('id', 'la1', 'sku', 'I-50131', 'qty', 1, 'unit_price_cents', 1190000),
      jsonb_build_object('id', 'la2', 'sku', 'I-32776', 'qty', 4, 'unit_price_cents', 0),
      jsonb_build_object('id', 'la3', 'sku', 'I-79895', 'qty', 1, 'unit_price_cents', 500000)));
  v_x := ingest_partner_deal(v_a);
  v_org := (v_x->>'org_id')::uuid; v_oe := (v_x->>'org_edition_id')::uuid;
  insert into t_res values ('02_erstbuchung',
    'ok ok=' || (v_x->>'ok') || ' new_org=' || (v_x->>'new_org') || ' nachbuchung=' || (v_x->>'nachbuchung') || ' produkte=' || (v_x->>'products')
    || ' nachgebucht_gesetzt=' || (select count(*) from org_product where org_edition_id = v_oe and nachgebucht_am is not null)::text);

  -- === 03/04/05 Folge-Deal ohne Kontakte: gleiche Firma, eine SKU doppelt (Tickets), eine neu (Company Tour) ============
  v_b := jsonb_build_object(
    'deal', jsonb_build_object('id', 'deal-nb-2', 'name', 'ZZ Nachbuchung 2', 'pipeline', 'pipe-nb', 'stage', 'stage-nb', 'url', 'https://app.hubspot.com/nb2', 'owner_email', 'owner@example.com'),
    'company', v_a->'company',
    'contacts', '[]'::jsonb,
    'line_items', jsonb_build_array(
      jsonb_build_object('id', 'lb1', 'sku', 'I-32776', 'qty', 2, 'unit_price_cents', 0),
      jsonb_build_object('id', 'lb2', 'sku', 'I-85973', 'qty', 1, 'unit_price_cents', 250000)));
  v_x := ingest_partner_deal(v_b);
  insert into t_res values ('03_folgedeal_ohne_kontakte',
    'ok ok=' || coalesce(v_x->>'ok', '?') || ' already=' || coalesce(v_x->>'already', '?') || ' new_org=' || coalesce(v_x->>'new_org', '?') || ' nachbuchung=' || coalesce(v_x->>'nachbuchung', '?')
    || ' produkte=' || coalesce(v_x->>'products', '?') || ' kontakte=' || coalesce(v_x->>'contacts', '?'));
  insert into t_res values ('04_zeitpunkt',
    'ok erste_leer=' || (not exists (select 1 from org_product where org_edition_id = v_oe and hubspot_line_item_id in ('la1', 'la2', 'la3') and nachgebucht_am is not null))::text
    || ' neue_gesetzt=' || (select count(*) from org_product where org_edition_id = v_oe and hubspot_line_item_id in ('lb1', 'lb2') and nachgebucht_am is not null)::text
    || ' genau_jetzt=' || (select coalesce(bool_and(nachgebucht_am = v_t0), false) from org_product where org_edition_id = v_oe and hubspot_line_item_id in ('lb1', 'lb2'))::text);
  insert into t_res values ('05_gleiche_sku',
    'ok zeilen=' || (select count(*) from org_product where org_edition_id = v_oe and product_sku = 'I-32776')::text
    || ' menge=' || (select sum(qty)::text from org_product where org_edition_id = v_oe and product_sku = 'I-32776')
    || ' nachgebucht=' || (select count(*) from org_product where org_edition_id = v_oe and product_sku = 'I-32776' and nachgebucht_am is not null)::text
    || ' kontingent=' || coalesce((select string_agg(pass_type || '=' || quantity::text, ',') from org_ticket_allocation where org_id = v_org and event_id = v_ed and status <> 'disabled'), 'keins'));

  -- === 06 Gegenstücke zum Gate ======================================================================================
  -- Neue Firma, keine Kontakte: weder Hauptkontakt noch Rechnungs-E-Mail — der Folge-Deal-Weg gilt nur für eine Organisation mit Hauptkontakt.
  v_deal := jsonb_build_object(
    'deal', jsonb_build_object('id', 'deal-nb-neu', 'name', 'ZZ Neue Firma', 'pipeline', 'pipe-nb', 'stage', 'stage-nb', 'owner_email', 'owner@example.com'),
    'company', jsonb_build_object('id', 'co-nb-neu', 'legal_name', 'ZZ Neue Firma GmbH', 'communication_name', 'ZZ Neue Firma', 'street', 'Weg 4', 'zip', '20095', 'city', 'Hamburg'),
    'contacts', '[]'::jsonb,
    'line_items', jsonb_build_array(jsonb_build_object('id', 'ln1', 'sku', 'I-50131', 'qty', 1)));
  v_x := ingest_partner_deal(v_deal);
  insert into t_res values ('06_gate_neue_firma',
    'ok ok=' || (v_x->>'ok') || ' kontakt_fehlt=' || ((v_x->'errors') @> '"primary_contact_missing"'::jsonb)::text
    || ' rechnung_fehlt=' || ((v_x->'errors') @> '"invoice_email_missing"'::jsonb)::text
    || ' org_angelegt=' || (select count(*) from organization where hubspot_id = 'co-nb-neu')::text);
  -- Gleiche Firma, anderer Hauptkontakt.
  v_deal := jsonb_build_object('deal', jsonb_build_object('id', 'deal-nb-anders', 'name', 'ZZ Anderer', 'pipeline', 'pipe-nb', 'stage', 'stage-nb', 'owner_email', 'owner@example.com'),
    'company', v_a->'company',
    'contacts', jsonb_build_array(jsonb_build_object('id', 'cx', 'email', 'zz-nb-anderer@example.com', 'first_name', 'And', 'last_name', 'Erer', 'roles', jsonb_build_array('primary_ops'))),
    'line_items', jsonb_build_array(jsonb_build_object('id', 'lx1', 'sku', 'I-85973', 'qty', 1)));
  v_x := ingest_partner_deal(v_deal);
  insert into t_res values ('06_gate_anderer_hauptkontakt',
    'ok ok=' || (v_x->>'ok') || ' fehler=' || (select string_agg(e, ',' order by e) from jsonb_array_elements_text(v_x->'errors') e));
  -- Gleiche Firma, zwei Hauptkontakte (beide mit der Adresse des vorhandenen: es bleibt allein „mehrere“).
  v_deal := jsonb_build_object('deal', jsonb_build_object('id', 'deal-nb-zwei', 'name', 'ZZ Zwei', 'pipeline', 'pipe-nb', 'stage', 'stage-nb', 'owner_email', 'owner@example.com'),
    'company', v_a->'company',
    'contacts', jsonb_build_array(
      jsonb_build_object('id', 'cy1', 'email', v_email, 'first_name', 'Test', 'last_name', 'Person', 'roles', jsonb_build_array('primary_ops')),
      jsonb_build_object('id', 'cy2', 'email', v_email, 'first_name', 'Test', 'last_name', 'Person', 'roles', jsonb_build_array('primary_ops'))),
    'line_items', jsonb_build_array(jsonb_build_object('id', 'ly1', 'sku', 'I-85973', 'qty', 1)));
  v_x := ingest_partner_deal(v_deal);
  insert into t_res values ('06_gate_zwei_hauptkontakte',
    'ok ok=' || (v_x->>'ok') || ' fehler=' || (select string_agg(e, ',' order by e) from jsonb_array_elements_text(v_x->'errors') e));

  -- === 07 Wiederholung des Folge-Deals: nichts ändert sich, der Zeitpunkt bleibt ======================================
  update org_product set nachgebucht_am = v_fest where org_edition_id = v_oe and hubspot_line_item_id in ('lb1', 'lb2');
  v_x := ingest_partner_deal(v_b);
  insert into t_res values ('07_wiederholung',
    'ok already=' || (v_x->>'already') || ' zeilen=' || (select count(*) from org_product where org_edition_id = v_oe)::text
    || ' zeitpunkt_blieb=' || (select bool_and(nachgebucht_am = v_fest) from org_product where org_edition_id = v_oe and hubspot_line_item_id in ('lb1', 'lb2'))::text);

  -- === 08 Dritter Deal: eine Zeile trifft auf eine vorhandene Line-Item-Id, eine ist neu ===============================
  v_h := jsonb_build_object(
    'deal', jsonb_build_object('id', 'deal-nb-3', 'name', 'ZZ Nachbuchung 3', 'pipeline', 'pipe-nb', 'stage', 'stage-nb', 'url', 'https://app.hubspot.com/nb3', 'owner_email', 'owner@example.com'),
    'company', v_a->'company',
    'contacts', '[]'::jsonb,
    'line_items', jsonb_build_array(
      jsonb_build_object('id', 'lb1', 'sku', 'I-32776', 'qty', 3, 'unit_price_cents', 0),
      jsonb_build_object('id', 'lc1', 'sku', 'I-85973', 'qty', 1, 'unit_price_cents', 250000)));
  v_x := ingest_partner_deal(v_h);
  insert into t_res values ('08_gleiche_line_item_id',
    'ok menge_neu=' || (select qty::text from org_product where org_edition_id = v_oe and hubspot_line_item_id = 'lb1')
    || ' zeitpunkt_blieb=' || (select (nachgebucht_am = v_fest)::text from org_product where org_edition_id = v_oe and hubspot_line_item_id = 'lb1')
    || ' neue_zeile_gesetzt=' || (select (nachgebucht_am is not null and nachgebucht_am <> v_fest)::text from org_product where org_edition_id = v_oe and hubspot_line_item_id = 'lc1')
    || ' nachbuchung=' || (v_x->>'nachbuchung'));

  -- === 09 Org-Edition und Deals ======================================================================================
  insert into t_res values ('09_org_edition',
    'ok deals=' || (select count(*) from partner_deal where org_edition_id = v_oe)::text
    || ' erster_deal=' || (select hubspot_deal_id from org_edition where id = v_oe)
    || ' org_editionen=' || (select count(*) from org_edition where org_id = v_org and edition_id = v_ed)::text);

  -- === 10 Portal-Sicht: der Hauptkontakt sieht die Leistungen mit dem Zeitpunkt (echter Rollenwechsel) =================
  insert into organization (legal_name, communication_name, type) values ('ZZ Nachbuchung Fremd GmbH', 'ZZ Nachbuchung Fremd', 'corporate') returning id into v_org_fremd;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org_fremd, v_ed, 'invited');
  perform set_config('request.jwt.claims', v_claims, true);
  execute 'set local role authenticated';
  v_o := partner_overview(v_org, v_ed);
  begin perform partner_overview(v_org_fremd, v_ed); v_r := 'ALLOWED (BUG)';
  exception when others then v_r := 'rejected ' || sqlstate; end;
  begin perform ingest_partner_deal(v_h); v_deal := to_jsonb('ALLOWED (BUG)'::text);
  exception when others then v_deal := to_jsonb('rejected ' || sqlstate); end;
  execute 'reset role';
  insert into t_res values ('10_portal_sicht',
    'ok produkte=' || jsonb_array_length(v_o->'products')::text
    || ' nachgebucht=' || (select count(*) from jsonb_array_elements(v_o->'products') p where p->>'nachgebucht_am' is not null)::text
    || ' erste_leer=' || (select coalesce(bool_and(p->>'nachgebucht_am' is null), false) from jsonb_array_elements(v_o->'products') p where p->>'sku' in ('I-50131', 'I-79895'))::text
    || ' feld_in_jeder_zeile=' || (select bool_and(p ? 'nachgebucht_am') from jsonb_array_elements(v_o->'products') p)::text);
  insert into t_res values ('10_fremde_org_und_ingest', 'ok fremde_org=' || v_r || ' ingest=' || (v_deal #>> '{}'));

  -- === 11 Rollen: die Kontaktrolle überlebt Änderungen an org_product, die von einem Produkt vergebene Rolle endet mit dem Produkt =========
  insert into t_res values ('11_kontaktrolle_bleibt',
    'ok partner_contact=' || exists (select 1 from role_assignment ra where ra.person_id = v_pid and ra.role = 'partner_contact' and ra.scope_type = 'org' and ra.scope_id = v_org
                                        and (ra.valid_to is null or ra.valid_to > now()))::text
    || ' standbuehne_editor=' || exists (select 1 from role_assignment ra where ra.person_id = v_pid and ra.role = 'standbuehne_editor' and ra.scope_type = 'org' and ra.scope_id = v_org
                                        and (ra.valid_to is null or ra.valid_to > now()))::text);
  -- Eine ältere Kontaktrolle (Notiz 'hubspot', gestern angelegt): ohne die Änderung beendete der Zweig „beenden“ sie, sobald sich org_product ändert.
  insert into person (first_name, last_name) values ('ZZ', 'Alter Kontakt') returning id into v_p2;
  insert into org_membership (person_id, org_id, roles) values (v_p2, v_org, '{additional}');
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, valid_from, valid_to, note)
    values (v_p2, 'partner_contact', 'org', v_org, v_ed, now() - interval '1 day', now() + interval '1 year', 'hubspot');
  update org_product set status = 'booked' where org_edition_id = v_oe and hubspot_line_item_id = 'la1'; -- der Trigger hängt an `update of status`
  insert into t_res values ('11_aeltere_kontaktrolle_bleibt',
    'ok partner_contact=' || exists (select 1 from role_assignment ra where ra.person_id = v_p2 and ra.role = 'partner_contact' and ra.scope_type = 'org' and ra.scope_id = v_org
                                        and (ra.valid_to is null or ra.valid_to > now()))::text);
  update org_product set status = 'cancelled' where org_edition_id = v_oe and hubspot_line_item_id = 'la3';
  insert into t_res values ('11_vergebene_rolle_endet',
    'ok standbuehne_editor=' || exists (select 1 from role_assignment ra where ra.person_id = v_pid and ra.role = 'standbuehne_editor' and ra.scope_type = 'org' and ra.scope_id = v_org
                                        and (ra.valid_to is null or ra.valid_to > now()))::text
    || ' partner_contact=' || exists (select 1 from role_assignment ra where ra.person_id = v_pid and ra.role = 'partner_contact' and ra.scope_type = 'org' and ra.scope_id = v_org
                                        and (ra.valid_to is null or ra.valid_to > now()))::text);
end $$;
insert into t_res
  select '99_auswertung',
         case when count(*) filter (where not z.erfuellt) = 0 then 'ok: alle ' || count(*)::text || ' Erwartungen erfüllt'
              else 'FEHLER: ' || string_agg(z.step, ', ' order by z.step) filter (where not z.erfuellt) end
    from (select e.step, exists (select 1 from t_res r where r.step = e.step and r.result ~ e.muster) as erfuellt from t_erw e) z;
select * from t_res order by step;
rollback;
