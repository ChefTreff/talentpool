-- Smoke-Test v6_speaker_audit_feldnamen (Vorschlag, SPK-094): ändert die **Assistenz** ein Speaker-Profil, protokolliert `update_my_speaker_profile` unter
-- `speaker.assistant_update` nur die **Namen der tatsächlich geänderten Felder** (sortiert) und die `person_id` der Speakerin — nie einen Wert; ohne Änderung entsteht kein
-- Eintrag, und schreibt die Speakerin selbst, bleibt es wie bisher bei keinem. Mit echtem Rollenwechsel: die handelnde Person ist ein Konto aus dem Bestand (`current_person_id()`
-- kommt aus den JWT-Claims) — für die Speakerinnen X1 … X5 die Assistenz, für ihr eigenes Profil die Speakerin selbst. Je Szenario ein eigenes Profil: so steht in `audit_log`
-- genau der eine Eintrag, den der Schritt erzeugt. Wegwerfdaten (ZZ …), alles wird zurückgerollt. Erwartung je Schritt als Muster in `t_erw`; `99_auswertung` am Ende.
--   00 Form (unverändert): `anon` ohne EXECUTE, `authenticated` ja; DEFINER mit gepinntem `search_path`.
--   01 Drei Felder (Vorname, Telefon, kurze Bio) ⇒ **ein** Eintrag mit genau diesen drei Namen, die `person_id` der Speakerin, `before` leer, die Assistenz als Akteurin — und **kein
--      eingegebener Wert** im Eintrag (weder Name noch Nummer noch Bio).
--   02 Dieselben Werte noch einmal, mit Leerzeichen drumherum, oder nur die `id` ⇒ kein weiterer Eintrag.
--   03 Alle Arten Feld in einem Aufruf (Person, Auftritt, Links, Technik, Kontakt samt Einwilligungsdatum) ⇒ die 17 Namen, sortiert, ohne einen Wert — und derselbe Aufruf noch
--      einmal ⇒ kein weiterer Eintrag (jedes Feld wird mit **seinem** alten Wert verglichen; die 17 Werte sind alle verschieden).
--   04 Eine ungültige Sprache ist keine Änderung (kein Eintrag), Links und Technik, die kein Objekt sind, auch nicht, dieselbe Sprache auch nicht, eine andere gültige ⇒ genau
--      `preferred_language`.
--   05 Schreibt die Speakerin selbst ⇒ der Wert steht im Profil, es gibt keinen Eintrag. 06 Die Funktion schreibt weiter, was sie schrieb (Person, Telefon samt Ableitung, Bio, Kontakt).
--   07 Ein abgewiesener Aufruf hinterlässt nichts: Kontakt ohne Einwilligung (22023, der Vorname wird nicht gespeichert), fremdes Profil (P0002). 08 Ohne Anmeldung 28000; als `anon` 42501.
-- Probelauf der Build-Session am 09.10.2026 gegen die Live-Datenbank nach 0300 (`sh scripts/db.sh dry-run`, alles zurückgerollt): 9 von 9 Erwartungen erfüllt. Ohne die Migration (`sh scripts/db.sh test`)
-- sind 01 bis 04 rot — die Funktion schreibt den ganzen Eingabeblock mit Werten ins Audit (Schritt 01: `ohne_werte=false`) und einen Eintrag je Aufruf; 00 und 05 bis 08 gelten schon heute (sie halten fest,
-- was sich nicht ändern darf). Mutationsproben an der Migration (28, je Regel eine — Stand vor und nach dem Schreiben, Eingabeblock oder Wert im Audit, `person_id`, `before`, kein Eintrag ohne Änderung, Sortierung,
-- nur die Assistenz, Sprache, Links und Technik als Objekt, jedes Feld mit seinem eigenen alten Wert, Aktion, Objekt, Rechte, Einwilligung): alle 28 rot. `fn-diff`: eine verschwindende Zeile (der alte
-- `log_audit`-Aufruf), ersetzt.
begin;
create temp table t_res (step text, result text) on commit drop;
create temp table t_erw (step text, muster text) on commit drop;
insert into t_erw values
  ('00_form', '^ok update_anon=false authenticated=true definer=true pfad=true$'),
  ('01_felder_ohne_werte', '^ok speichern=ok eintraege=1 felder=bio_short_en,first_name,phone person_id=true before_null=true akteur=true ohne_werte=true$'),
  ('02_ohne_aenderung', '^ok gleich=1 getrimmt=1 nur_id=1$'),
  ('03_alle_arten', '^ok speichern=ok eintraege=1 felder=bio_long_de,bio_long_en,bio_short_de,contact_consent_at,contact_email,contact_first_name,contact_kind,contact_last_name,contact_phone,job_title,last_name,linkedin_url,organization_name,preferred_language,socials,tech_rider,title anzahl=17 ohne_werte=true wiederholt=1$'),
  ('04_sprache', '^ok fr=0 kein_objekt=0 gleich=0 de=1 felder=preferred_language$'),
  ('05_speakerin_selbst', '^ok speichern=ok eintraege=0 job_title=ZZ Selbst$'),
  ('06_schreibt_weiter', '^ok vorname=ZZAuditNeu telefon=0171 9990001 e164=\+491719990001 bio=ZZ Bio Audit geheim kontakt=zz-kontakt@example\.org/ZZKontakt titel=Dr\.$'),
  ('07_abgewiesen', '^ok ohne_einwilligung=22023 speaker_contact_consent_required eintraege=0 vorname=Xaver fremd=P0002 speaker_not_found fremd_eintraege=0$'),
  ('08_anmeldung', '^ok ohne_anmeldung=28000 not authenticated anon=42501$');

