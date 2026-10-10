-- Smoke-Test v6_lead053_prio_nur_team (Vorschlag, LEAD-053): die A-/B-/C-Einstufung (`speaker_profile.priority`, „Prio“) ist Sache des Teams — Stage Leads (Manager ohne Team-Rolle) sehen sie nirgends
-- und setzen sie nicht, auch nicht direkt über die Tabelle (Spalten-Grants). Mit echtem Rollenwechsel an Wegwerf-Konten (ZZ …, mit eigener `auth_user_id`; `current_person_id()` kommt aus den
-- JWT-Claims): L ein Stage Lead (Rolle `speaker_manager` mit Bühne als Bereich, Betreuer des Profils ⇒ `can_manage_speaker`), T das Team (`area_lead_speaker`), S die Speakerin des Profils, E eine Fremde ohne
-- Rolle. Alles wird zurückgerollt. Erwartung je Schritt als Muster in `t_erw`; `99_auswertung` am Ende. Jede Aktion steht in einer eigenen Anweisung.
--   00 Form: die drei Funktionen — `anon` ohne EXECUTE, `authenticated` ja, DEFINER, `search_path` gepinnt.
--   01 `manager_speakers`: L bekommt `priority` als NULL, aber weiter Thema und interne Notiz (K-36 F1 bleibt); das Team den Wert; eine Fremde 42501.
--   02 `speaker_detail`: dasselbe — für L steht der Schlüssel `priority` da, mit `null`; die interne Notiz bleibt dem Team (wie bisher); das Team den Wert; eine Fremde 42501.
--   03 `update_speaker`: L setzt `priority` ⇒ 42501 `team_only_fields` (auch mit leerem Wert — es zählt der mitgeschickte Schlüssel), der Wert im Profil bleibt; dieselbe Funktion nimmt von L weiter
--      Thema, „Kontakt via“ und interne Notiz an; das Team setzt `priority`; die Fremde 42501 `not allowed`; ein abgewiesener Aufruf hinterlässt keinen Audit-Eintrag, ein angenommener einen.
--   04 Direkt über die Tabelle (Rolle `authenticated`): für L **und** das Team ergibt `priority` 42501, ebenso `select *` und jede der fünf anderen nicht gewährten Spalten; jede der 50 gewährten
--      Spalten lässt sich lesen (eine Zeile); die Speakerin und eine Fremde bekommen wie bisher keine Zeile (kein Fehler); `anon` nichts.
--   05 Die Policies anderer Tabellen, die `speaker_profile` mit Nutzerrechten abfragen (`speaker_asset`, `expense_claim`, `hospitality_booking`), laufen weiter ohne Fehler.
--   06 Die Rechte der Tabelle: genau die 56 Spalten, davon 50 lesbar für `authenticated`; kein Tabellenrecht, kein Schreibrecht, `anon` nichts.
--   07 Funktionen, die als Eigentümer lesen, merken nichts: `my_speaker_profile()` der Speakerin liefert ihr Profil.
-- Probelauf der Build-Session am 10.10.2026 gegen die Live-Datenbank nach 0303 (`sh scripts/db.sh dry-run`, alles zurückgerollt): 8 von 8 Erwartungen erfüllt. Ohne die Migration
-- (`sh scripts/db.sh test`) sind 01 bis 04 und 06 rot — das ist der Befund: ein Stage Lead liest `priority` über `manager_speakers` (`l_prio=a`), über `speaker_detail` und **direkt über die
-- Tabelle** (`select priority` und `select *` ergeben `ok n=1`, keiner der sechs nicht gewährten Spalten fehlt das Recht) und setzt sie mit `update_speaker`. Mutationsproben an der Migration
-- (28, je Regel eine — Schutz der Prio in beiden Lesefunktionen und seine Umkehrung, „Stage Lead zählt als Team“, zu viel versteckt, Notiz für alle, das Team-Feld im Schlüsselvergleich und
-- zwei zu viel, nicht mehr DEFINER, Entzug des Tabellenrechts fehlt oder gilt nur für `anon`, jede der fünf ausgenommenen Spalten und `priority` gewährt, `id`/`edition_id`/`assistant_person_id`/
-- `topic_role`/`internal_notes` nicht gewährt, Tabellenrecht zusätzlich, Spaltenrecht für `anon`, Schreibrecht, Härtung ersetzt durch ein `anon`-Recht): alle 28 rot. `fn-diff`: je Funktion genau
-- eine Zeile. Die elf bestehenden DB-Tests, die `speaker_profile` unter `authenticated` berühren, laufen mit der Migration unverändert — bis auf `v6_lead039_einordnung`, das K-36 F1 für die Prio
-- festhielt (angepasst: Stage Lead schreibt die sechs übrigen Felder, sieht die Prio als NULL, setzt sie nicht).
begin;
create temp table t_res (step text, result text) on commit drop;
create temp table t_erw (step text, muster text) on commit drop;
insert into t_erw values
  ('00_form', '^ok manager\(anon=false auth=true definer=true pfad=true\) detail\(anon=false auth=true definer=true pfad=true\) update\(anon=false auth=true definer=true pfad=true\)$'),
  ('01_manager_speakers', '^ok l_prio=NULL l_thema=ZZ Thema l_notiz=ZZ Notiz team_prio=a team_thema=ZZ Thema fremde=42501$'),
  ('02_speaker_detail', '^ok l_prio=null l_thema=ZZ Thema l_notiz=fehlt l_sichtbar=false team_prio=a team_notiz=ZZ Notiz team_sichtbar=true fremde=42501$'),
  ('03_update_speaker', '^ok l_prio=42501 team_only_fields l_leer=42501 team_only_fields prio_danach=a l_thema=ok thema=ZZ Thema 2 l_via=ok l_notiz=ok notiz=ZZ Notiz 2 team=ok prio_team=b fremde=42501 not allowed audit_abgewiesen=0 audit_angenommen=4$'),
  ('04_tabelle_direkt', '^ok l_prio=42501 l_stern=42501 l_gewaehrt=50/50 l_ausgenommen=5/5 team_prio=42501 team_stern=42501 team_gewaehrt=50/50 team_ausgenommen=5/5 l_zeile=ok n=1 sprecherin=ok n=0 fremde=ok n=0 anon=42501$'),
  ('05_policies', '^ok asset_l=ok n=1 asset_s=ok n=0 asset_t=ok n=1 asset_e=ok n=0 spesen_l=ok n=0 spesen_s=ok n=0 hotel_l=ok n=0 hotel_e=ok n=0$'),
  ('06_rechte', '^ok spalten=56 abweichungen=0 gewaehrt=50 tabelle=false anon=false schreiben=false$'),
  ('07_eigentuemer', '^ok id=true$');

