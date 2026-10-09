-- Smoke-Test v6_speaker_telefon (Vorschlag, SPK-093): das Speaker-Profil schreibt die Telefonnummer als freie Eingabe in `person.phone`; `phone_e164` entsteht nur über
-- den Trigger `trg_person_contact_keys` (0292) — unlesbar ⇒ null, die Eingabe bleibt in `phone`. Mit echtem Rollenwechsel: die handelnde Person ist ein Konto aus dem
-- Bestand (`current_person_id()` kommt aus den JWT-Claims), die Speakerin eine Person mit eigenem Profil, dazu eine Assistenz-Beziehung und ein fremdes Profil.
-- Jede Erwartung nennt den Stand **vorher** und **nachher** (kein Schritt gilt, wenn er nichts ändert); gerechnet wird in der Transaktion mit Wegwerfdaten (ZZ …),
-- alles wird zurückgerollt. Erwartung je Schritt als Muster in `t_erw`; `99_auswertung` am Ende.
--   00 Form: `anon` darf beide Funktionen nicht ausführen, `authenticated` ja; beide DEFINER mit gepinntem `search_path` (unverändert).
--   01 Neue Eingabe: `phone` landet getrimmt in `person.phone`, `phone_e164` wird abgeleitet (0171 … ⇒ +49171 …).
--   02 Unlesbare Eingabe („Büro, Durchwahl 12“): bleibt in `phone`, `phone_e164` ist null — kein Rohwert in der Schlüsselspalte.
--   03 Dieselbe Nummer erneut speichern (das Formular schickt `phone` bei jedem Speichern): nichts ändert sich — auch ein unlesbarer Wert landet nicht in `phone_e164`.
--   04 Eine Änderung leitet neu ab (die Ableitung folgt der Eingabe, sie bleibt nicht stehen).
--   05 Leeren: Schlüssel da, Wert leer ⇒ beide Spalten null. 06 Leeren bei einem Altwert (nur `phone_e164` gefüllt, unlesbar): auch er geht mit — sonst bliebe er stehen.
--   07 Formulare vor SPK-093 schicken `phone_e164`: gilt als dieselbe freie Eingabe (lesbar ⇒ in `phone` und abgeleitet, unlesbar ⇒ nur in `phone`).
--   08 Kommen beide Schlüssel, gewinnt `phone`. 09 Fehlen beide, bleibt die Nummer unberührt (und die übrigen Felder werden gespeichert).
--   10 `my_speaker_profile` liefert `person.phone`: eingegebener Wert, bei Altbeständen (nur `phone_e164`) dessen Wert, leer ⇒ null; `phone_e164` bleibt im JSON.
--   11 Die Assistenz schreibt die Nummer der Speakerin (nicht ihre eigene). 12 Ein fremdes Profil: P0002 `speaker_not_found`, nichts geschrieben.
--   13 Ohne Anmeldung 28000; als `anon` keine Ausführung (42501).
-- Probelauf der Build-Session am 09.10.2026 gegen die Live-Datenbank nach 0299 (`sh scripts/db.sh dry-run`, alles zurückgerollt): 14 von 14 Erwartungen erfüllt. Ohne die Migration
-- (`sh scripts/db.sh test`) sind 01, 02, 04, 05, 06, 07, 08, 10 und 11 rot — die alte Funktion kennt `phone` nicht; 00, 03, 09, 12 und 13 gelten schon heute (sie halten fest, was
-- sich nicht ändern darf: Rechte, dieselbe Nummer erneut, fehlende Schlüssel, fremdes Profil, Anmeldung).
-- Mutationsproben an der Migration (24, je Regel eine — alter Schlüssel, Vorrang von `phone`, Trimmen, leer ⇒ null, `phone` schreiben, Leeren mit Altwert, Rohwert nach `phone_e164`,
-- Anzeige und Rückfall, Assistenz, fremdes Profil, Anmeldung, DEFINER, `anon`): 23 rot; die 24. („Schreiben ohne `search_path` im Kopf“) ist gleichwertig — `harden_definer_functions()`
-- pinnt ihn am Ende ohnehin (die Prüfung steht deshalb im Quelltext-Test). `fn-diff`: zwei geänderte Funktionen, je eine verschwindende Zeile, beide ersetzt (`'phone_e164', …` bzw. die
-- `phone_e164`-Zuweisung).
begin;
create temp table t_res (step text, result text) on commit drop;
create temp table t_erw (step text, muster text) on commit drop;
insert into t_erw values
  ('00_form', '^ok update_anon=false profil_anon=false authenticated=true definer=true pfad=true$'),
  ('01_neue_eingabe', '^ok vorher=\[phone=NULL e164=NULL\] speichern=ok nachher=\[phone=0171 1234567 e164=\+491711234567\]$'),
  ('02_unlesbar', '^ok vorher=\[phone=NULL e164=NULL\] speichern=ok nachher=\[phone=Büro, Durchwahl 12 e164=NULL\]$'),
  ('03_erneut_gleich', '^ok lesbar=\[phone=0171 1234567 e164=\+491711234567 ok phone=0171 1234567 e164=\+491711234567\] unlesbar=\[phone=Büro, Durchwahl 12 e164=NULL ok phone=Büro, Durchwahl 12 e164=NULL\]$'),
  ('04_aenderung', '^ok vorher=\[phone=0171 1234567 e164=\+491711234567\] speichern=ok nachher=\[phone=\+49 \(0\) 40 5551234 e164=\+49405551234\]$'),
  ('05_leeren', '^ok vorher=\[phone=0171 1234567 e164=\+491711234567\] speichern=ok nachher=\[phone=NULL e164=NULL\]$'),
  ('06_leeren_altwert', '^ok vorher=\[phone=NULL e164=ZZ-Altwert 12\] speichern=ok nachher=\[phone=NULL e164=NULL\]$'),
  ('07_altformular', '^ok lesbar=\[ok phone=0171 2222222 e164=\+491712222222\] unlesbar=\[ok phone=ZZ unlesbar e164=NULL\]$'),
  ('08_phone_gewinnt', '^ok speichern=ok nachher=\[phone=0171 1111111 e164=\+491711111111\]$'),
  ('09_unberuehrt', '^ok vorher=\[phone=0171 3333333 e164=\+491713333333\] speichern=ok bio=ZZ Telefon-Bio nachher=\[phone=0171 3333333 e164=\+491713333333\]$'),
  ('10_anzeige', '^ok unlesbar=Büro 12/NULL lesbar=0171 3333333/\+491713333333 altbestand=\+4917199999/\+4917199999 leer=NULL/NULL$'),
  ('11_assistenz', '^ok speichern=ok speakerin=\[phone=0171 4444444 e164=\+491714444444\] eigene=\[phone=0171 3333333 e164=\+491713333333\]$'),
  ('12_fremdes_profil', '^ok speichern=P0002 speaker_not_found fremde=\[phone=NULL e164=NULL\]$'),
  ('13_anmeldung', '^ok ohne_anmeldung=28000 not authenticated anon_schreiben=42501 anon_lesen=42501$');