-- Hilfen: Aufruf als Text (`ok` oder `SQLSTATE meldung`), die Einträge eines Profils lesen, eine neue Speakerin mit der Assistenz T anlegen.
create function pg_temp.speichern(p_data jsonb) returns text language plpgsql as $$
begin
  perform update_my_speaker_profile(p_data);
  return 'ok';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;

create function pg_temp.eintraege(p_profil uuid) returns integer language sql as $$
  select count(*)::integer from audit_log where action = 'speaker.assistant_update' and object_id = p_profil::text
$$;

-- Die Namen aus `after.felder` in der gespeicherten Reihenfolge (`with ordinality`), kommagetrennt.
create function pg_temp.felder(p_profil uuid) returns text language sql as $$
  select (select string_agg(x, ',' order by ord) from jsonb_array_elements_text(a.after->'felder') with ordinality as t(x, ord))
    from audit_log a where a.action = 'speaker.assistant_update' and a.object_id = p_profil::text limit 1
$$;

-- Steht keiner der Werte (als Teilstring) in Vorher oder Nachher des Eintrags?
create function pg_temp.ohne_werte(p_profil uuid, variadic p_werte text[]) returns boolean language sql as $$
  select not exists (select 1 from audit_log a, unnest(p_werte) w
                      where a.action = 'speaker.assistant_update' and a.object_id = p_profil::text
                        and position(w in coalesce(a.before::text, '') || a.after::text) > 0)
$$;

create function pg_temp.neu(p_name text, p_assistent uuid, p_ed uuid, out o_person uuid, out o_profil uuid) language plpgsql as $$
begin
  insert into person (first_name, last_name, preferred_language) values ('Xaver', p_name, 'en') returning id into o_person;
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at, assistant_person_id)
  values (o_person, p_ed, 'panelist', 'confirmed', now(), p_assistent) returning id into o_profil;
end $$;

do $$
declare
  v_ed uuid; v_pt uuid; v_ut uuid; v_claims text; v_so uuid;
  v_p1 uuid; v_s1 uuid; v_p3 uuid; v_s3 uuid; v_p4 uuid; v_s4 uuid; v_p5 uuid; v_s5 uuid; v_pz uuid; v_sz uuid;
  v_r text; v_r2 text; v_r3 text; v_n integer; v_n2 integer; v_n3 integer; v_n4 integer; v_a audit_log%rowtype; v_pl jsonb;