-- Hilfen -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- Eine Wegwerf-Person mit eigenem Konto (`person.auth_user_id` verweist auf `auth.users`).
create function pg_temp.person(p_name text) returns uuid language plpgsql as $$
declare v_u uuid := gen_random_uuid(); v_id uuid;
begin
  insert into auth.users (id, email, aud, role) values (v_u, lower(replace(p_name, ' ', '-')) || '@zzprio.test', 'authenticated', 'authenticated');
  insert into person (first_name, last_name, preferred_language, auth_user_id) values ('Xaver', p_name, 'en', v_u) returning id into v_id;
  return v_id;
end $$;

-- Als diese Person handeln (JWT-Claims); ohne Person: ohne Anmeldung.
create function pg_temp.als(p_person uuid) returns void language plpgsql as $$
begin
  if p_person is null then
    perform set_config('request.jwt.claims', '', true);
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', (select auth_user_id from person where id = p_person), 'role', 'authenticated')::text, true);
  end if;
end $$;

create function pg_temp.form(p_sig text) returns text language sql as $$
  select '(anon=' || has_function_privilege('anon', p_sig, 'execute')::text
      || ' auth=' || has_function_privilege('authenticated', p_sig, 'execute')::text
      || ' definer=' || (select p.prosecdef from pg_proc p where p.oid = p_sig::regprocedure)::text
      || ' pfad=' || (select coalesce(p.proconfig::text, '') like '%search_path=%' from pg_proc p where p.oid = p_sig::regprocedure)::text || ')'
