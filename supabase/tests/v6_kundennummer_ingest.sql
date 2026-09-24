-- Smoke-Test ADM-057 (Kundennummer aus HubSpot). Belegt:
--   01 neue Firma mit Nummer: sie steht danach an der Organisation;
--   02 **dieselbe Nummer an einer zweiten Firma** endet im Gate
--      (`customer_number_taken:<nummer>`) — mit Fehlerdatensatz und **ohne** dass
--      die zweite Firma angelegt wird. Das ist der Fall aus der Praxis: in der
--      Stichprobe vom 25.09.2026 haengen 35 Nummern an mehr als einer Firma;
--   03 steht bei uns schon eine **andere** Nummer, gewinnt unsere (nur ergaenzen,
--      nie ueberschreiben) — und der Unterschied steht im Audit-Eintrag
--      (`customer_number_conflict`), damit ihn niemand still ausbuegelt;
--   04 steht bei uns **keine**, wird die aus HubSpot ergaenzt;
--   05 schickt HubSpot keine Nummer, passiert nichts — kein Fehler, kein Schreiben;
--   06 dieselbe Nummer an **derselben** Firma ist kein Gate-Fehler (sonst kaeme
--      kein Deal einer Bestandsfirma mehr durch).
-- Der Test legt Firmen und Deals an und rollt zurueck.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_json jsonb; v_org uuid; v_org2 uuid;
  v_txt text; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select id into v_ed from event where is_edition and slug = 'fls27';
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  perform set_edition_hubspot(v_ed, 'pipe-zztest', 'stage-zztest');
  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims', '', true);  -- ab hier Servicekontext

  -- 01 neue Firma mit Nummer
  v_json := ingest_partner_deal(jsonb_build_object(
    'deal', jsonb_build_object('id', 'zztest-deal-1', 'name', 'ZZTEST Eins', 'pipeline', 'pipe-zztest', 'stage', 'stage-zztest', 'owner_email', v_email),
    'company', jsonb_build_object('id', 'zztest-co-1', 'legal_name', 'ZZTEST Eins GmbH', 'communication_name', 'ZZTEST Eins',
                                  'street', 'Weg 1', 'zip', '20095', 'city', 'Hamburg', 'invoice_email', 'rechnung1@example.org',
                                  'customer_number', 'C-90001'),
    'contacts', jsonb_build_array(jsonb_build_object('id', 'k1', 'email', 'zztest1@example.org', 'first_name', 'A', 'last_name', 'B',
                                                     'roles', jsonb_build_array('primary_ops'))),
    'line_items', jsonb_build_array(jsonb_build_object('id', 'p1', 'sku', 'I-50131', 'qty', 1, 'unit_price_cents', 100))));
  v_org := (v_json->>'org_id')::uuid;
  insert into t_res values ('01_neu_mit_nummer',
    'ok=' || (v_json->>'ok') || ' nummer=' || coalesce((select customer_number from organization where id = v_org), '-'));

  -- 02 dieselbe Nummer, andere Firma → Gate
  v_json := ingest_partner_deal(jsonb_build_object(
    'deal', jsonb_build_object('id', 'zztest-deal-2', 'name', 'ZZTEST Zwei', 'pipeline', 'pipe-zztest', 'stage', 'stage-zztest', 'owner_email', v_email),
    'company', jsonb_build_object('id', 'zztest-co-2', 'legal_name', 'ZZTEST Zwei GmbH', 'communication_name', 'ZZTEST Zwei',
                                  'street', 'Weg 2', 'zip', '20095', 'city', 'Hamburg', 'invoice_email', 'rechnung2@example.org',
                                  'customer_number', 'C-90001'),
    'contacts', jsonb_build_array(jsonb_build_object('id', 'k2', 'email', 'zztest2@example.org', 'first_name', 'C', 'last_name', 'D',
                                                     'roles', jsonb_build_array('primary_ops'))),
    'line_items', jsonb_build_array(jsonb_build_object('id', 'p2', 'sku', 'I-50131', 'qty', 1, 'unit_price_cents', 100))));
  insert into t_res values ('02a_doppelt_gate',
    'ok=' || (v_json->>'ok') || ' ' || (select string_agg(e, ',' order by e) from jsonb_array_elements_text(v_json->'errors') e));
  select count(*) into v_n from organization where hubspot_id = 'zztest-co-2';
  insert into t_res values ('02b_nichts_angelegt', v_n::text || ' Firma');

  -- 03 unsere Nummer gewinnt, der Unterschied steht im Audit
  insert into organization (legal_name, communication_name, type, address_street, address_zip, address_city, hubspot_id, customer_number, active)
  values ('ZZTEST Drei GmbH', 'ZZTEST Drei', 'corporate', 'Weg 3', '20095', 'Hamburg', 'zztest-co-3', 'C-90003', true)
  returning id into v_org2;
  v_json := ingest_partner_deal(jsonb_build_object(
    'deal', jsonb_build_object('id', 'zztest-deal-3', 'name', 'ZZTEST Drei', 'pipeline', 'pipe-zztest', 'stage', 'stage-zztest', 'owner_email', v_email),
    'company', jsonb_build_object('id', 'zztest-co-3', 'legal_name', 'ZZTEST Drei GmbH', 'communication_name', 'ZZTEST Drei',
                                  'street', 'Weg 3', 'zip', '20095', 'city', 'Hamburg', 'invoice_email', 'rechnung3@example.org',
                                  'customer_number', 'C-99999'),
    'contacts', jsonb_build_array(jsonb_build_object('id', 'k3', 'email', 'zztest3@example.org', 'first_name', 'E', 'last_name', 'F',
                                                     'roles', jsonb_build_array('primary_ops'))),
    'line_items', jsonb_build_array(jsonb_build_object('id', 'p3', 'sku', 'I-50131', 'qty', 1, 'unit_price_cents', 100))));
  insert into t_res values ('03a_unsere_bleibt',
    'ok=' || (v_json->>'ok') || ' nummer=' || coalesce((select customer_number from organization where id = v_org2), '-'));
  select coalesce(a.after->>'customer_number', '-') || ' konflikt=' || coalesce(a.after->>'customer_number_conflict', '-')
    into v_txt from audit_log a
   where a.action = 'partner.ingest' and a.object_id = v_org2::text order by a.id desc limit 1;
  insert into t_res values ('03b_audit', coalesce(v_txt, 'kein Eintrag'));

  -- 04 leere Spalte wird ergaenzt
  insert into organization (legal_name, communication_name, type, address_street, address_zip, address_city, hubspot_id, active)
  values ('ZZTEST Vier GmbH', 'ZZTEST Vier', 'corporate', 'Weg 4', '20095', 'Hamburg', 'zztest-co-4', true)
  returning id into v_org2;
  v_json := ingest_partner_deal(jsonb_build_object(
    'deal', jsonb_build_object('id', 'zztest-deal-4', 'name', 'ZZTEST Vier', 'pipeline', 'pipe-zztest', 'stage', 'stage-zztest', 'owner_email', v_email),
    'company', jsonb_build_object('id', 'zztest-co-4', 'legal_name', 'ZZTEST Vier GmbH', 'communication_name', 'ZZTEST Vier',
                                  'street', 'Weg 4', 'zip', '20095', 'city', 'Hamburg', 'invoice_email', 'rechnung4@example.org',
                                  'customer_number', 'C-90004'),
    'contacts', jsonb_build_array(jsonb_build_object('id', 'k4', 'email', 'zztest4@example.org', 'first_name', 'G', 'last_name', 'H',
                                                     'roles', jsonb_build_array('primary_ops'))),
    'line_items', jsonb_build_array(jsonb_build_object('id', 'p4', 'sku', 'I-50131', 'qty', 1, 'unit_price_cents', 100))));
  insert into t_res values ('04_ergaenzt',
    'ok=' || (v_json->>'ok') || ' nummer=' || coalesce((select customer_number from organization where id = v_org2), '-'));

  -- 05 ohne Nummer aus HubSpot passiert nichts
  v_json := ingest_partner_deal(jsonb_build_object(
    'deal', jsonb_build_object('id', 'zztest-deal-5', 'name', 'ZZTEST Fuenf', 'pipeline', 'pipe-zztest', 'stage', 'stage-zztest', 'owner_email', v_email),
    'company', jsonb_build_object('id', 'zztest-co-5', 'legal_name', 'ZZTEST Fuenf GmbH', 'communication_name', 'ZZTEST Fuenf',
                                  'street', 'Weg 5', 'zip', '20095', 'city', 'Hamburg', 'invoice_email', 'rechnung5@example.org'),
    'contacts', jsonb_build_array(jsonb_build_object('id', 'k5', 'email', 'zztest5@example.org', 'first_name', 'I', 'last_name', 'J',
                                                     'roles', jsonb_build_array('primary_ops'))),
    'line_items', jsonb_build_array(jsonb_build_object('id', 'p5', 'sku', 'I-50131', 'qty', 1, 'unit_price_cents', 100))));
  insert into t_res values ('05_ohne_nummer',
    'ok=' || (v_json->>'ok') || ' nummer=' || coalesce((select customer_number from organization where hubspot_id = 'zztest-co-5'), '(leer)'));

  -- 06 dieselbe Nummer an derselben Firma ist kein Fehler
  v_json := ingest_partner_deal(jsonb_build_object(
    'deal', jsonb_build_object('id', 'zztest-deal-6', 'name', 'ZZTEST Eins erneut', 'pipeline', 'pipe-zztest', 'stage', 'stage-zztest', 'owner_email', v_email),
    'company', jsonb_build_object('id', 'zztest-co-1', 'legal_name', 'ZZTEST Eins GmbH', 'communication_name', 'ZZTEST Eins',
                                  'street', 'Weg 1', 'zip', '20095', 'city', 'Hamburg', 'invoice_email', 'rechnung1@example.org',
                                  'customer_number', 'C-90001'),
    'contacts', jsonb_build_array(jsonb_build_object('id', 'k1', 'email', 'zztest1@example.org', 'first_name', 'A', 'last_name', 'B',
                                                     'roles', jsonb_build_array('primary_ops'))),
    'line_items', jsonb_build_array(jsonb_build_object('id', 'p6', 'sku', 'I-50131', 'qty', 1, 'unit_price_cents', 100))));
  insert into t_res values ('06_dieselbe_firma',
    'ok=' || (v_json->>'ok') || ' ' || coalesce((select string_agg(e, ',' order by e) from jsonb_array_elements_text(v_json->'errors') e), 'ohne Fehler'));
end $$;

select * from t_res order by step;
rollback;

-- Lauf 25.09.2026 gegen jqmqvgaiyjudkvtncijw (Probelauf, zurueckgerollt): 8/8 gruen.
--   01 ok=true nummer=C-90001;
--   02a ok=false customer_number_taken:C-90001, 02b 0 Firma angelegt;
--   03a unsere C-90003 bleibt, 03b Audit 'C-90003 konflikt=true';
--   04 C-90004 ergaenzt; 05 nummer=(leer) ohne Fehler; 06 dieselbe Firma ohne Fehler.
