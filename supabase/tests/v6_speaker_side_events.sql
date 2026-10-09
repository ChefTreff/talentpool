-- Smoke-Test v6_speaker_side_events (Vorschlag, ADM-087): `speaker_side_events(profil)` — die Side-Event-Einladungen eines Speakers für das Speaker-Team.
-- Mit echtem Rollenwechsel: die handelnde Person ist ein Konto aus dem Bestand, dessen Rollen je Schritt wechseln (Admin, Bereichsleitung Speaker, Programm-Team,
-- Stage Lead, Partner, ohne Rolle); die Funktion prüft `current_person_id()`, also die echte Entscheidung. Jede Abweisung hat ein Gegenstück (das Team sieht
-- dieselben Zeilen). Wegwerfdaten (ZZ …), alles wird zurückgerollt. Erwartung je Schritt als Muster in `t_erw`; `99_auswertung` am Ende.
--   01 Form: SECURITY DEFINER, STABLE (kein Schreibweg), `search_path` gepinnt, EXECUTE nur für `authenticated`; die **Spaltenliste** ist festgehalten und
--      enthält weder `note` noch einen Token.
--   02 Das Team sieht die Zeilen: Anzahl, Reihenfolge nach Beginn (nicht nach Anlage), je Spalte ein eigener Wert (Stand, Begleitung als Zahl, Weg und die drei
--      Zeitpunkte, `NULL` bleibt `NULL`), Titel DE/EN, Ort, Beginn, Ende; ein nicht veröffentlichtes Event steht mit `published = false` drin.
--   03 Nur dieses Profil und nur diese Edition: die Einladung eines anderen Profils zum selben Event und eine Einladung zu einem Event einer anderen Edition
--      fehlen (die Zeile dazu **gibt** es — der Ausschluss ist kein leerer Befund); ein Profil ohne Einladung liefert eine leere Menge.
--   04 Im Ergebnis stehen weder der Hinweis (`note`, Freitext, Art. 9) noch der Token — obwohl beide in der Zeile stehen.
--   05 Alle drei Rollen des Teams (`admin`, `area_lead_speaker`, `programme_team`) sehen dasselbe.
--   06 Abweisungen: Stage Lead (auch als Betreuer des Speakers, obwohl `can_manage_speaker` dann wahr ist), Partner, ohne Rolle, Assistenz, der Speaker selbst:
--      42501; unbekannte Profil-Id ohne Recht ebenfalls 42501 (kein Hinweis, ob es sie gibt), für das Team P0002 `speaker_not_found`; ohne Anmeldung 28000.
--   07 Die Rechte der Rolle `authenticated` (läuft) und `anon` (42501) unter `set local role`.
--   08 Nur lesend: kein Audit-Eintrag, die Einladungen bleiben, wie sie waren.
-- Probelauf der Build-Session am 09.10.2026 gegen die Live-Datenbank nach 0287 (`sh scripts/db.sh dry-run`, alles zurückgerollt): 20 von 20 Erwartungen
-- erfüllt. Mutationsproben an der Migration (31, je Regel eine — Recht, Reihenfolge der Prüfungen, Filter, Sortierung, Spaltenliste und -zuordnung,
-- Eigenschaften der Funktion, Grants, Schreibwirkung): 30 rot, die 24. (`search_path` ungepinnt) ist gleichwertig — `harden_definer_functions()` am Ende
-- der Migration pinnt ihn ohnehin; ohne das Härten (Mutation 31) wird sie rot. Die erste Runde fand eine Lücke: die Sortierung nach Anlage überlebte, solange
-- alle Fixtures in einer Transaktion dasselbe `created_at` trugen (jetzt gesetzt, dazu feste Ids für die Sortierung nach Id). `fn-diff`: eine neue Funktion,
-- keine geänderte.
begin;
create temp table t_res (step text, result text) on commit drop;
create temp table t_erw (step text, muster text) on commit drop;
insert into t_erw values
  ('01_form', '^ok definer=true stable=true pfad=true anon=false authenticated=true$'),
  ('01_spaltenliste', '^TABLE\(side_event_id uuid, title_de text, title_en text, location text, starts_at timestamp with time zone, ends_at timestamp with time zone, published boolean, status text, guests integer, via text, invited_at timestamp with time zone, mailed_at timestamp with time zone, responded_at timestamp with time zone\) ohne_note=true ohne_token=true$'),
  ('02_team_sieht', '^3 Zeilen: ZZ Empfang\|true\|invited\|0\|team\|inv=0\|mail=-\|resp=- / ZZ Dinner\|true\|yes\|2\|email\|inv=1\|mail=2\|resp=3 / ZZ Brunch\|false\|no\|0\|portal\|inv=4\|mail=5\|resp=6$'),
  ('02_event_spalten', '^dinner: en=ZZ Dinner EN ort=ZZ Hafenbar start=\+21d dauer=02:00:00 brunch: en=ZZ Brunch EN ende=NULL start=\+22d$'),
  ('03_nur_dieses_profil', '^s2=1 Zeilen: ZZ Dinner\|true\|yes\|1\|portal\|inv=7\|mail=-\|resp=8 s3=0 Zeilen: -$'),
  ('03_andere_edition', '^einladung_da=true event_da=true nicht_dabei=true$'),
  ('04_ohne_note_und_token', '^fixture_note=true fixture_token=true note_im_ergebnis=false token_im_ergebnis=false$'),
  ('05_rechte_je_rolle', '^admin=3 area_lead_speaker=3 programme_team=3$'),
  ('06_stage_lead', '^rejected 42501 not allowed detail=-$'),
  ('06_stage_lead_betreuer', '^kann_verwalten=true rejected 42501 not allowed detail=-$'),
  ('06_partner', '^rejected 42501 not allowed detail=-$'),
  ('06_ohne_rolle', '^rejected 42501 not allowed detail=-$'),
  ('06_assistenz', '^rejected 42501 not allowed detail=-$'),
  ('06_speaker_selbst', '^rejected 42501 not allowed detail=-$'),
  ('06_unbekannt_ohne_recht', '^rejected 42501 not allowed detail=-$'),
  ('06_unbekannt_team', '^rejected P0002 speaker_not_found detail=-$'),
  ('06_null_team', '^rejected P0002 speaker_not_found detail=-$'),
  ('06_ohne_anmeldung', '^rejected 28000 not authenticated detail=-$'),
  ('07_rollen_authenticated_anon', '^authenticated=3 anon=42501$'),
  ('08_nur_lesend', '^audit_gleich=true einladungen_gleich=true$');

