-- Smoke-Test v6_speaker_audit_bestand (Vorschlag, SPK-095, Folge von SPK-094): die Bestandseinträge des Audits der Assistenz-Änderung (`speaker.assistant_update`) tragen
-- nur noch die Namen der Felder und die `person_id`, nie einen Wert. Eine Datenmigration lässt sich nach dem Lauf nicht mehr „aufrufen“ — darum liegt ihre Arbeit in der
-- internen Funktion `speaker_audit_bereinigen()`, und der Test ruft sie auf **eigenen** Zeilen auf (Wegwerfdaten, ZZ …; alles wird zurückgerollt). Die Migration selbst hat den
-- Bestand schon bereinigt (und hätte sonst abgebrochen), so zählt dieser Test nur seine eigenen Fixtures. Erwartung je Schritt als Muster in `t_erw`; `99_auswertung` am Ende.
--   Fixtures: F1 alter Eingabeblock mit vier Feldern zu einem vorhandenen Profil · F2 zu einem Profil, das es nicht gibt · F3 mit einem Vorher · F9 mit einem Schlüssel
--   `felder`, der gar keine Liste ist (gefälscht) · unberührt bleiben: F4 neues Format (SPK-094), F5 eine andere Aktion mit Werten, F5b eine ähnliche Aktion, F6 `after` leer
--   (NULL), F7 `after` ein Text, F8 `after` ein leeres Objekt, F10 `after` eine Liste.
--   00 Form: beide Hilfsfunktionen intern (kein EXECUTE für `public`/`anon`/`authenticated`), die große DEFINER mit gepinntem `search_path`.
--   01 Zählprobe: vier Einträge mit Werten vorher, vier bereinigt, null danach — die Zahl aller Einträge der Aktion bleibt.
--   02 Inhalt: genau `{"felder": [<Schlüssel sortiert>], "person_id": <Speakerin>}`; ohne Profil nur `felder`; `before` leer; ein gefälschter Schlüssel `felder` fällt mit weg.
--   03 Unberührt: F4 bis F10 und jeder Eintrag anderer Aktionen sind Byte für Byte, was sie waren (Prüfsumme). 04 Idempotent: ein zweiter Lauf ändert nichts (0, gleiche Prüfsumme).
--   05 Kein neuer Audit-Eintrag: die Zahl aller Zeilen von `audit_log` und die höchste Nummer bleiben. 06 Kein Wert mehr im Eintrag (die getippten Werte stehen nirgends).
--   07 Rechte: `authenticated` und `anon` bekommen 42501 auf beide Funktionen.
-- Probelauf der Build-Session am 09.10.2026 gegen die Live-Datenbank nach 0301 (`sh scripts/db.sh dry-run`, alles zurückgerollt): 8 von 8 Erwartungen erfüllt; im Bestand steht genau ein
-- Eintrag der Aktion im alten Format (ohne `felder`, ohne `before`), den die Migration selbst bereinigt (Zahl der Einträge bleibt). Mutationsproben an der Migration (20, je Regel eine — Aktion und
-- Typ des `after`, Bedingung „mehr als `felder` und `person_id`“, Sortierung, `person_id` (fehlt, falsche Quelle, falscher Join), `before`, ein Audit-Eintrag, Rechte, DEFINER, die Zahl, nur ein
-- Eintrag, Werte statt Namen): 18 rot; zwei überleben mit Grund — die Gegenprobe der Migration greift nur bei unvollständiger Bereinigung (im Quelltext-Test festgehalten) und `immutable` ist keine Wirkung.
begin;
create temp table t_res (step text, result text) on commit drop;
create temp table t_erw (step text, muster text) on commit drop;
insert into t_erw values
  ('00_form', '^ok felder_public=false felder_anon=false felder_auth=false bereinigen_public=false bereinigen_anon=false bereinigen_auth=false definer=true pfad=true$'),
  ('01_zaehlprobe', '^ok vorher_gesamt=([0-9]+) vorher_mit_werten=4 bereinigt=4 nachher_gesamt=\1 nachher_mit_werten=0$'),
  ('02_inhalt', '^ok f1=true f2=true f3=true gefaelscht=true before_leer=true$'),
  ('03_unberuehrt', '^ok neues_format=true andere_aktion=true aehnliche_aktion=true leer=true text=true leeres_objekt=true liste=true alle_anderen=true$'),
  ('04_idempotent', '^ok zweiter_lauf=0 pruefsumme_gleich=true$'),
  ('05_kein_audit', '^ok zeilen_gleich=true max_id_gleich=true$'),
  ('06_kein_klartext', '^ok ohne_werte=true$'),
  ('07_rechte', '^ok authenticated=42501/42501 anon=42501/42501$');