-- Hilfen: Aufruf als Text (`ok` oder `SQLSTATE meldung`), Zustand der Nummer lesen und setzen.
create function pg_temp.speichern(p_data jsonb) returns text language plpgsql as $$
begin
  perform update_my_speaker_profile(p_data);
  return 'ok';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;

create function pg_temp.stand(p_person uuid) returns text language sql as $$
  select 'phone=' || coalesce(p.phone, 'NULL') || ' e164=' || coalesce(p.phone_e164, 'NULL') from person p where p.id = p_person
$$;

-- Erst leeren, dann setzen: so ist der Ausgangszustand unabhängig davon, was die Person im Bestand schon hatte (der Trigger rechnet bei jedem Schritt mit).
create function pg_temp.setze(p_person uuid, p_phone text, p_e164 text) returns void language plpgsql as $$
begin
  update person set phone = null, phone_e164 = null where id = p_person;
  update person set phone = p_phone, phone_e164 = p_e164 where id = p_person;
end $$;

do $$
declare
  v_ed uuid; v_pt uuid; v_ut uuid; v_claims text; v_so uuid;
  v_px uuid; v_sx uuid; v_pz uuid; v_sz uuid;
  v_vor text; v_r text; v_r2 text; v_r3 text; v_j jsonb;
begin
  -- ---- Aufbau: T (ein Konto aus dem Bestand) mit eigenem Profil O; X: Speakerin, deren Assistenz T ist; Z: fremd.
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select p.id, p.auth_user_id into v_pt, v_ut from person p where p.auth_user_id is not null order by p.created_at limit 1;
  select sp.id into v_so from speaker_profile sp where sp.person_id = v_pt and sp.edition_id = v_ed;
  if v_so is null then
    insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at)
    values (v_pt, v_ed, 'keynote', 'confirmed', now()) returning id into v_so;
  end if;
  -- Eine gemerkte Wahl von T räumen: `my_speaker_profile` zeigt dann das eigene Profil.
  delete from speaker_portal_selection where person_id = v_pt;

  insert into person (first_name, last_name, preferred_language) values ('Xaver', 'ZZTelefon X', 'de') returning id into v_px;
  insert into person (first_name, last_name, preferred_language) values ('Zora', 'ZZTelefon Z', 'de') returning id into v_pz;
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at, assistant_person_id)
  values (v_px, v_ed, 'panelist', 'confirmed', now(), v_pt) returning id into v_sx;
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at)
  values (v_pz, v_ed, 'panelist', 'confirmed', now()) returning id into v_sz;

  v_claims := json_build_object('sub', v_ut, 'role', 'authenticated')::text;
  perform set_config('request.jwt.claims', v_claims, true);

  -- ---- 00 Form
  insert into t_res values ('00_form',
    'ok update_anon=' || has_function_privilege('anon', 'update_my_speaker_profile(jsonb)', 'execute')::text
    || ' profil_anon=' || has_function_privilege('anon', 'my_speaker_profile(uuid)', 'execute')::text
    || ' authenticated=' || (has_function_privilege('authenticated', 'update_my_speaker_profile(jsonb)', 'execute')
                             and has_function_privilege('authenticated', 'my_speaker_profile(uuid)', 'execute'))::text
    || ' definer=' || (select bool_and(p.prosecdef) from pg_proc p
                        where p.oid in ('update_my_speaker_profile(jsonb)'::regprocedure, 'my_speaker_profile(uuid)'::regprocedure))::text
    || ' pfad=' || (select bool_and(coalesce(p.proconfig::text, '') like '%search_path=%') from pg_proc p
                     where p.oid in ('update_my_speaker_profile(jsonb)'::regprocedure, 'my_speaker_profile(uuid)'::regprocedure))::text);

  -- ---- 01 Neue Eingabe (mit Leerzeichen drumherum: getrimmt)
  perform pg_temp.setze(v_pt, null, null);
  v_vor := pg_temp.stand(v_pt);
  v_r := pg_temp.speichern(jsonb_build_object('id', v_so, 'phone', '  0171 1234567 '));
  insert into t_res values ('01_neue_eingabe', 'ok vorher=[' || v_vor || '] speichern=' || v_r || ' nachher=[' || pg_temp.stand(v_pt) || ']');

  -- ---- 02 Unlesbare Eingabe
  perform pg_temp.setze(v_pt, null, null);
  v_vor := pg_temp.stand(v_pt);
  v_r := pg_temp.speichern(jsonb_build_object('id', v_so, 'phone', ' Büro, Durchwahl 12 '));
  insert into t_res values ('02_unlesbar', 'ok vorher=[' || v_vor || '] speichern=' || v_r || ' nachher=[' || pg_temp.stand(v_pt) || ']');

  -- ---- 03 Dieselbe Nummer erneut speichern: das Formular schickt `phone` bei jedem Speichern, auch unverändert
  perform pg_temp.setze(v_pt, '0171 1234567', null);
  v_vor := pg_temp.stand(v_pt);
  v_r := pg_temp.speichern(jsonb_build_object('id', v_so, 'phone', '0171 1234567'));
  v_r2 := v_vor || ' ' || v_r || ' ' || pg_temp.stand(v_pt);
  perform pg_temp.setze(v_pt, 'Büro, Durchwahl 12', null);
  v_vor := pg_temp.stand(v_pt);
  v_r := pg_temp.speichern(jsonb_build_object('id', v_so, 'phone', 'Büro, Durchwahl 12'));
  v_r3 := v_vor || ' ' || v_r || ' ' || pg_temp.stand(v_pt);
  insert into t_res values ('03_erneut_gleich', 'ok lesbar=[' || v_r2 || '] unlesbar=[' || v_r3 || ']');

  -- ---- 04 Eine Änderung leitet neu ab
  perform pg_temp.setze(v_pt, '0171 1234567', null);
  v_vor := pg_temp.stand(v_pt);
  v_r := pg_temp.speichern(jsonb_build_object('id', v_so, 'phone', '+49 (0) 40 5551234'));
  insert into t_res values ('04_aenderung', 'ok vorher=[' || v_vor || '] speichern=' || v_r || ' nachher=[' || pg_temp.stand(v_pt) || ']');

  -- ---- 05 Leeren
  perform pg_temp.setze(v_pt, '0171 1234567', null);
  v_vor := pg_temp.stand(v_pt);
  v_r := pg_temp.speichern(jsonb_build_object('id', v_so, 'phone', ''));
  insert into t_res values ('05_leeren', 'ok vorher=[' || v_vor || '] speichern=' || v_r || ' nachher=[' || pg_temp.stand(v_pt) || ']');

  -- ---- 06 Leeren bei einem Altwert: nur `phone_e164` gefüllt, und zwar unlesbar (so schrieb das alte Formular, bevor der Trigger ableitete)
  perform pg_temp.setze(v_pt, null, 'ZZ-Altwert 12');
  v_vor := pg_temp.stand(v_pt);
  v_r := pg_temp.speichern(jsonb_build_object('id', v_so, 'phone', ''));
  insert into t_res values ('06_leeren_altwert', 'ok vorher=[' || v_vor || '] speichern=' || v_r || ' nachher=[' || pg_temp.stand(v_pt) || ']');

  -- ---- 07 Formulare vor SPK-093 schicken `phone_e164`
  perform pg_temp.setze(v_pt, null, null);
  v_r := pg_temp.speichern(jsonb_build_object('id', v_so, 'phone_e164', '0171 2222222'));
  v_r2 := v_r || ' ' || pg_temp.stand(v_pt);
  perform pg_temp.setze(v_pt, null, null);
  v_r := pg_temp.speichern(jsonb_build_object('id', v_so, 'phone_e164', 'ZZ unlesbar'));
  v_r3 := v_r || ' ' || pg_temp.stand(v_pt);
  insert into t_res values ('07_altformular', 'ok lesbar=[' || v_r2 || '] unlesbar=[' || v_r3 || ']');

  -- ---- 08 Beide Schlüssel: `phone` gewinnt
  perform pg_temp.setze(v_pt, null, null);
  v_r := pg_temp.speichern(jsonb_build_object('id', v_so, 'phone', '0171 1111111', 'phone_e164', '0171 2222222'));
  insert into t_res values ('08_phone_gewinnt', 'ok speichern=' || v_r || ' nachher=[' || pg_temp.stand(v_pt) || ']');

  -- ---- 09 Fehlen beide Schlüssel: die Nummer bleibt, die übrigen Felder werden gespeichert (der Aufruf tut also etwas)
  perform pg_temp.setze(v_pt, '0171 3333333', null);
  v_vor := pg_temp.stand(v_pt);
  v_r := pg_temp.speichern(jsonb_build_object('id', v_so, 'bio_short_de', 'ZZ Telefon-Bio'));
  insert into t_res values ('09_unberuehrt', 'ok vorher=[' || v_vor || '] speichern=' || v_r
    || ' bio=' || (select coalesce(sp.bio_short_de, 'NULL') from speaker_profile sp where sp.id = v_so)
    || ' nachher=[' || pg_temp.stand(v_pt) || ']');

  -- ---- 10 Anzeige: `my_speaker_profile` → person.phone
  perform pg_temp.setze(v_pt, 'Büro 12', null);
  v_j := my_speaker_profile(v_ed) -> 'person';
  v_r := coalesce(v_j->>'phone', 'NULL') || '/' || coalesce(v_j->>'phone_e164', 'NULL');
  perform pg_temp.setze(v_pt, '0171 3333333', null);
  v_j := my_speaker_profile(v_ed) -> 'person';
  v_r2 := coalesce(v_j->>'phone', 'NULL') || '/' || coalesce(v_j->>'phone_e164', 'NULL');
  perform pg_temp.setze(v_pt, null, '+4917199999');
  v_j := my_speaker_profile(v_ed) -> 'person';
  v_r3 := coalesce(v_j->>'phone', 'NULL') || '/' || coalesce(v_j->>'phone_e164', 'NULL');
  perform pg_temp.setze(v_pt, null, null);
  v_j := my_speaker_profile(v_ed) -> 'person';
  insert into t_res values ('10_anzeige', 'ok unlesbar=' || v_r || ' lesbar=' || v_r2 || ' altbestand=' || v_r3
    || ' leer=' || coalesce(v_j->>'phone', 'NULL') || '/' || coalesce(v_j->>'phone_e164', 'NULL'));

  -- ---- 11 Die Assistenz schreibt die Nummer der Speakerin, nicht ihre eigene
  perform pg_temp.setze(v_pt, '0171 3333333', null);
  perform pg_temp.setze(v_px, null, null);
  v_r := pg_temp.speichern(jsonb_build_object('id', v_sx, 'phone', '0171 4444444'));
  insert into t_res values ('11_assistenz', 'ok speichern=' || v_r || ' speakerin=[' || pg_temp.stand(v_px) || '] eigene=[' || pg_temp.stand(v_pt) || ']');

  -- ---- 12 Ein fremdes Profil
  perform pg_temp.setze(v_pz, null, null);
  v_r := pg_temp.speichern(jsonb_build_object('id', v_sz, 'phone', '0171 5555555'));
  insert into t_res values ('12_fremdes_profil', 'ok speichern=' || v_r || ' fremde=[' || pg_temp.stand(v_pz) || ']');

  -- ---- 13 Anmeldung und Rolle `anon`
  perform set_config('request.jwt.claims', '', true);
  v_r := pg_temp.speichern(jsonb_build_object('id', v_so, 'phone', '0171 6666666'));
  perform set_config('request.jwt.claims', v_claims, true);
  execute 'set local role anon';
  begin perform update_my_speaker_profile(jsonb_build_object('id', v_so, 'phone', '0171 7777777')); v_r2 := 'ALLOWED (BUG)';
  exception when others then v_r2 := sqlstate; end;
  begin perform my_speaker_profile(v_ed); v_r3 := 'ALLOWED (BUG)';
  exception when others then v_r3 := sqlstate; end;
  execute 'reset role';
  insert into t_res values ('13_anmeldung', 'ok ohne_anmeldung=' || v_r || ' anon_schreiben=' || v_r2 || ' anon_lesen=' || v_r3);
end $$;
insert into t_res
  select '99_auswertung',
         case when count(*) filter (where not z.erfuellt) = 0 then 'ok: alle ' || count(*)::text || ' Erwartungen erfüllt'
              else 'FEHLER: ' || string_agg(z.step, ', ' order by z.step) filter (where not z.erfuellt) end
    from (select e.step, exists (select 1 from t_res r where r.step = e.step and r.result ~ e.muster) as erfuellt from t_erw e) z;
select * from t_res order by step;
rollback;