-- Hilfen: Abweisung als Text; neuer Speaker mit Person, Adresse und Profil; Rollen der handelnden Person wechseln; die Zeilen eines Profils als Text.
create function pg_temp.abgewiesen(p_sql text) returns text language plpgsql as $$
declare v_detail text;
begin
  execute p_sql;
  return 'ALLOWED (BUG)';
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return 'rejected ' || sqlstate || ' ' || sqlerrm || ' detail=' || coalesce(nullif(v_detail, ''), '-');
end $$;

create function pg_temp.neuer_speaker(p_ed uuid, p_by uuid, p_nachname text) returns uuid language plpgsql as $$
declare v_p uuid; v_sp uuid;
begin
  insert into person (first_name, last_name) values ('ZZ', p_nachname) returning id into v_p;
  insert into person_email (person_id, email, is_primary) values (v_p, 'zz-ase-' || lower(p_nachname) || '-' || v_p::text || '@example.com', true);
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at, created_by)
    values (v_p, p_ed, 'panelist', 'confirmed', now(), p_by) returning id into v_sp;
  return v_sp;
end $$;

-- Alles weg, dann höchstens eine Rolle.
create function pg_temp.zz_rolle(p_person uuid, p_role text, p_scope text default 'global', p_scope_id uuid default null) returns void language plpgsql as $$
begin
  delete from role_assignment where person_id = p_person;
  if p_role is not null then
    insert into role_assignment (person_id, role, scope_type, scope_id) values (p_person, p_role, p_scope, p_scope_id);
  end if;
