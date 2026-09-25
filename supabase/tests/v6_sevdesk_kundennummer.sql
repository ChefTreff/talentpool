-- Smoke-Test ADM-050 (SevDesk-Belege ueber die Kundennummer). Belegt:
--   01 **der Befund**: ein Partner mit Kundennummer, aber ohne SevDesk-Kennung
--      stand **nicht** in der Zielliste — er fiel still aus dem Abruf. Jetzt
--      steht er drin, mit seiner Nummer;
--   02 ein Partner mit SevDesk-Kennung steht weiter drin (nichts geht verloren);
--   03 ein Partner **ohne beides** bleibt draussen: drueben gibt es nichts zu
--      suchen, und eine Zeile ohne Anschluss waere nur Rauschen;
--   04 die schon abgelegten Dateinamen kommen weiterhin mit, damit der Lauf
--      nichts doppelt holt;
--   05 Rechte unveraendert: angemeldet ohne Partner-Team 42501, im
--      Servicekontext offen (so laeuft der naechtliche Abruf).
-- Der Test legt Organisationen an und rollt zurueck.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid;
  v_o1 uuid; v_o2 uuid; v_o3 uuid; v_oe1 uuid; v_n integer; v_txt text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select id into v_ed from event where is_edition and slug = 'fls27';

  perform set_config('request.jwt.claims', '', true);
  insert into organization (legal_name, communication_name, type, active, customer_number) values
    ('ZZTEST Nur Nummer GmbH', 'ZZTEST Nur Nummer', 'corporate', true, 'C-90501');
  insert into organization (legal_name, communication_name, type, active, sevdesk_contact_id) values
    ('ZZTEST Nur Kennung GmbH', 'ZZTEST Nur Kennung', 'corporate', true, '4711');
  insert into organization (legal_name, communication_name, type, active) values
    ('ZZTEST Ohne Beides GmbH', 'ZZTEST Ohne Beides', 'corporate', true);
  select id into v_o1 from organization where legal_name = 'ZZTEST Nur Nummer GmbH';
  select id into v_o2 from organization where legal_name = 'ZZTEST Nur Kennung GmbH';
  select id into v_o3 from organization where legal_name = 'ZZTEST Ohne Beides GmbH';
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_o1, v_ed, 'invited') returning id into v_oe1;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_o2, v_ed, 'invited'), (v_o3, v_ed, 'invited');
  insert into partner_asset (org_edition_id, kind, storage_path, filename, status)
  values (v_oe1, 'invoice', 'zz/1/4711.pdf', '4711.pdf', 'accepted');

  -- 05 Rechte
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin
    perform sevdesk_document_targets(v_ed);
    insert into t_res values ('05a_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('05a_ohne_recht', 'abgewiesen ' || sqlstate); end;
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_n from sevdesk_document_targets(v_ed);
  insert into t_res values ('05b_servicekontext', v_n::text || ' Ziele');

  -- 01 der Befund
  select coalesce(x.customer_number, '(keine)') || ' · Kennung ' || coalesce(x.sevdesk_contact_id, '(keine)')
    into v_txt from sevdesk_document_targets(v_ed) x where x.org_id = v_o1;
  insert into t_res values ('01_nur_nummer_dabei', coalesce(v_txt, 'FEHLT (BUG)'));

  -- 02 nichts verloren
  select count(*) into v_n from sevdesk_document_targets(v_ed) x where x.org_id = v_o2;
  insert into t_res values ('02_nur_kennung_bleibt', v_n::text || ' Zeile');

  -- 03 ohne beides
  select count(*) into v_n from sevdesk_document_targets(v_ed) x where x.org_id = v_o3;
  insert into t_res values ('03_ohne_beides_draussen', v_n::text || ' Zeile');

  -- 04 bekannte Dateien
  select array_to_string(x.bekannt, ',') into v_txt from sevdesk_document_targets(v_ed) x where x.org_id = v_o1;
  insert into t_res values ('04_bekannte_dateien', coalesce(nullif(v_txt, ''), '(leer)'));
end $$;

select * from t_res order by step;
rollback;

-- Lauf 25.09.2026 gegen jqmqvgaiyjudkvtncijw (Probelauf, zurueckgerollt): 6/6 gruen.
--   01 'C-90501 · Kennung (keine)' — der Partner, der vorher still fehlte, steht drin;
--   02 der mit Kennung bleibt (1 Zeile); 03 der ohne beides bleibt draussen (0 Zeilen);
--   04 bekannte Dateien kommen mit ('4711.pdf');
--   05a angemeldet ohne Partner-Team abgewiesen 42501, 05b Servicekontext 2 Ziele.
