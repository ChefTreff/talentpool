-- Test zu `v6_spalten_kontaktschluessel` (QS-075 / ADM-108). Belegt (nur über eigene ZZTEST-Zeilen):
--   01 die drei Spalten sind weg; `partner_overview` läuft weiter und gibt keine Logo-Schlüssel mehr aus, der Rest bleibt;
--   02 normalize_phone_e164: +49 / 0049 / führende 0 / „(0)“ / „+49 0…“ / Trennzeichen ⇒ +49…; ohne Land, zu kurz, Buchstaben, leer, null ⇒ null;
--   03 normalize_linkedin_url: Protokoll, www., Sprach-Subdomain, Großschreibung, Parameter, Schrägstrich; fremde Seite, /feed, leer ⇒ null;
--   04 Trigger: Insert mit phone/linkedin_url leitet ab; Änderung leitet neu ab; unlesbares Telefon ⇒ null ohne Fehler (phone bleibt);
--      phone leeren ⇒ phone_e164 leer; Update ohne diese Spalten ändert nichts;
--   05 direkte Schreibwege: Speaker-Profil (nur phone_e164) normalisiert lesbare Werte, **unlesbare bleiben wie getippt**;
--      Import (linkedin_normalized direkt): lesbar ⇒ kanonisch, sonst getrimmt in Kleinschrift; beide Spalten zugleich ⇒ direkter Wert gilt;
--   06 `update_person_master` (Admin-Stammdaten) leitet über denselben Trigger ab;
--   07 Backfill-Anweisungen: bei ausgeschaltetem Trigger angelegte Zeilen werden nachgezogen; Bestand hat keine ableitbare Lücke mehr;
--   08 Wirkung: zwei Personen mit verschieden geschriebener LinkedIn-Adresse und Telefon erscheinen nach `duplicate_scan` mit beiden Signalen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_me uuid; v_uid uuid; v_email text; v_txt text; v_n integer; v_org uuid; v_j jsonb;
  v_a uuid; v_b uuid; v_c uuid; v_d uuid; v_e uuid; v_f uuid; v_sig jsonb; v_ph text; v_li text; v_phone text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- Zeilen, wie sie vor der Migration aussahen (Trigger aus). Zuerst und mit Hauptadresse, damit `set constraints` die
  -- aufgeschobenen Prüfungen abarbeitet und der Trigger wieder eingeschaltet werden kann.
  alter table person disable trigger trg_person_contact_keys;
  insert into person (first_name, last_name, phone, linkedin_url) values ('Dora', 'Zzkontakt', '0171 4444444', 'linkedin.com/in/dora-zz') returning id into v_d;
  insert into person (first_name, last_name, phone_e164) values ('Emil', 'Zzkontakt', '0171 5555555') returning id into v_e;
  insert into person (first_name, last_name, phone, phone_e164) values ('Fritz', 'Zzkontakt', 'unlesbar', 'nach Absprache') returning id into v_f;
  insert into person_email (person_id, email, is_primary) values (v_d, 'dora@zzkontakt.test', true), (v_e, 'emil@zzkontakt.test', true), (v_f, 'fritz@zzkontakt.test', true);
  set constraints all immediate;
  set constraints all deferred;
  alter table person enable trigger trg_person_contact_keys;

  -- 01 · Spalten weg, partner_overview
  insert into organization (legal_name, communication_name) values ('ZZKONTAKT Org GmbH', 'ZZKONTAKT Org') returning id into v_org;
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and ((table_name = 'organization' and column_name in ('logo_dark', 'logo_light'))
      or (table_name = 'org_edition' and column_name = 'notes_internal'));
  v_j := partner_overview(v_org);
  insert into t_res values ('01_spalten_weg', 'spalten=' || v_n
    || ' logo_im_org=' || ((v_j -> 'org') ? 'logo_dark' or (v_j -> 'org') ? 'logo_light')::text
    || ' rest_da=' || ((v_j -> 'org') ? 'customer_number' and (v_j -> 'org') ? 'industry' and (v_j -> 'org') ? 'address' and (v_j -> 'org') ? 'description_de')::text
    || ' (erwartet spalten=0 logo_im_org=false rest_da=true)');

  -- 02 · Telefon
  insert into t_res values ('02_telefon',
    (select string_agg(coalesce(normalize_phone_e164(x), 'null'), ' | ' order by ord) from unnest(array[
      '+49 171 1234567', '0171 1234567', '0049 171 1234567', '+49 (0) 171 1234567', '+49 0171 1234567', '0171/123-45 67', '+43 664 1234567',
      '171 1234567', '+49 171', 'abc', '', '   ', null]) with ordinality as t(x, ord))
    || ' (erwartet +491711234567 | +491711234567 | +491711234567 | +491711234567 | +491711234567 | +491711234567 | +436641234567 | null | null | null | null | null | null)');

  -- 03 · LinkedIn
  insert into t_res values ('03_linkedin',
    (select string_agg(coalesce(normalize_linkedin_url(x), 'null'), ' | ' order by ord) from unnest(array[
      'https://www.linkedin.com/in/Max-Muster/?trk=abc', 'de.linkedin.com/in/max-muster', 'LINKEDIN.COM/IN/MAX-MUSTER/', 'linkedin.com/company/Acme-GmbH',
      'https://example.com/in/max-muster', 'https://notlinkedin.com/in/max', 'linkedin.com/feed', '', null]) with ordinality as t(x, ord))
    || ' (erwartet linkedin.com/in/max-muster ×3 | linkedin.com/company/acme-gmbh | null | null | null | null | null)');

  -- 04 · Trigger
  insert into person (first_name, last_name, phone, linkedin_url) values ('Anna', 'Zzkontakt', '0171 1234567', 'https://www.linkedin.com/in/Anna-Zzkontakt/') returning id into v_a;
  select phone_e164, linkedin_normalized into v_ph, v_li from person where id = v_a;
  v_txt := 'insert=' || coalesce(v_ph, 'null') || ',' || coalesce(v_li, 'null');
  update person set phone = '+49 40 1234567', linkedin_url = 'linkedin.com/in/anna-neu' where id = v_a;
  select phone_e164, linkedin_normalized into v_ph, v_li from person where id = v_a;
  v_txt := v_txt || ' neu=' || coalesce(v_ph, 'null') || ',' || coalesce(v_li, 'null');
  update person set phone = 'bitte anrufen', linkedin_url = 'https://example.com/anna' where id = v_a;
  select phone_e164, linkedin_normalized, phone into v_ph, v_li, v_phone from person where id = v_a;
  v_txt := v_txt || ' unlesbar=' || coalesce(v_ph, 'null') || ',' || coalesce(v_li, 'null') || ',phone=' || v_phone;
  insert into t_res values ('04a_trigger_ableiten', v_txt
    || ' (erwartet insert=+491711234567,linkedin.com/in/anna-zzkontakt neu=+49401234567,linkedin.com/in/anna-neu unlesbar=null,null,phone=bitte anrufen — ohne Fehler)');
  update person set phone = null, linkedin_url = null where id = v_a;
  select phone_e164, linkedin_normalized into v_ph, v_li from person where id = v_a;
  update person set first_name = 'Anne' where id = v_a;
  insert into t_res values ('04b_leer_und_fremdes_update', 'geleert=' || coalesce(v_ph, 'null') || ',' || coalesce(v_li, 'null')
    || ' nach_namens_update=' || (select coalesce(phone_e164, 'null') || ',' || coalesce(linkedin_normalized, 'null') from person where id = v_a)
    || ' (erwartet geleert=null,null nach_namens_update=null,null)');
  update person set phone = '0171 1234567' where id = v_a;
  update person set first_name = 'Anna' where id = v_a;
  insert into t_res values ('04c_fremdes_update_laesst_stehen', (select phone_e164 from person where id = v_a) || ' (erwartet +491711234567)');

  -- 05 · direkte Schreibwege
  insert into person (first_name, last_name) values ('Bernd', 'Zzkontakt') returning id into v_b;
  update person set phone_e164 = '+49 171 7654321' where id = v_b;
  v_txt := 'speaker_lesbar=' || (select phone_e164 from person where id = v_b);
  update person set phone_e164 = 'nach Absprache' where id = v_b;
  v_txt := v_txt || ' speaker_unlesbar=' || (select phone_e164 from person where id = v_b) || ' phone=' || coalesce((select phone from person where id = v_b), 'null');
  update person set phone_e164 = '' where id = v_b;
  v_txt := v_txt || ' speaker_leer=' || coalesce((select phone_e164 from person where id = v_b), 'null');
  update person set linkedin_normalized = 'https://DE.linkedin.com/in/Bernd-Zz/' where id = v_b;
  v_txt := v_txt || ' import_lesbar=' || (select linkedin_normalized from person where id = v_b);
  update person set linkedin_normalized = '  ZZTEST-Dublette-Key ' where id = v_b;
  v_txt := v_txt || ' import_sonst=' || (select linkedin_normalized from person where id = v_b);
  update person set phone = '0171 1111111', phone_e164 = '+49 171 2222222' where id = v_b;
  v_txt := v_txt || ' beide=' || (select phone_e164 from person where id = v_b);
  insert into t_res values ('05_direkte_schreibwege', v_txt
    || ' (erwartet speaker_lesbar=+491717654321 speaker_unlesbar=nach Absprache phone=null speaker_leer=null import_lesbar=linkedin.com/in/bernd-zz import_sonst=zztest-dublette-key beide=+491712222222)');

  -- 06 · Admin-Stammdaten
  insert into person (first_name, last_name) values ('Carla', 'Zzkontakt') returning id into v_c;
  perform update_person_master(v_c, '{"phone": "0049 171 3333333", "linkedin_url": "https://www.linkedin.com/in/Carla-Zz"}'::jsonb);
  insert into t_res values ('06_stammdaten_admin', (select phone_e164 || ',' || linkedin_normalized from person where id = v_c)
    || ' (erwartet +491713333333,linkedin.com/in/carla-zz)');

  -- 07 · Backfill (die Anweisungen der Migration, gegen die oben angelegten Altzeilen)
  update person set phone_e164 = normalize_phone_e164(phone)
   where phone is not null and phone_e164 is null and normalize_phone_e164(phone) is not null;
  update person set phone_e164 = normalize_phone_e164(phone_e164)
   where phone_e164 is not null and normalize_phone_e164(phone_e164) is not null and normalize_phone_e164(phone_e164) <> phone_e164;
  update person set linkedin_normalized = normalize_linkedin_url(linkedin_url)
   where linkedin_url is not null and linkedin_normalized is null and normalize_linkedin_url(linkedin_url) is not null;
  select count(*) into v_n from person where phone is not null and phone_e164 is null and normalize_phone_e164(phone) is not null;
  insert into t_res values ('07_backfill', 'dora=' || (select phone_e164 || ',' || linkedin_normalized from person where id = v_d)
    || ' emil=' || (select phone_e164 from person where id = v_e)
    || ' fritz=' || (select phone_e164 from person where id = v_f)
    || ' luecken_im_bestand=' || v_n
    || ' (erwartet dora=+491714444444,linkedin.com/in/dora-zz emil=+491715555555 fritz=nach Absprache luecken_im_bestand=0)');

  -- 08 · Wirkung auf duplicate_scan
  insert into person (first_name, last_name, phone, linkedin_url) values ('Gerd', 'Zzdublette', '0171 9999999', 'https://www.linkedin.com/in/Gerd-Zzdublette/') returning id into v_a;
  insert into person (first_name, last_name, phone, linkedin_url) values ('G.', 'Zzdublette-Zwei', '+49 171 999 9999', 'linkedin.com/in/gerd-zzdublette') returning id into v_b;
  perform duplicate_scan();
  select signals into v_sig from potential_duplicate
   where (person_id_a = v_a and person_id_b = v_b) or (person_id_a = v_b and person_id_b = v_a);
  insert into t_res values ('08_duplicate_scan', 'signale=' || coalesce((select string_agg(k, ',' order by k) from jsonb_object_keys(v_sig) k), 'KEIN PAAR')
    || ' (erwartet signale=linkedin,phone)');
end $$;
select * from t_res order by step;
rollback;