end $$;

-- Die Zeilen der Funktion als Text: je Zeile Titel, veröffentlicht, Stand, Begleitung, Weg und die drei Zeitpunkte in vollen Stunden nach `p_base`.
create function pg_temp.zeilen(p_profil uuid, p_base timestamptz) returns text language sql as $$
  select count(*)::text || ' Zeilen: ' || coalesce(string_agg(
           r.title_de || '|' || r.published::text || '|' || r.status || '|' || r.guests::text || '|' || r.via
           || '|inv=' || (extract(epoch from (r.invited_at - p_base)) / 3600)::integer::text
           || '|mail=' || coalesce((extract(epoch from (r.mailed_at - p_base)) / 3600)::integer::text, '-')
           || '|resp=' || coalesce((extract(epoch from (r.responded_at - p_base)) / 3600)::integer::text, '-'),
           ' / ' order by r.ord), '-')
    from (select s.*, row_number() over () as ord from speaker_side_events(p_profil) s) r
$$;

do $$
declare
  v_ed uuid; v_ed2 uuid; v_pid uuid; v_uid uuid; v_email text; v_claims text; v_base timestamptz;
  v_s1 uuid; v_s2 uuid; v_s3 uuid; v_sown uuid;
  v_e1 uuid; v_e2 uuid; v_e3 uuid; v_e4 uuid;
  v_org uuid; v_stage uuid; v_n integer; v_r text; v_json text; v_a1 integer; v_a2 integer; v_i1 text; v_i2 text;