$$;

-- Ein Feld der Zeile aus `manager_speakers()` als Text: der Wert, `NULL`, `keine Zeile` oder `SQLSTATE`.
create function pg_temp.ms_feld(p_person uuid, p_profil uuid, p_spalte text) returns text language plpgsql as $$
declare v text; v_gefunden boolean;
begin
  perform pg_temp.als(p_person);
  execute format('select coalesce(m.%I::text, ''NULL''), true from manager_speakers() m where m.id = $1', p_spalte) into v, v_gefunden using p_profil;
  return case when v_gefunden then v else 'keine Zeile' end;
exception when others then
  return sqlstate;
end $$;

-- Ein Schlüssel aus `speaker_detail()` als Text: der Wert, `null` (der Schlüssel steht da, JSON-null), `fehlt` (kein Schlüssel) oder `SQLSTATE`.
create function pg_temp.sd_feld(p_person uuid, p_profil uuid, p_schluessel text) returns text language plpgsql as $$
declare d jsonb;
begin
  perform pg_temp.als(p_person);
  d := speaker_detail(p_profil);
  return case when not d ? p_schluessel then 'fehlt' when jsonb_typeof(d -> p_schluessel) = 'null' then 'null' else d ->> p_schluessel end;
exception when others then
  return sqlstate;
end $$;

-- `update_speaker`: `ok` oder `SQLSTATE meldung`.
create function pg_temp.upd(p_person uuid, p_profil uuid, p_data jsonb) returns text language plpgsql as $$
begin
  perform pg_temp.als(p_person);
  perform update_speaker(p_profil, p_data);
  return 'ok';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;

-- Eine Abfrage mit den Rechten der Rolle `authenticated` (oder `anon`) und den Claims der Person: `ok n=<Zeilen>` oder `SQLSTATE`.
create function pg_temp.lies(p_person uuid, p_sql text, p_rolle text default 'authenticated') returns text language plpgsql as $$
declare v_n bigint;
begin
  perform pg_temp.als(p_person);
  execute 'set local role ' || quote_ident(p_rolle);
  execute 'select count(*) from (' || p_sql || ') q' into v_n;
  execute 'reset role';
  return 'ok n=' || v_n;
exception when others then
  execute 'reset role';
  return sqlstate;
end $$;

do $$
declare
  v_ed uuid; v_ev uuid; v_st uuid; v_l uuid; v_t uuid; v_s uuid; v_e uuid; v_p uuid; v_asset uuid;
  v_s1 text; v_r text; v_n integer; v_m integer; v_k text; v_audit integer; v_audit2 integer;
  v_gewaehrt text[] := array[
    'id', 'person_id', 'edition_id', 'speaker_type', 'pipeline_status', 'owner_person_id', 'job_title', 'organization_name', 'org_id',
    'bio_short_en', 'bio_short_de', 'bio_long_en', 'bio_long_de', 'socials', 'photo_asset_id',
    'reception_eligible', 'lounge_access', 'pass_type', 'hotel_tier', 'hospitality_status',
    'travel_costs_covered', 'travel_costs_approved_by', 'travel_costs_approved_at', 'tech_rider', 'assistant_person_id', 'internal_notes',
    'invited_at', 'created_at', 'updated_at', 'lead_contact_id', 'buddy_contact_id', 'confirmed_at', 'declined_at', 'decline_reason',
    'contact_first_name', 'contact_last_name', 'contact_email', 'contact_phone', 'contact_kind', 'contact_consent_at',
    'expense_mode', 'expense_lump_sum_cents', 'category', 'topic_cluster', 'topic_role', 'recommended_format', 'contact_via', 'outreach_channel',
    'stage_guest', 'mail_via_contact_id'];
  v_ausgenommen text[] := array['created_by', 'created_by_org_id', 'partner_editable_until_login', 'stage_guest_consent_at', 'companion_quota'];