create function pg_temp.neu(p_name text, out o_person uuid, out o_profil uuid) language plpgsql as $$
declare v_ed uuid;
begin
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  insert into person (first_name, last_name, preferred_language) values ('Xaver', p_name, 'en') returning id into o_person;
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at)
  values (o_person, v_ed, 'panelist', 'confirmed', now()) returning id into o_profil;
end $$;

-- Prüfsumme über `after` (und `before`) aller Zeilen einer Aktion, nach Nummer geordnet.
create function pg_temp.summe(p_aktion text) returns text language sql as $$
  select coalesce(md5(string_agg(a.id::text || ':' || coalesce(a.before::text, '-') || ':' || coalesce(a.after::text, '-'), '|' order by a.id)), 'leer')
    from audit_log a where a.action = p_aktion
$$;

-- Eine Fixture-Zeile anlegen; gibt ihre Nummer zurück.
create function pg_temp.zeile(p_aktion text, p_objekt text, p_before jsonb, p_after jsonb) returns bigint language sql as $$
  insert into audit_log (action, object_type, object_id, before, after) values (p_aktion, 'speaker_profile', p_objekt, p_before, p_after) returning id
$$;

do $$
declare
  v_px uuid; v_sx uuid;
  f1 bigint; f2 bigint; f3 bigint; f4 bigint; f5 bigint; f5b bigint; f6 bigint; f7 bigint; f8 bigint; f9 bigint; f10 bigint;
  v_fremd text := gen_random_uuid()::text;
  v_vor_gesamt integer; v_vor_werte integer; v_n integer; v_nach_gesamt integer; v_nach_werte integer;
  v_summe_andere text; v_summe_alle_vorher text; v_summe_alle_nachher text;
  v_zeilen integer; v_max bigint; v_zeilen2 integer; v_max2 bigint;
  v_p1 text; v_p4 text; v_p5 text; v_p5b text; v_p6 text; v_p7 text; v_p8 text; v_p10 text;
  v_r text; v_r2 text; v_r3 text;
