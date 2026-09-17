-- Smoke-Test 0091 (Ansprechpartner und Zeiten). Belegt:
--   01 ohne Login ⇒ 28000;
--   02 **angemeldet, aber weder Partner-Kontakt noch Speakerin ⇒ leer** —
--      `my_contacts()` ist keine Teamliste für alle Angemeldeten;
--   03 Partner mit gesetztem Lead bekommt genau den;
--   04 Partner **ohne** gesetzten Lead bekommt den Standard — der Rückfall
--      greift nur innerhalb einer bestehenden Beziehung;
--   05 eine Speakerin bekommt ihre Zuordnung und nicht die der Partner;
--   06 private Mailadresse wird abgewiesen (CHECK);
--   07 leere Telefonnummer wird abgewiesen (Pflichtfeld);
--   08 ein zweiter Standard sticht den ersten, statt am Index zu scheitern;
--   09 Pflegen ohne Recht ⇒ 42501;
--   10 `edition_infos` gibt nur die eigene Zielgruppe (42501 für fremde);
--   11 die Tabellen haben keine Grants für `authenticated` — gelesen wird
--      ausschliesslich über die RPCs;
--   12 Teilupdate: was nicht mitkommt, bleibt stehen; `photo_path: ''` leert
--      ausdrücklich;
--   13 (Review 14.09.) Zuordnung prüft Typ und Edition des Kontakts ⇒ 22023 `invalid_contact`,
--      passende Zuordnung geht durch;
--   14 Anlegen ohne Pflichtfeld ⇒ 22023 `fields_required` statt 23502;
--   15 Domain-CHECK ist schreibungsunabhängig (Grossbuchstaben angenommen);
--   16 Auskünfte pflegt jede Bereichsleitung, Ansprechpartner nur Admin/Partner/Speaker (42501).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_oe uuid;
        v_lead uuid; v_buddy uuid; v_std uuid; v_sp uuid; v_n integer; v_txt text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  -- Die Testperson bringt aus den F5-Testdaten ein Speaker-Profil mit. Ohne
  -- diese Zeile war Schritt 02 „ohne Beziehung" gar nicht ohne Beziehung —
  -- die Funktion lieferte richtigerweise den Speaker-Standard, und der Test
  -- hätte einen Fehler gemeldet, den es nicht gibt.
  delete from speaker_profile where person_id = v_pid and edition_id = v_ed;

  -- 01 ohne Login
  begin
    perform my_contacts(v_ed);
    insert into t_res values ('01_ohne_login', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('01_ohne_login', 'abgewiesen ' || sqlstate); end;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- Wegwerf-Pool. Mailadressen sind Rollenpostfächer, keine Personen.
  insert into edition_contact (edition_id, type, display_name, email, phone, is_default, sort_order)
  values (v_ed, 'partner_lead',  'ZZTEST Lead Standard', 'zztest-lead@chef-treff.de',  '+49 40 000001', true, 1),
         (v_ed, 'partner_lead',  'ZZTEST Lead Eigen',    'zztest-eigen@chef-treff.de', '+49 40 000002', false, 2),
         (v_ed, 'partner_buddy', 'ZZTEST Buddy',         'zztest-buddy@chef-treff.de', '+49 40 000003', true, 1),
         (v_ed, 'speaker_lead',  'ZZTEST Speaker-Lead',  'zztest-sp@chef-treff.de',    '+49 40 000004', true, 1);
  select id into v_std   from edition_contact where display_name = 'ZZTEST Lead Standard';
  select id into v_lead  from edition_contact where display_name = 'ZZTEST Lead Eigen';
  select id into v_buddy from edition_contact where display_name = 'ZZTEST Buddy';

  -- 02 angemeldet, ohne jede Zuordnung
  select count(*) into v_n from my_contacts(v_ed);
  insert into t_res values ('02_ohne_beziehung',
    case when v_n = 0 then 'leer (richtig)' else 'ZEIGT ' || v_n || ' KONTAKTE (BUG)' end);

  -- Wegwerf-Organisation mit Kontaktrolle
  insert into organization (legal_name, communication_name, type)
  values ('ZZTEST Kontakt GmbH', 'ZZTEST Kontakt', 'corporate') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status)
  values (v_org, v_ed, 'invited') returning id into v_oe;
  insert into org_membership (org_id, person_id, roles) values (v_org, v_pid, array['primary_ops']);
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, valid_from)
  values (v_pid, 'partner_contact', 'org', v_org, v_ed, now() - interval '1 hour');

  -- 04 zuerst: noch nichts zugeordnet ⇒ Standard
  select display_name into v_txt from my_contacts(v_ed) where type = 'partner_lead';
  insert into t_res values ('04_rueckfall_standard',
    case when v_txt = 'ZZTEST Lead Standard' then 'Standard geliefert (richtig)'
         else 'unerwartet ' || coalesce(v_txt, 'leer') end);

  -- 03 eigene Zuordnung sticht den Standard
  update org_edition set lead_contact_id = v_lead, buddy_contact_id = v_buddy where id = v_oe;
  select display_name into v_txt from my_contacts(v_ed) where type = 'partner_lead';
  insert into t_res values ('03_eigene_zuordnung',
    case when v_txt = 'ZZTEST Lead Eigen' then 'eigener Lead (richtig)'
         else 'unerwartet ' || coalesce(v_txt, 'leer') end);
  select count(*) into v_n from my_contacts(v_ed);
  insert into t_res values ('03_zwei_karten',
    case when v_n = 2 then 'Lead und Buddy (richtig)' else 'unerwartet ' || v_n end);

  -- 05 Speakerin sieht ihre, nicht die der Partner
  select count(*) into v_n from my_contacts(v_ed) where type like 'speaker%';
  insert into t_res values ('05_ohne_speakerprofil',
    case when v_n = 0 then 'keine Speaker-Kontakte (richtig)' else 'ZEIGT SPEAKER-KONTAKTE (BUG)' end);
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, internal_notes)
  values (v_pid, v_ed, 'keynote', 'confirmed', 'zztest')
  on conflict (person_id, edition_id) do update set pipeline_status = 'confirmed'
  returning id into v_sp;
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, valid_from)
  values (v_pid, 'speaker', 'edition', null, v_ed, now() - interval '1 hour');
  select display_name into v_txt from my_contacts(v_ed) where type = 'speaker_lead';
  insert into t_res values ('05_mit_speakerprofil',
    case when v_txt = 'ZZTEST Speaker-Lead' then 'Speaker-Lead geliefert (richtig)'
         else 'unerwartet ' || coalesce(v_txt, 'leer') end);

  -- 06 private Mailadresse
  begin
    insert into edition_contact (edition_id, type, display_name, email, phone)
    values (v_ed, 'partner_lead', 'ZZTEST Privat', 'jemand@gmail.com', '+49 170 000000');
    insert into t_res values ('06_private_mail', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('06_private_mail', 'abgewiesen ' || sqlstate); end;

  -- 07 leere Nummer
  begin
    insert into edition_contact (edition_id, type, display_name, email, phone)
    values (v_ed, 'partner_lead', 'ZZTEST Ohne Nummer', 'zztest-x@chef-treff.de', '   ');
    insert into t_res values ('07_leere_nummer', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('07_leere_nummer', 'abgewiesen ' || sqlstate); end;

  -- 09 Pflegen ohne Recht
  begin
    perform upsert_edition_contact(jsonb_build_object(
      'edition_id', v_ed, 'type', 'partner_lead', 'display_name', 'ZZTEST Fremd',
      'email', 'zztest-f@chef-treff.de', 'phone', '+49 40 1'));
    insert into t_res values ('09_pflegen_ohne_recht', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('09_pflegen_ohne_recht', 'abgewiesen ' || sqlstate); end;

  -- 10 Auskünfte: die fremde Zielgruppe **vor** der Admin-Rolle prüfen.
  -- `my_kb_audiences()` gibt dem Team alle Zielgruppen — als Admin wäre der
  -- Schritt sinnlos grün geworden.
  insert into edition_info (edition_id, key, audience, label_de, value_de, sort_order)
  values (v_ed, 'zztest_oeffnung', array['partner'], 'Öffnungszeiten', 'Fr 12:00 – 20:00', 1);
  select count(*) into v_n from edition_infos('partner', v_ed);
  insert into t_res values ('10_eigene_zielgruppe',
    case when v_n >= 1 then 'geliefert (richtig)' else 'LEER (BUG)' end);
  begin
    perform edition_infos('volunteer', v_ed);
    insert into t_res values ('10_fremde_zielgruppe', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('10_fremde_zielgruppe', 'abgewiesen ' || sqlstate); end;

  -- 08 zweiter Standard sticht den ersten (als Admin)
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, valid_from)
  values (v_pid, 'admin', 'global', null, null, now() - interval '1 hour');
  begin
    perform upsert_edition_contact(jsonb_build_object(
      'id', v_lead::text, 'is_default', true));
    select count(*) into v_n from edition_contact
     where edition_id = v_ed and type = 'partner_lead' and is_default;
    select display_name into v_txt from edition_contact
     where edition_id = v_ed and type = 'partner_lead' and is_default;
    insert into t_res values ('08_ein_standard',
      case when v_n = 1 and v_txt = 'ZZTEST Lead Eigen' then 'umgehaengt, genau einer (richtig)'
           else 'unerwartet: ' || v_n || '/' || coalesce(v_txt, 'leer') end);
  exception when others then
    insert into t_res values ('08_ein_standard', 'FEHLER ' || sqlstate || ' ' || sqlerrm);
  end;

end $$;

-- 11 Grants: die Tabellen sind für `authenticated` zu.
insert into t_res
select '11_grants_' || t, case when has_table_privilege('authenticated', t, 'select')
                               then 'LESBAR (BUG)' else 'kein SELECT (richtig)' end
  from unnest(array['edition_contact', 'edition_info']) as t;

-- 12 Teilupdate über `upsert_edition_contact`
do $$
declare v_ed uuid; v_a uuid; v_txt text;
begin
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  v_a := upsert_edition_contact(jsonb_build_object('edition_id', v_ed, 'type', 'speaker_buddy',
    'display_name', 'ZZTEST Teil', 'email', 'zztest-t@chef-treff.de', 'phone', '+49 40 1',
    'role_label_de', 'Buddy', 'photo_path', 'a.png'));
  perform upsert_edition_contact(jsonb_build_object('id', v_a::text, 'phone', '+49 40 999'));
  select role_label_de || '|' || coalesce(photo_path, '-') || '|' || phone into v_txt
    from edition_contact where id = v_a;
  insert into t_res values ('12_teilupdate',
    case when v_txt = 'Buddy|a.png|+49 40 999' then 'Label und Bild bleiben (richtig)'
         else 'unerwartet ' || v_txt end);
  perform upsert_edition_contact(jsonb_build_object('id', v_a::text, 'photo_path', ''));
  select coalesce(photo_path, '-') into v_txt from edition_contact where id = v_a;
  insert into t_res values ('12_bild_leeren',
    case when v_txt = '-' then 'geleert (richtig)' else 'unerwartet ' || v_txt end);
end $$;

-- 13–16 (Review 14.09.): Zuordnungsprüfung, Pflichtfelder, Domain-Schreibung, Rechte je Rolle
do $$
declare v_pid uuid; v_ed uuid; v_ed2 uuid; v_oe uuid; v_sl uuid; v_fremd uuid; v_std uuid; v_n integer;
begin
  select p.id into v_pid from person p where p.auth_user_id is not null order by p.created_at limit 1;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select oe.id into v_oe from org_edition oe join organization o on o.id = oe.org_id
   where o.legal_name = 'ZZTEST Kontakt GmbH' and oe.edition_id = v_ed;
  select id into v_std from edition_contact where display_name = 'ZZTEST Lead Standard';
  v_sl := upsert_edition_contact(jsonb_build_object('edition_id', v_ed, 'type', 'speaker_lead',
    'display_name', 'ZZTEST SL', 'email', 'zztest-sl@chef-treff.de', 'phone', '+49 40 2'));

  -- 13a falscher Typ (Speaker-Lead als Partner-Lead)
  begin
    perform set_org_contacts(v_oe, v_sl, null);
    insert into t_res values ('13a_falscher_typ', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('13a_falscher_typ', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 13b Kontakt einer anderen Edition
  insert into event (name, slug, format_tag, is_edition, start_date, end_date, status)
  values ('ZZTEST Edition K', 'zztest-edition-k', 'edition', true, current_date - 800, current_date - 790, 'archived')
  returning id into v_ed2;
  insert into edition_contact (edition_id, type, display_name, email, phone)
  values (v_ed2, 'partner_lead', 'ZZTEST Fremdedition', 'zztest-fe@chef-treff.de', '+49 40 3') returning id into v_fremd;
  begin
    perform set_org_contacts(v_oe, v_fremd, null);
    insert into t_res values ('13b_fremde_edition', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('13b_fremde_edition', 'abgewiesen ' || sqlstate); end;

  -- 13c passende Zuordnung
  perform set_org_contacts(v_oe, v_std, null);
  select count(*) into v_n from org_edition where id = v_oe and lead_contact_id = v_std and buddy_contact_id is null;
  insert into t_res values ('13c_passend', case when v_n = 1 then 'gesetzt (richtig)' else 'NICHT GESETZT (BUG)' end);

  -- 14 Pflichtfeld fehlt
  begin
    perform upsert_edition_contact(jsonb_build_object('edition_id', v_ed, 'type', 'partner_lead',
      'display_name', 'ZZTEST Ohne Nummer 2', 'email', 'zztest-on@chef-treff.de'));
    insert into t_res values ('14_pflichtfeld', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('14_pflichtfeld', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 15 Grossbuchstaben in der Domain
  begin
    perform upsert_edition_contact(jsonb_build_object('edition_id', v_ed, 'type', 'partner_buddy',
      'display_name', 'ZZTEST Gross', 'email', 'ZZTEST-UP@CHEF-TREFF.DE', 'phone', '+49 40 4'));
    insert into t_res values ('15_domain_gross', 'angenommen (richtig)');
  exception when others then insert into t_res values ('15_domain_gross', 'ABGEWIESEN (BUG) ' || sqlstate); end;

  -- 16 Bereichsleitung Volunteers: Auskünfte ja, Ansprechpartner nein
  delete from role_assignment where person_id = v_pid and role = 'admin';
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, valid_from)
  values (v_pid, 'area_lead_volunteers', 'edition', null, v_ed, now() - interval '1 hour');
  begin
    perform upsert_edition_info(jsonb_build_object('edition_id', v_ed, 'key', 'zztest_treffpunkt',
      'audience', jsonb_build_array('volunteer'), 'label_de', 'Treffpunkt', 'value_de', 'Halle B'));
    insert into t_res values ('16a_info_bereichsleitung', 'erlaubt (richtig)');
  exception when others then insert into t_res values ('16a_info_bereichsleitung', 'ABGEWIESEN (BUG) ' || sqlstate); end;
  begin
    perform upsert_edition_contact(jsonb_build_object('id', v_sl::text, 'phone', '+49 40 5'));
    insert into t_res values ('16b_kontakt_bereichsleitung', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('16b_kontakt_bereichsleitung', 'abgewiesen ' || sqlstate); end;
end $$;

select * from t_res order by step;
rollback;

-- Lauf am 14.09. gegen Frankfurt: 15 + 2 Pruefungen gruen. Der Test hat dabei
-- einen echten Fehler gefunden: `upsert_edition_contact` haengte den alten
-- Standard **nach** dem Schreiben um, und der Teilindex duldet keinen zweiten
-- Standard — „bestehenden Kontakt zum Standard machen" scheiterte mit 23505.
-- Ausserdem drei falsche Annahmen im Test selbst: die Testperson bringt aus den
-- F5-Testdaten ein Speaker-Profil mit (Schritt 02 war also gar nicht „ohne
-- Beziehung"), und die fremde Zielgruppe in Schritt 10 wurde urspruenglich
-- **nach** der Admin-Rolle geprueft, wo `my_kb_audiences()` alles oeffnet.
-- Lauf am 15.09. nach dem Anwenden (Version 20260915113046): 24 Pruefungen gruen,
-- darunter 13a/13b (22023 invalid_contact), 14 (22023 fields_required),
-- 15 (Domain in Grossbuchstaben angenommen), 16a/16b (Bereichsleitung Volunteers:
-- Auskuenfte ja, Ansprechpartner 42501).