begin
  -- ---- Aufbau: L Stage Lead und Betreuer des Profils, T Team, S die Speakerin, E fremd; P das Profil (nicht zugesagt), `priority` = a.
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  v_l := pg_temp.person('ZZPrio L'); v_t := pg_temp.person('ZZPrio T'); v_s := pg_temp.person('ZZPrio S'); v_e := pg_temp.person('ZZPrio E');
  -- Ein Stage Lead hat seine Bühne als Bereich (CHECK `role_assignment_stage_lead_scope_chk`, PORT3): Wegwerf-Summit mit einer Bühne.
  insert into event (name, format_tag, edition_id, slug, timezone) values ('ZZ Summit', 'summit', v_ed, 'zz-lead053-' || substr(md5(random()::text), 1, 8), 'Europe/Berlin') returning id into v_ev;
  insert into stage (event_id, name, slug, room) values (v_ev, 'ZZ Main', 'zz-main', 'Saal 1') returning id into v_st;
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id) values (v_l, 'speaker_manager', 'stage', v_st, v_ed);
  insert into role_assignment (person_id, role, scope_type) values (v_t, 'area_lead_speaker', 'global');
  insert into speaker_profile (person_id, edition_id, speaker_type, owner_person_id, priority, topic_role, internal_notes)
  values (v_s, v_ed, 'panelist', v_l, 'a', 'ZZ Thema', 'ZZ Notiz') returning id into v_p;
  insert into speaker_asset (profile_id, kind, storage_path, filename) values (v_p, 'other', 'zz-lead053/' || v_p::text || '/other/zz.pdf', 'zz.pdf') returning id into v_asset;

  -- ---- 00 Form
  insert into t_res values ('00_form',
    'ok manager' || pg_temp.form('manager_speakers(uuid)') || ' detail' || pg_temp.form('speaker_detail(uuid)') || ' update' || pg_temp.form('update_speaker(uuid,jsonb)'));

  -- ---- 01 manager_speakers
  v_s1 := 'ok l_prio=' || pg_temp.ms_feld(v_l, v_p, 'priority');
  v_s1 := v_s1 || ' l_thema=' || pg_temp.ms_feld(v_l, v_p, 'topic_role');
  v_s1 := v_s1 || ' l_notiz=' || pg_temp.ms_feld(v_l, v_p, 'internal_notes');
  v_s1 := v_s1 || ' team_prio=' || pg_temp.ms_feld(v_t, v_p, 'priority');
  v_s1 := v_s1 || ' team_thema=' || pg_temp.ms_feld(v_t, v_p, 'topic_role');
  v_s1 := v_s1 || ' fremde=' || pg_temp.ms_feld(v_e, v_p, 'priority');
  insert into t_res values ('01_manager_speakers', v_s1);

  -- ---- 02 speaker_detail
  v_s1 := 'ok l_prio=' || pg_temp.sd_feld(v_l, v_p, 'priority');
  v_s1 := v_s1 || ' l_thema=' || pg_temp.sd_feld(v_l, v_p, 'topic_role');
  v_s1 := v_s1 || ' l_notiz=' || pg_temp.sd_feld(v_l, v_p, 'internal_notes');
  v_s1 := v_s1 || ' l_sichtbar=' || pg_temp.sd_feld(v_l, v_p, 'internal_notes_visible');
  v_s1 := v_s1 || ' team_prio=' || pg_temp.sd_feld(v_t, v_p, 'priority');
  v_s1 := v_s1 || ' team_notiz=' || pg_temp.sd_feld(v_t, v_p, 'internal_notes');
  v_s1 := v_s1 || ' team_sichtbar=' || pg_temp.sd_feld(v_t, v_p, 'internal_notes_visible');
  v_s1 := v_s1 || ' fremde=' || pg_temp.sd_feld(v_e, v_p, 'priority');
  insert into t_res values ('02_speaker_detail', v_s1);

  -- ---- 03 update_speaker
  v_s1 := 'ok l_prio=' || pg_temp.upd(v_l, v_p, jsonb_build_object('priority', 'b'));
  v_s1 := v_s1 || ' l_leer=' || pg_temp.upd(v_l, v_p, jsonb_build_object('priority', ''));
  v_s1 := v_s1 || ' prio_danach=' || (select sp.priority from speaker_profile sp where sp.id = v_p);
  select count(*) into v_audit from audit_log a where a.action = 'speaker.update' and a.object_id = v_p::text;
  v_s1 := v_s1 || ' l_thema=' || pg_temp.upd(v_l, v_p, jsonb_build_object('topic_role', 'ZZ Thema 2'));
  v_s1 := v_s1 || ' thema=' || (select sp.topic_role from speaker_profile sp where sp.id = v_p);
  v_s1 := v_s1 || ' l_via=' || pg_temp.upd(v_l, v_p, jsonb_build_object('contact_via', 'über ZZ'));
  v_s1 := v_s1 || ' l_notiz=' || pg_temp.upd(v_l, v_p, jsonb_build_object('internal_notes', 'ZZ Notiz 2'));
  v_s1 := v_s1 || ' notiz=' || (select sp.internal_notes from speaker_profile sp where sp.id = v_p);
  v_s1 := v_s1 || ' team=' || pg_temp.upd(v_t, v_p, jsonb_build_object('priority', 'b'));
  v_s1 := v_s1 || ' prio_team=' || (select sp.priority from speaker_profile sp where sp.id = v_p);
  v_s1 := v_s1 || ' fremde=' || pg_temp.upd(v_e, v_p, jsonb_build_object('priority', 'c'));
  select count(*) into v_audit2 from audit_log a where a.action = 'speaker.update' and a.object_id = v_p::text;
  -- Audit: die abgewiesenen Aufrufe (L mit Prio ×2, vorher gezählt; die Fremde, nachher mitgezählt) hinterlassen nichts; angenommen wurden vier (Thema, Kontakt via, Notiz von L, Prio vom Team).
  v_s1 := v_s1 || ' audit_abgewiesen=' || v_audit;
  v_s1 := v_s1 || ' audit_angenommen=' || (v_audit2 - v_audit);
  insert into t_res values ('03_update_speaker', v_s1);

  -- ---- 04 Direkt über die Tabelle
  v_s1 := 'ok l_prio=' || pg_temp.lies(v_l, format('select priority from speaker_profile where id = %L', v_p));
  v_s1 := v_s1 || ' l_stern=' || pg_temp.lies(v_l, format('select * from speaker_profile where id = %L', v_p));
  v_n := 0; v_m := 0;
  foreach v_k in array v_gewaehrt loop
    if pg_temp.lies(v_l, format('select %I from speaker_profile where id = %L', v_k, v_p)) = 'ok n=1' then v_n := v_n + 1; end if;
  end loop;
  v_s1 := v_s1 || ' l_gewaehrt=' || v_n || '/' || cardinality(v_gewaehrt);
  foreach v_k in array v_ausgenommen loop
    if pg_temp.lies(v_l, format('select %I from speaker_profile where id = %L', v_k, v_p)) = '42501' then v_m := v_m + 1; end if;
  end loop;
  v_s1 := v_s1 || ' l_ausgenommen=' || v_m || '/' || cardinality(v_ausgenommen);
  v_s1 := v_s1 || ' team_prio=' || pg_temp.lies(v_t, format('select priority from speaker_profile where id = %L', v_p));
  v_s1 := v_s1 || ' team_stern=' || pg_temp.lies(v_t, format('select * from speaker_profile where id = %L', v_p));
  v_n := 0; v_m := 0;
  foreach v_k in array v_gewaehrt loop
    if pg_temp.lies(v_t, format('select %I from speaker_profile where id = %L', v_k, v_p)) = 'ok n=1' then v_n := v_n + 1; end if;
  end loop;
  v_s1 := v_s1 || ' team_gewaehrt=' || v_n || '/' || cardinality(v_gewaehrt);
  foreach v_k in array v_ausgenommen loop
    if pg_temp.lies(v_t, format('select %I from speaker_profile where id = %L', v_k, v_p)) = '42501' then v_m := v_m + 1; end if;
  end loop;
  v_s1 := v_s1 || ' team_ausgenommen=' || v_m || '/' || cardinality(v_ausgenommen);
  v_s1 := v_s1 || ' l_zeile=' || pg_temp.lies(v_l, format('select id, person_id, edition_id, assistant_person_id, topic_role, internal_notes from speaker_profile where id = %L', v_p));
  v_s1 := v_s1 || ' sprecherin=' || pg_temp.lies(v_s, format('select id, person_id from speaker_profile where id = %L', v_p));
  v_s1 := v_s1 || ' fremde=' || pg_temp.lies(v_e, format('select id, person_id from speaker_profile where id = %L', v_p));
  v_s1 := v_s1 || ' anon=' || pg_temp.lies(null, format('select id from speaker_profile where id = %L', v_p), 'anon');
  insert into t_res values ('04_tabelle_direkt', v_s1);

  -- ---- 05 Policies anderer Tabellen (Unterabfragen auf speaker_profile mit Nutzerrechten): kein Fehler
  v_s1 := 'ok asset_l=' || pg_temp.lies(v_l, format('select id from speaker_asset where profile_id = %L', v_p));
  v_s1 := v_s1 || ' asset_s=' || pg_temp.lies(v_s, format('select id from speaker_asset where profile_id = %L', v_p));
  v_s1 := v_s1 || ' asset_t=' || pg_temp.lies(v_t, format('select id from speaker_asset where profile_id = %L', v_p));
  v_s1 := v_s1 || ' asset_e=' || pg_temp.lies(v_e, format('select id from speaker_asset where profile_id = %L', v_p));
  v_s1 := v_s1 || ' spesen_l=' || pg_temp.lies(v_l, format('select id from expense_claim where profile_id = %L', v_p));
  v_s1 := v_s1 || ' spesen_s=' || pg_temp.lies(v_s, format('select id from expense_claim where profile_id = %L', v_p));
  v_s1 := v_s1 || ' hotel_l=' || pg_temp.lies(v_l, format('select id from hospitality_booking where profile_id = %L', v_p));
  v_s1 := v_s1 || ' hotel_e=' || pg_temp.lies(v_e, format('select id from hospitality_booking where profile_id = %L', v_p));
  insert into t_res values ('05_policies', v_s1);

  -- ---- 06 Die Rechte der Tabelle
  select count(*) into v_n from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'speaker_profile';
  select count(*) into v_m from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'speaker_profile'
     and has_column_privilege('authenticated', 'public.speaker_profile', c.column_name, 'select') is distinct from
         (c.column_name = any (v_gewaehrt));
  insert into t_res values ('06_rechte',
    'ok spalten=' || v_n || ' abweichungen=' || v_m
    || ' gewaehrt=' || (select count(*) from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'speaker_profile'
                          and has_column_privilege('authenticated', 'public.speaker_profile', c.column_name, 'select'))
    || ' tabelle=' || has_table_privilege('authenticated', 'public.speaker_profile', 'select')::text
    || ' anon=' || has_any_column_privilege('anon', 'public.speaker_profile', 'select')::text
    || ' schreiben=' || (has_any_column_privilege('authenticated', 'public.speaker_profile', 'insert,update,references')
                         or has_table_privilege('authenticated', 'public.speaker_profile', 'insert,update,delete,truncate'))::text);

  -- ---- 07 Funktionen als Eigentümer
  perform pg_temp.als(v_s);
  insert into t_res values ('07_eigentuemer', 'ok id=' || ((my_speaker_profile() ->> 'id') = v_p::text)::text);
end $$;
insert into t_res
  select '99_auswertung',
         case when count(*) filter (where not z.erfuellt) = 0 then 'ok: alle ' || count(*)::text || ' Erwartungen erfüllt'
              else 'FEHLER: ' || string_agg(z.step, ', ' order by z.step) filter (where not z.erfuellt) end
    from (select e.step, exists (select 1 from t_res r where r.step = e.step and r.result ~ e.muster) as erfuellt from t_erw e) z;
select * from t_res order by step;
rollback;