begin
  -- ---- Aufbau: T (ein Konto aus dem Bestand) mit eigenem Profil O und als Assistenz von X1, X3, X4, X5; Z: fremdes Profil.
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select p.id, p.auth_user_id into v_pt, v_ut from person p where p.auth_user_id is not null order by p.created_at limit 1;
  select sp.id into v_so from speaker_profile sp where sp.person_id = v_pt and sp.edition_id = v_ed;
  if v_so is null then
    insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at)
    values (v_pt, v_ed, 'keynote', 'confirmed', now()) returning id into v_so;
  end if;
  delete from speaker_portal_selection where person_id = v_pt;
  select * into v_p1, v_s1 from pg_temp.neu('ZZAudit 1', v_pt, v_ed);
  select * into v_p3, v_s3 from pg_temp.neu('ZZAudit 3', v_pt, v_ed);
  select * into v_p4, v_s4 from pg_temp.neu('ZZAudit 4', v_pt, v_ed);
  select * into v_p5, v_s5 from pg_temp.neu('ZZAudit 5', v_pt, v_ed);
  select * into v_pz, v_sz from pg_temp.neu('ZZAudit Z', null, v_ed);

  v_claims := json_build_object('sub', v_ut, 'role', 'authenticated')::text;
  perform set_config('request.jwt.claims', v_claims, true);

  -- ---- 00 Form
  insert into t_res values ('00_form',
    'ok update_anon=' || has_function_privilege('anon', 'update_my_speaker_profile(jsonb)', 'execute')::text
    || ' authenticated=' || has_function_privilege('authenticated', 'update_my_speaker_profile(jsonb)', 'execute')::text
    || ' definer=' || (select p.prosecdef from pg_proc p where p.oid = 'update_my_speaker_profile(jsonb)'::regprocedure)::text
    || ' pfad=' || (select coalesce(p.proconfig::text, '') like '%search_path=%' from pg_proc p where p.oid = 'update_my_speaker_profile(jsonb)'::regprocedure)::text);

  -- ---- 01 Drei Felder, kein Wert im Eintrag
  v_r := pg_temp.speichern(jsonb_build_object('id', v_s1, 'first_name', 'ZZAuditNeu', 'phone', '0171 9990001', 'bio_short_en', 'ZZ Bio Audit geheim'));
  select * into v_a from audit_log where action = 'speaker.assistant_update' and object_id = v_s1::text limit 1;
  insert into t_res values ('01_felder_ohne_werte',
    'ok speichern=' || v_r || ' eintraege=' || pg_temp.eintraege(v_s1) || ' felder=' || coalesce(pg_temp.felder(v_s1), 'NULL')
    || ' person_id=' || coalesce((v_a.after->>'person_id' = v_p1::text)::text, 'NULL') || ' before_null=' || (v_a.before is null)::text
    || ' akteur=' || coalesce((v_a.actor_person_id = v_pt)::text, 'NULL')
    || ' ohne_werte=' || pg_temp.ohne_werte(v_s1, 'ZZAuditNeu', '9990001', 'ZZ Bio Audit geheim')::text);

  -- ---- 02 Ohne Änderung kein weiterer Eintrag
  v_r := pg_temp.speichern(jsonb_build_object('id', v_s1, 'first_name', 'ZZAuditNeu', 'phone', '0171 9990001', 'bio_short_en', 'ZZ Bio Audit geheim'));
  v_n := pg_temp.eintraege(v_s1);
  v_r := pg_temp.speichern(jsonb_build_object('id', v_s1, 'first_name', '  ZZAuditNeu '));
  v_n2 := pg_temp.eintraege(v_s1);
  v_r := pg_temp.speichern(jsonb_build_object('id', v_s1));
  v_n3 := pg_temp.eintraege(v_s1);
  insert into t_res values ('02_ohne_aenderung', 'ok gleich=' || v_n || ' getrimmt=' || v_n2 || ' nur_id=' || v_n3);

  -- ---- 03 Alle Arten Feld in einem Aufruf
  v_pl := jsonb_build_object('id', v_s3,
    'last_name', 'ZZ Neu', 'title', 'Dr.', 'linkedin_url', 'https://www.linkedin.com/in/zz-audit', 'preferred_language', 'de',
    'job_title', 'ZZ Job', 'organization_name', 'ZZ Org', 'bio_short_de', 'ZZ Kurz', 'bio_long_en', 'ZZ Long EN', 'bio_long_de', 'ZZ Long DE',
    'socials', jsonb_build_object('website', 'https://zz.example'), 'tech_rider', jsonb_build_object('mic', 'zz'),
    'contact_first_name', 'ZZKontakt', 'contact_last_name', 'ZZ Nachname', 'contact_email', 'zz-kontakt@example.org',
    'contact_phone', '0171 9990002', 'contact_kind', 'agency', 'contact_consent_at', current_date::text);
  v_r := pg_temp.speichern(v_pl);
  v_n := pg_temp.eintraege(v_s3);
  v_r3 := coalesce(pg_temp.felder(v_s3), 'NULL');
  -- Dasselbe noch einmal: jedes Feld hat nun seinen Wert, jedes wird mit **seinem** alten Wert verglichen — ein Vergleich mit dem Wert eines anderen Feldes
  -- (alle 17 Werte sind verschieden) fiele hier als „geändert“ auf.
  v_r2 := pg_temp.speichern(v_pl);
  insert into t_res values ('03_alle_arten',
    'ok speichern=' || v_r || ' eintraege=' || v_n || ' felder=' || v_r3
    || ' anzahl=' || coalesce((select jsonb_array_length(a.after->'felder') from audit_log a where a.action = 'speaker.assistant_update' and a.object_id = v_s3::text limit 1)::text, 'NULL')
    || ' ohne_werte=' || pg_temp.ohne_werte(v_s3, 'ZZ Neu', 'https://www.linkedin.com/in/zz-audit', 'ZZ Job', 'ZZ Org', 'ZZ Kurz', 'ZZ Long EN', 'ZZ Long DE',
                                              'zz.example', 'ZZKontakt', 'ZZ Nachname', 'zz-kontakt@example.org', '9990002')::text
    || ' wiederholt=' || pg_temp.eintraege(v_s3));

  -- ---- 04 Ungültiges und Gleiches ist keine Änderung (Sprache außerhalb von de/en; Links und Technik, die kein Objekt sind), eine andere gültige Sprache schon
  v_r := pg_temp.speichern(jsonb_build_object('id', v_s4, 'preferred_language', 'fr'));
  v_n := pg_temp.eintraege(v_s4);
  v_r := pg_temp.speichern(jsonb_build_object('id', v_s4, 'socials', to_jsonb('zz'::text), 'tech_rider', jsonb_build_array(1, 2)));
  v_n4 := pg_temp.eintraege(v_s4);
  v_r := pg_temp.speichern(jsonb_build_object('id', v_s4, 'preferred_language', 'en'));
  v_n2 := pg_temp.eintraege(v_s4);
  v_r := pg_temp.speichern(jsonb_build_object('id', v_s4, 'preferred_language', 'de'));
  insert into t_res values ('04_sprache', 'ok fr=' || v_n || ' kein_objekt=' || v_n4 || ' gleich=' || v_n2 || ' de=' || pg_temp.eintraege(v_s4) || ' felder=' || coalesce(pg_temp.felder(v_s4), 'NULL'));

  -- ---- 05 Die Speakerin selbst: kein Eintrag, der Wert steht im Profil
  v_r := pg_temp.speichern(jsonb_build_object('id', v_so, 'job_title', 'ZZ Selbst'));
  insert into t_res values ('05_speakerin_selbst',
    'ok speichern=' || v_r || ' eintraege=' || pg_temp.eintraege(v_so) || ' job_title=' || coalesce((select job_title from speaker_profile where id = v_so), 'NULL'));

  -- ---- 06 Die Funktion schreibt weiter, was sie schrieb
  insert into t_res values ('06_schreibt_weiter',
    'ok vorname=' || coalesce((select first_name from person where id = v_p1), 'NULL')
    || ' telefon=' || coalesce((select phone from person where id = v_p1), 'NULL')
    || ' e164=' || coalesce((select phone_e164 from person where id = v_p1), 'NULL')
    || ' bio=' || coalesce((select bio_short_en from speaker_profile where id = v_s1), 'NULL')
    || ' kontakt=' || coalesce((select contact_email::text || '/' || contact_first_name from speaker_profile where id = v_s3), 'NULL')
    || ' titel=' || coalesce((select title from person where id = v_p3), 'NULL'));

  -- ---- 07 Abgewiesene Aufrufe hinterlassen nichts
  v_r := pg_temp.speichern(jsonb_build_object('id', v_s5, 'first_name', 'ZZ Nicht', 'contact_email', 'zz-ohne@example.org'));
  v_r2 := pg_temp.speichern(jsonb_build_object('id', v_sz, 'first_name', 'ZZ Fremd'));
  insert into t_res values ('07_abgewiesen',
    'ok ohne_einwilligung=' || v_r || ' eintraege=' || pg_temp.eintraege(v_s5)
    || ' vorname=' || coalesce((select first_name from person where id = v_p5), 'NULL')
    || ' fremd=' || v_r2 || ' fremd_eintraege=' || pg_temp.eintraege(v_sz));

  -- ---- 08 Anmeldung und Rolle `anon`
  perform set_config('request.jwt.claims', '', true);
  v_r := pg_temp.speichern(jsonb_build_object('id', v_s1, 'first_name', 'ZZ Anonym'));
  perform set_config('request.jwt.claims', v_claims, true);
  execute 'set local role anon';
  begin perform update_my_speaker_profile(jsonb_build_object('id', v_s1, 'first_name', 'ZZ Anon')); v_r2 := 'ALLOWED (BUG)';
  exception when others then v_r2 := sqlstate; end;
  execute 'reset role';
  insert into t_res values ('08_anmeldung', 'ok ohne_anmeldung=' || v_r || ' anon=' || v_r2);
end $$;
insert into t_res
  select '99_auswertung',
         case when count(*) filter (where not z.erfuellt) = 0 then 'ok: alle ' || count(*)::text || ' Erwartungen erfüllt'
              else 'FEHLER: ' || string_agg(z.step, ', ' order by z.step) filter (where not z.erfuellt) end
    from (select e.step, exists (select 1 from t_res r where r.step = e.step and r.result ~ e.muster) as erfuellt from t_erw e) z;
select * from t_res order by step;
rollback;