begin
  select * into v_px, v_sx from pg_temp.neu('ZZAuditBestand');

  f1  := pg_temp.zeile('speaker.assistant_update', v_sx::text, null,
           jsonb_build_object('first_name', 'ZZAuditBestandVorname', 'phone', '0171 9990003', 'bio_short_en', 'ZZ Bio Bestand geheim', 'job_title', 'ZZ Job Bestand'));
  f2  := pg_temp.zeile('speaker.assistant_update', v_fremd, null, jsonb_build_object('last_name', 'ZZ Bestand Zwei', 'title', 'Dr.'));
  f3  := pg_temp.zeile('speaker.assistant_update', v_sx::text, jsonb_build_object('x', 'ZZ Vorher'), jsonb_build_object('phone', '0171 9990004'));
  f9  := pg_temp.zeile('speaker.assistant_update', v_sx::text, null, jsonb_build_object('felder', 'gefaelscht', 'first_name', 'ZZ Falsch'));
  f4  := pg_temp.zeile('speaker.assistant_update', v_sx::text, null, jsonb_build_object('felder', jsonb_build_array('first_name'), 'person_id', v_px));
  f5  := pg_temp.zeile('speaker.contact_upsert', v_sx::text, null, jsonb_build_object('kind', 'agency', 'has_access', true));
  f5b := pg_temp.zeile('speaker.assistant_updated', v_sx::text, null, jsonb_build_object('first_name', 'ZZ Aehnlich'));
  f6  := pg_temp.zeile('speaker.assistant_update', v_sx::text, null, null);
  f7  := pg_temp.zeile('speaker.assistant_update', v_sx::text, null, to_jsonb('nur ein Text'::text));
  f8  := pg_temp.zeile('speaker.assistant_update', v_sx::text, null, '{}'::jsonb);
  f10 := pg_temp.zeile('speaker.assistant_update', v_sx::text, null, jsonb_build_array('a', 'b'));

  -- ---- 00 Form
  insert into t_res values ('00_form',
    'ok felder_public=' || has_function_privilege('public', 'speaker_audit_felder(jsonb, uuid)', 'execute')::text
    || ' felder_anon=' || has_function_privilege('anon', 'speaker_audit_felder(jsonb, uuid)', 'execute')::text
    || ' felder_auth=' || has_function_privilege('authenticated', 'speaker_audit_felder(jsonb, uuid)', 'execute')::text
    || ' bereinigen_public=' || has_function_privilege('public', 'speaker_audit_bereinigen()', 'execute')::text
    || ' bereinigen_anon=' || has_function_privilege('anon', 'speaker_audit_bereinigen()', 'execute')::text
    || ' bereinigen_auth=' || has_function_privilege('authenticated', 'speaker_audit_bereinigen()', 'execute')::text
    || ' definer=' || (select p.prosecdef from pg_proc p where p.oid = 'speaker_audit_bereinigen()'::regprocedure)::text
    || ' pfad=' || (select coalesce(p.proconfig::text, '') like '%search_path=%' from pg_proc p where p.oid = 'speaker_audit_bereinigen()'::regprocedure)::text);

  -- ---- 01 Zählprobe (und die Prüfsummen für die Schritte danach)
  select count(*)::integer, count(*) filter (where jsonb_typeof(a.after) = 'object' and a.after - 'felder' - 'person_id' <> '{}'::jsonb)::integer
    into v_vor_gesamt, v_vor_werte from audit_log a where a.action = 'speaker.assistant_update';
  select count(*)::integer, coalesce(max(id), 0) into v_zeilen, v_max from audit_log;
  v_summe_andere := pg_temp.summe('speaker.contact_upsert') || pg_temp.summe('speaker.assistant_updated');
  select md5(string_agg(a.id::text || ':' || coalesce(a.before::text, '-') || ':' || coalesce(a.after::text, '-'), '|' order by a.id))
    into v_summe_alle_vorher from audit_log a where a.id in (f4, f5, f5b, f6, f7, f8, f10);
  v_n := speaker_audit_bereinigen();
  select count(*)::integer, count(*) filter (where jsonb_typeof(a.after) = 'object' and a.after - 'felder' - 'person_id' <> '{}'::jsonb)::integer
    into v_nach_gesamt, v_nach_werte from audit_log a where a.action = 'speaker.assistant_update';
  insert into t_res values ('01_zaehlprobe',
    'ok vorher_gesamt=' || v_vor_gesamt || ' vorher_mit_werten=' || v_vor_werte || ' bereinigt=' || v_n
    || ' nachher_gesamt=' || v_nach_gesamt || ' nachher_mit_werten=' || v_nach_werte);

  -- ---- 02 Inhalt
  select (a.after = jsonb_build_object('felder', jsonb_build_array('bio_short_en', 'first_name', 'job_title', 'phone'), 'person_id', v_px))::text into v_r from audit_log a where a.id = f1;
  select (a.after = jsonb_build_object('felder', jsonb_build_array('last_name', 'title')))::text into v_r2 from audit_log a where a.id = f2;
  select (a.after = jsonb_build_object('felder', jsonb_build_array('phone'), 'person_id', v_px))::text into v_r3 from audit_log a where a.id = f3;
  insert into t_res values ('02_inhalt',
    'ok f1=' || v_r || ' f2=' || v_r2 || ' f3=' || v_r3
    || ' gefaelscht=' || (select (a.after = jsonb_build_object('felder', jsonb_build_array('felder', 'first_name'), 'person_id', v_px))::text from audit_log a where a.id = f9)
    || ' before_leer=' || (select bool_and(a.before is null)::text from audit_log a where a.id in (f1, f2, f3, f9)));

  -- ---- 03 Unberührt
  select md5(string_agg(a.id::text || ':' || coalesce(a.before::text, '-') || ':' || coalesce(a.after::text, '-'), '|' order by a.id))
    into v_summe_alle_nachher from audit_log a where a.id in (f4, f5, f5b, f6, f7, f8, f10);
  insert into t_res values ('03_unberuehrt',
    'ok neues_format=' || (select (a.after = jsonb_build_object('felder', jsonb_build_array('first_name'), 'person_id', v_px))::text from audit_log a where a.id = f4)
    || ' andere_aktion=' || (select (a.after = jsonb_build_object('kind', 'agency', 'has_access', true))::text from audit_log a where a.id = f5)
    || ' aehnliche_aktion=' || (select (a.after = jsonb_build_object('first_name', 'ZZ Aehnlich'))::text from audit_log a where a.id = f5b)
    || ' leer=' || (select (a.after is null)::text from audit_log a where a.id = f6)
    || ' text=' || (select (a.after = to_jsonb('nur ein Text'::text))::text from audit_log a where a.id = f7)
    || ' leeres_objekt=' || (select (a.after = '{}'::jsonb)::text from audit_log a where a.id = f8)
    || ' liste=' || (select (a.after = jsonb_build_array('a', 'b'))::text from audit_log a where a.id = f10)
    || ' alle_anderen=' || (v_summe_alle_vorher = v_summe_alle_nachher and v_summe_andere = pg_temp.summe('speaker.contact_upsert') || pg_temp.summe('speaker.assistant_updated'))::text);

  -- ---- 04 Idempotent
  select md5(string_agg(a.id::text || ':' || coalesce(a.before::text, '-') || ':' || coalesce(a.after::text, '-'), '|' order by a.id))
    into v_summe_alle_vorher from audit_log a where a.action = 'speaker.assistant_update';
  v_n := speaker_audit_bereinigen();
  select md5(string_agg(a.id::text || ':' || coalesce(a.before::text, '-') || ':' || coalesce(a.after::text, '-'), '|' order by a.id))
    into v_summe_alle_nachher from audit_log a where a.action = 'speaker.assistant_update';
  insert into t_res values ('04_idempotent', 'ok zweiter_lauf=' || v_n || ' pruefsumme_gleich=' || (v_summe_alle_vorher = v_summe_alle_nachher)::text);

  -- ---- 05 Kein neuer Audit-Eintrag (nach beiden Läufen)
  select count(*)::integer, coalesce(max(id), 0) into v_zeilen2, v_max2 from audit_log;
  insert into t_res values ('05_kein_audit', 'ok zeilen_gleich=' || (v_zeilen = v_zeilen2)::text || ' max_id_gleich=' || (v_max = v_max2)::text);

  -- ---- 06 Kein Wert mehr im Eintrag
  insert into t_res values ('06_kein_klartext', 'ok ohne_werte=' || (not exists (
    select 1 from audit_log a, unnest(array['ZZAuditBestandVorname', '9990003', '9990004', 'ZZ Bio Bestand geheim', 'ZZ Job Bestand', 'ZZ Bestand Zwei', 'ZZ Falsch', 'ZZ Vorher']) w
     where a.id in (f1, f2, f3, f9) and position(w in coalesce(a.before::text, '') || coalesce(a.after::text, '')) > 0))::text);

  -- ---- 07 Rechte
  execute 'set local role authenticated';
  begin perform speaker_audit_bereinigen(); v_r := 'ALLOWED (BUG)'; exception when others then v_r := sqlstate; end;
  begin perform speaker_audit_felder('{}'::jsonb, null); v_r2 := 'ALLOWED (BUG)'; exception when others then v_r2 := sqlstate; end;
  execute 'reset role';
  execute 'set local role anon';
  begin perform speaker_audit_bereinigen(); v_r3 := 'ALLOWED (BUG)'; exception when others then v_r3 := sqlstate; end;
  begin perform speaker_audit_felder('{}'::jsonb, null); v_p1 := 'ALLOWED (BUG)'; exception when others then v_p1 := sqlstate; end;
  execute 'reset role';
  insert into t_res values ('07_rechte', 'ok authenticated=' || v_r || '/' || v_r2 || ' anon=' || v_r3 || '/' || v_p1);
end $$;
insert into t_res
  select '99_auswertung',
         case when count(*) filter (where not z.erfuellt) = 0 then 'ok: alle ' || count(*)::text || ' Erwartungen erfüllt'
              else 'FEHLER: ' || string_agg(z.step, ', ' order by z.step) filter (where not z.erfuellt) end
    from (select e.step, exists (select 1 from t_res r where r.step = e.step and r.result ~ e.muster) as erfuellt from t_erw e) z;
select * from t_res order by step;
rollback;