begin
  -- Eine Testperson mit Konto, die in der Edition noch **kein** Speaker-Profil hat (sie bekommt unten eines, für den Fall „der Speaker selbst“).
  select e.id into v_ed from event e where e.is_edition order by e.start_date desc limit 1;
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null
     and not exists (select 1 from speaker_profile sp where sp.person_id = p.id and sp.edition_id = v_ed)
   order by p.created_at limit 1;
  if v_pid is null then raise exception 'VORBEDINGUNG: eine Person mit Konto ohne Speaker-Profil in der jüngsten Edition fehlt'; end if;
  select s.id into v_stage from stage s limit 1;
  if v_stage is null then raise exception 'VORBEDINGUNG: keine Bühne im Bestand'; end if;
  v_claims := json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text;
  perform set_config('request.jwt.claims', v_claims, true);
  v_base := date_trunc('hour', now());

  -- Aufbau: drei Speaker, drei Events dieser Edition (eines davon nicht veröffentlicht), ein Event einer **anderen** Edition.
  v_s1 := pg_temp.neuer_speaker(v_ed, v_pid, 'Eins');
  v_s2 := pg_temp.neuer_speaker(v_ed, v_pid, 'Zwei');
  v_s3 := pg_temp.neuer_speaker(v_ed, v_pid, 'Drei');
  -- Die Reihenfolge nach Beginn (Empfang, Dinner, Brunch) weicht von jeder anderen ab, nach der man versehentlich sortieren könnte: Anlage
  -- (Dinner, Brunch, Empfang — `created_at` ist gesetzt, sonst wären alle in einer Transaktion gleich), Id (Brunch, Dinner, Empfang — feste Ids)
  -- und Titel (Brunch, Dinner, Empfang).
  insert into side_event (id, edition_id, title_de, title_en, location, starts_at, ends_at, published, created_by, created_at)
    values ('a0870000-0000-4000-8000-000000000002', v_ed, 'ZZ Dinner', 'ZZ Dinner EN', 'ZZ Hafenbar', v_base + interval '21 days', v_base + interval '21 days 2 hours', true, v_pid,
            v_base - interval '3 days') returning id into v_e1;
  insert into side_event (id, edition_id, title_de, title_en, location, starts_at, ends_at, published, created_by, created_at)
    values ('a0870000-0000-4000-8000-000000000001', v_ed, 'ZZ Brunch', 'ZZ Brunch EN', 'ZZ Speicherstadt', v_base + interval '22 days', null, false, v_pid,
            v_base - interval '2 days') returning id into v_e2;
  insert into side_event (id, edition_id, title_de, title_en, location, starts_at, ends_at, published, created_by, created_at)
    values ('a0870000-0000-4000-8000-000000000003', v_ed, 'ZZ Empfang', 'ZZ Empfang EN', 'ZZ Rathaus', v_base + interval '20 days', v_base + interval '20 days 90 minutes', true, v_pid,
            v_base - interval '1 day') returning id into v_e3;
  insert into event (name, format_tag, slug, is_edition, timezone)
    values ('ZZ Edition 2', 'summit', 'zz-adm087-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), true, 'Europe/Berlin') returning id into v_ed2;
  insert into side_event (edition_id, title_de, title_en, location, starts_at, published, created_by)
    values (v_ed2, 'ZZ Andere Edition', 'ZZ Other Edition', 'ZZ Ort', v_base + interval '19 days', true, v_pid) returning id into v_e4;

  -- Die Einladungen von Speaker 1: je Zeile andere Werte in jeder Spalte, damit eine vertauschte Spalte auffällt. Hinweis und Token stehen in der Zeile.
  insert into side_event_invite (side_event_id, profile_id, status, guests, note, via, invited_by, invited_at, mailed_at, responded_at, token_hash) values
    (v_e3, v_s1, 'invited', 0, null,             'team',   v_pid, v_base,                       null,                         null,                         null),
    (v_e1, v_s1, 'yes',     2, 'ZZ vegetarisch', 'email',  v_pid, v_base + interval '1 hour',   v_base + interval '2 hours',  v_base + interval '3 hours',  repeat('c', 64)),
    (v_e2, v_s1, 'no',      0, 'ZZ keine Zeit',  'portal', v_pid, v_base + interval '4 hours',  v_base + interval '5 hours',  v_base + interval '6 hours',  null);
  -- Speaker 2: dasselbe Event wie Speaker 1 beim Dinner, anderer Stand. Speaker 3: keine Einladung.
  insert into side_event_invite (side_event_id, profile_id, status, guests, note, via, invited_by, invited_at, mailed_at, responded_at, token_hash) values
    (v_e1, v_s2, 'yes',     1, 'ZZ Nüsse',       'portal', v_pid, v_base + interval '7 hours',  null,                         v_base + interval '8 hours',  repeat('d', 64));
  -- Eine Einladung von Speaker 1 zu einem Event einer anderen Edition (so etwas legen die Funktionen nicht an; die Zeile soll trotzdem nicht auftauchen).
  insert into side_event_invite (side_event_id, profile_id, status, via, invited_at) values (v_e4, v_s1, 'invited', 'team', v_base);

  -- === 01 · Form ===============================================================================================================
  insert into t_res values ('01_form',
    'ok definer=' || (select p.prosecdef::text from pg_proc p where p.oid = 'speaker_side_events(uuid)'::regprocedure)
    || ' stable=' || (select (p.provolatile = 's')::text from pg_proc p where p.oid = 'speaker_side_events(uuid)'::regprocedure)
    || ' pfad=' || (select (p.proconfig::text like '%search_path=public, extensions%')::text from pg_proc p where p.oid = 'speaker_side_events(uuid)'::regprocedure)
    || ' anon=' || has_function_privilege('anon', 'speaker_side_events(uuid)', 'execute')::text
    || ' authenticated=' || has_function_privilege('authenticated', 'speaker_side_events(uuid)', 'execute')::text);
  v_r := pg_get_function_result('speaker_side_events(uuid)'::regprocedure);
  insert into t_res values ('01_spaltenliste', v_r || ' ohne_note=' || (v_r !~* 'note')::text || ' ohne_token=' || (v_r !~* 'token')::text);

  -- === 02 · Das Team sieht die Zeilen ============================================================================================
  perform pg_temp.zz_rolle(v_pid, 'area_lead_speaker');
  insert into t_res values ('02_team_sieht', pg_temp.zeilen(v_s1, v_base));
  insert into t_res values ('02_event_spalten',
    (select 'dinner: en=' || r.title_en || ' ort=' || r.location || ' start=+' || round(extract(epoch from (r.starts_at - v_base)) / 86400)::text || 'd dauer=' || (r.ends_at - r.starts_at)::text
       from speaker_side_events(v_s1) r where r.side_event_id = v_e1)
    || ' ' ||
    (select 'brunch: en=' || r.title_en || ' ende=' || coalesce(r.ends_at::text, 'NULL') || ' start=+' || round(extract(epoch from (r.starts_at - v_base)) / 86400)::text || 'd'
       from speaker_side_events(v_s1) r where r.side_event_id = v_e2));

  -- === 03 · Nur dieses Profil, nur diese Edition ==================================================================================
  insert into t_res values ('03_nur_dieses_profil', 's2=' || pg_temp.zeilen(v_s2, v_base) || ' s3=' || pg_temp.zeilen(v_s3, v_base));
  insert into t_res values ('03_andere_edition',
    'einladung_da=' || exists (select 1 from side_event_invite i where i.side_event_id = v_e4 and i.profile_id = v_s1)::text
    || ' event_da=' || exists (select 1 from side_event e where e.id = v_e4 and e.published)::text
    || ' nicht_dabei=' || (not exists (select 1 from speaker_side_events(v_s1) r where r.side_event_id = v_e4 or r.title_de = 'ZZ Andere Edition'))::text);

  -- === 04 · Weder Hinweis noch Token ==============================================================================================
  select string_agg(to_jsonb(r)::text, ' ') into v_json from speaker_side_events(v_s1) r;
  insert into t_res values ('04_ohne_note_und_token',
    'fixture_note=' || exists (select 1 from side_event_invite i where i.profile_id = v_s1 and i.note like '%vegetarisch%')::text
    || ' fixture_token=' || exists (select 1 from side_event_invite i where i.profile_id = v_s1 and i.token_hash = repeat('c', 64))::text
    || ' note_im_ergebnis=' || (v_json ~* 'note' or v_json ~ 'vegetarisch|keine Zeit')::text
    || ' token_im_ergebnis=' || (v_json ~* 'token' or v_json like '%cccccccc%')::text);

  -- === 05 · Die drei Rollen des Teams =============================================================================================
  v_r := '';
  perform pg_temp.zz_rolle(v_pid, 'admin');
  select count(*) into v_n from speaker_side_events(v_s1);
  v_r := 'admin=' || v_n::text;
  perform pg_temp.zz_rolle(v_pid, 'area_lead_speaker');
  select count(*) into v_n from speaker_side_events(v_s1);
  v_r := v_r || ' area_lead_speaker=' || v_n::text;
  perform pg_temp.zz_rolle(v_pid, 'programme_team');
  select count(*) into v_n from speaker_side_events(v_s1);
  insert into t_res values ('05_rechte_je_rolle', v_r || ' programme_team=' || v_n::text);

  -- === 06 · Abweisungen, je mit dem Gegenstück oben (das Team sieht dieselben Zeilen) ==============================================
  perform pg_temp.zz_rolle(v_pid, 'speaker_manager', 'stage', v_stage);
  insert into t_res values ('06_stage_lead', pg_temp.abgewiesen(format('select * from speaker_side_events(%L)', v_s1)));
  -- Der Stage Lead, der diesen Speaker betreut: `can_manage_speaker` ist wahr, die Einladungen bleiben trotzdem zu (enge Fassung).
  update speaker_profile set owner_person_id = v_pid where id = v_s1;
  insert into t_res values ('06_stage_lead_betreuer', 'kann_verwalten=' || can_manage_speaker(v_s1)::text || ' ' || pg_temp.abgewiesen(format('select * from speaker_side_events(%L)', v_s1)));
  update speaker_profile set owner_person_id = null where id = v_s1;

  insert into organization (legal_name) values ('ZZ Partner GmbH') returning id into v_org;
  perform pg_temp.zz_rolle(v_pid, 'standbuehne_editor', 'org', v_org);
  insert into t_res values ('06_partner', pg_temp.abgewiesen(format('select * from speaker_side_events(%L)', v_s1)));

  perform pg_temp.zz_rolle(v_pid, null);
  insert into t_res values ('06_ohne_rolle', pg_temp.abgewiesen(format('select * from speaker_side_events(%L)', v_s1)));

  update speaker_profile set assistant_person_id = v_pid where id = v_s1;
  insert into t_res values ('06_assistenz', pg_temp.abgewiesen(format('select * from speaker_side_events(%L)', v_s1)));
  update speaker_profile set assistant_person_id = null where id = v_s1;

  -- Der Speaker selbst: ein eigenes Profil mit eigener Einladung; er liest sie über `my_side_events`, nicht hierüber.
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at, created_by)
    values (v_pid, v_ed, 'panelist', 'confirmed', now(), v_pid) returning id into v_sown;
  insert into side_event_invite (side_event_id, profile_id, status, via, invited_at) values (v_e1, v_sown, 'invited', 'team', v_base);
  insert into t_res values ('06_speaker_selbst', pg_temp.abgewiesen(format('select * from speaker_side_events(%L)', v_sown)));

  insert into t_res values ('06_unbekannt_ohne_recht', pg_temp.abgewiesen(format('select * from speaker_side_events(%L)', gen_random_uuid())));
  perform pg_temp.zz_rolle(v_pid, 'programme_team');
  insert into t_res values ('06_unbekannt_team', pg_temp.abgewiesen(format('select * from speaker_side_events(%L)', gen_random_uuid())));
  insert into t_res values ('06_null_team', pg_temp.abgewiesen('select * from speaker_side_events(null)'));
  perform set_config('request.jwt.claims', '', true);
  insert into t_res values ('06_ohne_anmeldung', pg_temp.abgewiesen(format('select * from speaker_side_events(%L)', v_s1)));
  perform set_config('request.jwt.claims', v_claims, true);

  -- === 07 · Die Rechte der Rollen `authenticated` und `anon` ======================================================================
  perform pg_temp.zz_rolle(v_pid, 'area_lead_speaker');
  execute 'set local role authenticated';
  begin
    select count(*) into v_n from speaker_side_events(v_s1);
    v_r := 'authenticated=' || v_n::text;
  exception when others then v_r := 'authenticated=' || sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  execute 'set local role anon';
  begin
    perform speaker_side_events(v_s1);
    v_r := v_r || ' anon=ALLOWED (BUG)';
  exception when others then v_r := v_r || ' anon=' || sqlstate; end;
  execute 'reset role';
  insert into t_res values ('07_rollen_authenticated_anon', v_r);

  -- === 08 · Nur lesend ============================================================================================================
  select count(*)::integer into v_a1 from audit_log;
  select md5(string_agg(i::text, '|' order by i.side_event_id, i.profile_id)) into v_i1 from side_event_invite i;
  perform count(*) from speaker_side_events(v_s1);
  perform count(*) from speaker_side_events(v_s2);
  select count(*)::integer into v_a2 from audit_log;
  select md5(string_agg(i::text, '|' order by i.side_event_id, i.profile_id)) into v_i2 from side_event_invite i;
  insert into t_res values ('08_nur_lesend', 'audit_gleich=' || (v_a1 = v_a2)::text || ' einladungen_gleich=' || (v_i1 = v_i2)::text);
end $$;
insert into t_res
  select '99_auswertung',
         case when count(*) filter (where not z.erfuellt) = 0 then 'ok: alle ' || count(*)::text || ' Erwartungen erfüllt'
              else 'FEHLER: ' || string_agg(z.step, ', ' order by z.step) filter (where not z.erfuellt) end
    from (select e.step, exists (select 1 from t_res r where r.step = e.step and r.result ~ e.muster) as erfuellt from t_erw e) z;
select * from t_res order by step;
rollback;
