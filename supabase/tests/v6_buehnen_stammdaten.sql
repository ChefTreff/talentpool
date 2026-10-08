-- Smoke-Test v6_buehnen_stammdaten (Vorschlag, ADM-085 / LEAD-061 / LEAD-062): Art der Bühne (`stage.kind`, generiert), Gültigkeitstage
-- (`stage.valid_days`) und Sperrzeiten (`stage_blocked_time`), geprüft in create_slot, move_slot und partner_create_session.
-- Ablauf mit echtem Rollenwechsel (`set local role authenticated`); jede Prüfung hat ein Gegenstück (erlaubt neben verboten), „0 Treffer“
-- allein beweist nichts. Erwartung je Schritt als Muster in `t_erw`; `99_auswertung` am Ende.
--   01 Form: `kind` generiert, Spalten lesbar, `stage_blocked_time` mit RLS und ohne Grants, Rechte der Funktionen.
--   02 Abbildung `kind` für alle Arten mit und ohne Partner; ein Schreibversuch auf die Spalte scheitert (428C9); die vier ChefTreff-Bühnen sind `main`.
--   03 `upsert_stage`: ohne Art `main`, Gültigkeitstage sortiert/dedupliziert/leer, falsches Datum und Nicht-Array `invalid_valid_day`.
--   04 Rechte der Sperrzeiten: Tor = Abschnitt `programme`; Stage Lead und Standbühnen-Editor lesen, schreiben nicht; ohne Rolle nichts; keine Tabellenrechte.
--   05 Sperrzeiten pflegen: Prüfung der Eingabe, `affected`, Ändern, Löschen, Audit.
--   06 `create_slot`: Sperrzeit (Bühne und alle Bühnen), halboffen, andere Bühne frei, Rahmen und feste Blöcke frei, Gültigkeitstage.
--   07 `move_slot`: Sperrzeit und Gültigkeitstage — **vor** der Rückfrage zur Veröffentlichung.
--   08 Hart für alle: Stage Lead und Standbühnen-Editor bekommen dieselbe Abweisung wie das Team.
--   09 `partner_create_session`: Gültigkeitstage der Fläche gelten, Sperrzeiten nicht (Slot-Art `partner_block`).
begin;
create temp table t_res (step text, result text) on commit drop;
create temp table t_erw (step text, muster text) on commit drop;
insert into t_erw values
  ('01_form', '^kind_generiert=true valid_days_default=true rls=true tabelle_ohne_grants=true spalten_lesbar=true helfer_ohne_execute=true rpcs_authenticated=true anon_nichts=true$'),
  ('02_kind_abbildung', '^main=main side=main main\+partner=branded side\+partner=branded partner_booth=booth room=masterclass interview_table=interview_table side_event_venue=side_event$'),
  ('02_kind_nicht_schreibbar', '^rejected 428C9$'),
  ('02_chef_treff_buehnen_main', '^nebenbuehne_uebrig=0$'),
  ('03_ohne_art_main', '^main kind=main$'),
  ('03_valid_days_sortiert', '^ok sortiert=true dedupliziert=true laenge=2$'),
  ('03_valid_days_leer', '^ok leer=true$'),
  ('03_valid_days_kein_eventtag', '^rejected 22023 invalid_valid_day$'),
  ('03_valid_days_kein_datum', '^rejected 22023 invalid_valid_day$'),
  ('03_valid_days_kein_array', '^rejected 22023 invalid_valid_day$'),
  ('03_valid_days_fremd_ohne_recht', '^rejected 42501$'),
  ('04_tor_programme_team', '^abschnitt=true lesen=true schreiben=true$'),
  ('04_tor_area_lead_speaker', '^abschnitt=true lesen=true schreiben=true$'),
  ('04_tor_area_lead_production', '^abschnitt=true lesen=true schreiben=true$'),
  ('04_tor_stage_lead', '^abschnitt=false lesen=true schreiben=42501 loeschen=42501$'),
  ('04_tor_standbuehne', '^abschnitt=false lesen=true schreiben=42501 loeschen=42501$'),
  ('04_tor_speaker', '^abschnitt=false lesen=42501 schreiben=42501 loeschen=42501$'),
  ('04_tor_ohne_rolle', '^abschnitt=false lesen=42501 schreiben=42501 loeschen=42501$'),
  ('04_tabelle_direkt', '^select=rejected 42501 insert=rejected 42501$'),
  ('05_anlegen', '^ok affected=0 stage=ZZ Hauptbuehne$'),
  ('05_anlegen_alle_buehnen', '^ok stage_leer=true$'),
  ('05_ende_vor_beginn', '^rejected 22023 invalid_blocked_time$'),
  ('05_ohne_grund', '^rejected 22023 invalid_blocked_time$'),
  ('05_grund_zu_lang', '^rejected 22023 invalid_blocked_time$'),
  ('05_buehne_anderes_event', '^rejected P0002 stage_not_found$'),
  ('05_trigger_buehne_anderes_event', '^rejected P0002 stage_not_found$'),
  ('05_unbekannte_id', '^rejected P0002 blocked_time_not_found$'),
  ('05_affected_vorhandene_slots', '^ok affected=1$'),
  ('05_aendern', '^ok grund=ZZ Opening neu$'),
  ('05_loeschen', '^ok weg=true$'),
  ('05_audit', '^upsert=[1-9]\d* delete=1 ohne_at_zeichen=true$'),
  ('06_in_sperrzeit', '^rejected P0001 slot_blocked detail=ZZ Opening neu · 10:00–12:00$'),
  ('06_ende_genau_am_beginn', '^ok$'),
  ('06_beginn_genau_am_ende', '^ok$'),
  ('06_eine_minute_drin', '^rejected P0001 slot_blocked detail=ZZ Opening neu · 10:00–12:00$'),
  ('06_andere_buehne_frei', '^ok$'),
  ('06_alle_buehnen_hauptbuehne', '^rejected P0001 slot_blocked detail=ZZ Alle · 14:00–15:00$'),
  ('06_alle_buehnen_nebenbuehne', '^rejected P0001 slot_blocked detail=ZZ Alle · 14:00–15:00$'),
  ('06_rahmen_in_sperrzeit_frei', '^ok$'),
  ('06_fester_block_in_sperrzeit_frei', '^ok$'),
  ('06_mehrtaegig_detail', '^rejected P0001 slot_blocked detail=ZZ Mehrtag · \d\d\.\d\d\. \d\d:\d\d – \d\d\.\d\d\. \d\d:\d\d$'),
  ('06_nach_loeschen_frei', '^ok$'),
  ('06_tag_nicht_gueltig', '^rejected P0001 stage_not_valid_that_day detail=\d\d\.\d\d\.\d{4}$'),
  ('06_tag_gueltig', '^ok$'),
  ('06_leere_gueltigkeit_alle_tage', '^ok$'),
  ('06_gueltigkeit_gilt_auch_fuer_rahmen', '^rejected P0001 stage_not_valid_that_day$'),
  ('06_geruest_art', '^branded \[\]$'),
  ('06_geruest_gueltigkeitstage', '^main \["\d{4}-\d\d-\d\d"\]$'),
  ('07_verschieben_in_sperrzeit','^rejected P0001 slot_blocked detail=ZZ Alle · 14:00–15:00$'),
  ('07_vor_der_rueckfrage', '^rejected P0001 slot_blocked$'),
  ('07_verschieben_frei_mit_rueckfrage', '^rejected P0001 confirmation_required$'),
  ('07_verschieben_bestaetigt', '^ok$'),
  ('07_verschieben_anderer_tag', '^rejected P0001 stage_not_valid_that_day$'),
  ('07_fester_block_verschieben_frei', '^ok$'),
  ('08_stage_lead_hart', '^rejected P0001 slot_blocked detail=ZZ Alle · 14:00–15:00$'),
  ('08_stage_lead_frei', '^ok$'),
  ('08_standbuehne_hart', '^rejected P0001 slot_blocked detail=ZZ Alle · 14:00–15:00$'),
  ('09_partner_tag_nicht_gueltig', '^rejected P0001 stage_not_valid_that_day$'),
  ('09_partner_sperrzeit_gilt_nicht', '^ok$');
do $$
declare
  v_pid uuid; v_uid uuid; v_email text;
  v_ev uuid; v_tz text; v_ed uuid; v_d1 event_day%rowtype; v_d2 event_day%rowtype;
  v_org uuid; v_org2 uuid; v_oe uuid; v_event_fremd uuid; v_stage_fremd uuid;
  s_main uuid; s_side uuid; s_b1 uuid; s_b2 uuid; s_booth uuid; s_room uuid; s_it uuid; s_sev uuid; s_valid uuid; s_new uuid; s_gueltig uuid;
  v_blk uuid; v_blk_all uuid; v_blk_multi uuid; v_res jsonb;
  v_slot uuid; v_slot2 uuid; v_slot3 uuid; v_slot_pub uuid; v_se uuid; v_slot_fb uuid;
  v_r text; v_det text; v_n integer; v_s text; v_ok boolean; v_lang text;
  v_rolle text; v_abs boolean; v_lesen text; v_schreiben text; v_loeschen text;
  t_d1 timestamptz; t_d2 timestamptz; v_t0 timestamptz := now();
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- Der Summit, wie ihn die Seite wählt: Veranstaltungen mit Bühnen, Summit zuerst; zwei Eventtage.
  select e.id, coalesce(e.timezone, 'Europe/Berlin'), coalesce(e.edition_id, e.id) into v_ev, v_tz, v_ed
    from event e where not e.is_edition and exists (select 1 from stage st where st.event_id = e.id)
   order by (e.format_tag is distinct from 'summit'), e.start_date limit 1;
  select * into v_d1 from event_day where event_id = v_ev order by day_date limit 1;
  select * into v_d2 from event_day where event_id = v_ev and day_date > v_d1.day_date order by day_date limit 1;
  if v_d2.id is null then raise exception 'der Test braucht einen Event mit zwei Tagen'; end if;

  -- === Aufbau (als Owner): Organisation, Bühnen aller Arten, ein zweites Event für den Gegenfall ==================
  insert into organization (legal_name, communication_name, type) values ('ZZ Bühnen GmbH', 'ZZ Bühnen', 'corporate') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  insert into stage (event_id, name, type) values (v_ev, 'ZZ Hauptbuehne', 'main') returning id into s_main;
  insert into stage (event_id, name, type) values (v_ev, 'ZZ Nebenbuehne', 'side') returning id into s_side;
  insert into stage (event_id, name, type, partner_org_id) values (v_ev, 'ZZ Gebrandet Haupt', 'main', v_org) returning id into s_b1;
  insert into stage (event_id, name, type, partner_org_id) values (v_ev, 'ZZ Gebrandet Neben', 'side', v_org) returning id into s_b2;
  insert into stage (event_id, name, type, partner_org_id) values (v_ev, 'ZZ Standbuehne', 'partner_booth', v_org) returning id into s_booth;
  insert into stage (event_id, name, type) values (v_ev, 'ZZ Raum', 'room') returning id into s_room;
  insert into stage (event_id, name, type, partner_org_id) values (v_ev, 'ZZ Tisch', 'interview_table', v_org) returning id into s_it;
  insert into stage (event_id, name, type, partner_org_id) values (v_ev, 'ZZ Side-Ort', 'side_event_venue', v_org) returning id into s_sev;
  insert into stage (event_id, name, type) values (v_ev, 'ZZ Gueltig', 'main') returning id into s_valid;
  select e.id into v_event_fremd from event e where not e.is_edition and e.id <> v_ev order by e.start_date limit 1;
  if v_event_fremd is not null then
    insert into stage (event_id, name, type) values (v_event_fremd, 'ZZ Fremdes Event', 'main') returning id into v_stage_fremd;
  end if;
  t_d1 := (v_d1.day_date + time '00:00') at time zone v_tz;
  t_d2 := (v_d2.day_date + time '00:00') at time zone v_tz;

  -- === 01 Form =================================================================================================
  insert into t_res values ('01_form',
    'kind_generiert=' || (select (a.attgenerated = 's')::text from pg_attribute a where a.attrelid = 'public.stage'::regclass and a.attname = 'kind' and not a.attisdropped)
    || ' valid_days_default=' || (select (pg_get_expr(d.adbin, d.adrelid) ~ '^''\{\}''') ::text
         from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum where d.adrelid = 'public.stage'::regclass and a.attname = 'valid_days')
    || ' rls=' || (select c.relrowsecurity::text from pg_class c where c.oid = 'public.stage_blocked_time'::regclass)
    || ' tabelle_ohne_grants=' || (not (has_table_privilege('anon', 'public.stage_blocked_time', 'select')
                                      or has_table_privilege('authenticated', 'public.stage_blocked_time', 'select')
                                      or has_table_privilege('authenticated', 'public.stage_blocked_time', 'insert')
                                      or has_table_privilege('authenticated', 'public.stage_blocked_time', 'update')
                                      or has_table_privilege('authenticated', 'public.stage_blocked_time', 'delete')))::text
    || ' spalten_lesbar=' || (has_column_privilege('authenticated', 'public.stage', 'kind', 'select') and has_column_privilege('authenticated', 'public.stage', 'valid_days', 'select'))::text
    || ' helfer_ohne_execute=' || (not has_function_privilege('authenticated', 'stage_slot_check(uuid, timestamptz, timestamptz, text)', 'execute')
                                   and not has_function_privilege('anon', 'stage_slot_check(uuid, timestamptz, timestamptz, text)', 'execute'))::text
    || ' rpcs_authenticated=' || (has_function_privilege('authenticated', 'stage_blocked_times(uuid)', 'execute')
                                  and has_function_privilege('authenticated', 'upsert_stage_blocked_time(jsonb)', 'execute')
                                  and has_function_privilege('authenticated', 'delete_stage_blocked_time(uuid)', 'execute'))::text
    || ' anon_nichts=' || (not (has_function_privilege('anon', 'stage_blocked_times(uuid)', 'execute')
                                or has_function_privilege('anon', 'upsert_stage_blocked_time(jsonb)', 'execute')
                                or has_function_privilege('anon', 'delete_stage_blocked_time(uuid)', 'execute')))::text);

  -- === 02 Abbildung kind =======================================================================================
  insert into t_res values ('02_kind_abbildung',
    'main=' || (select kind from stage where id = s_main)
    || ' side=' || (select kind from stage where id = s_side)
    || ' main+partner=' || (select kind from stage where id = s_b1)
    || ' side+partner=' || (select kind from stage where id = s_b2)
    || ' partner_booth=' || (select kind from stage where id = s_booth)
    || ' room=' || (select kind from stage where id = s_room)
    || ' interview_table=' || (select kind from stage where id = s_it)
    || ' side_event_venue=' || (select kind from stage where id = s_sev));
  begin
    update stage set kind = 'main' where id = s_booth;
    v_r := 'ALLOWED (BUG)';
  exception when others then v_r := 'rejected ' || sqlstate; end;
  insert into t_res values ('02_kind_nicht_schreibbar', v_r);
  insert into t_res values ('02_chef_treff_buehnen_main',
    'nebenbuehne_uebrig=' || (select count(*) from stage st
      where st.name in ('Leadership & Growth Stage', 'Industry Stage', 'Startup Stage', 'Impact & Tech Stage')
        and st.type = 'side' and st.partner_org_id is null)::text);

  -- === 03 upsert_stage (als programme_team) ====================================================================
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'programme_team', 'global');
  execute 'set local role authenticated';
  s_new := upsert_stage(jsonb_build_object('event_id', v_ev, 'name', 'ZZ Ohne Art'));
  select st.type || ' kind=' || st.kind into v_r from stage st where st.id = s_new;
  perform upsert_stage(jsonb_build_object('id', s_new, 'valid_days', jsonb_build_array(v_d2.day_date, v_d1.day_date, v_d2.day_date)));
  select (st.valid_days = array[v_d1.day_date, v_d2.day_date])::text, (cardinality(st.valid_days) = 2)::text into v_s, v_lang from stage st where st.id = s_new;
  execute 'reset role';
  insert into t_res values ('03_ohne_art_main', v_r);
  insert into t_res values ('03_valid_days_sortiert', 'ok sortiert=' || v_s || ' dedupliziert=' || v_lang || ' laenge=' || (select cardinality(valid_days) from stage where id = s_new)::text);
  execute 'set local role authenticated';
  perform upsert_stage(jsonb_build_object('id', s_new, 'valid_days', '[]'::jsonb));
  execute 'reset role';
  insert into t_res values ('03_valid_days_leer', 'ok leer=' || (select (valid_days = '{}')::text from stage where id = s_new));
  execute 'set local role authenticated';
  begin perform upsert_stage(jsonb_build_object('id', s_new, 'valid_days', jsonb_build_array('2031-01-01'))); v_r := 'ALLOWED (BUG)';
  exception when others then get stacked diagnostics v_det = pg_exception_detail; v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  insert into t_res values ('03_valid_days_kein_eventtag', v_r);
  execute 'set local role authenticated';
  begin perform upsert_stage(jsonb_build_object('id', s_new, 'valid_days', jsonb_build_array('kein datum'))); v_r := 'ALLOWED (BUG)';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  insert into t_res values ('03_valid_days_kein_datum', v_r);
  execute 'set local role authenticated';
  begin perform upsert_stage(jsonb_build_object('id', s_new, 'valid_days', to_jsonb(v_d1.day_date::text))); v_r := 'ALLOWED (BUG)';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  insert into t_res values ('03_valid_days_kein_array', v_r);
  -- ohne Recht
  delete from role_assignment where person_id = v_pid;
  execute 'set local role authenticated';
  begin perform upsert_stage(jsonb_build_object('id', s_new, 'valid_days', '[]'::jsonb)); v_r := 'ALLOWED (BUG)';
  exception when others then v_r := 'rejected ' || sqlstate; end;
  execute 'reset role';
  insert into t_res values ('03_valid_days_fremd_ohne_recht', v_r);

  -- === 04 Rechte der Sperrzeiten ===============================================================================
  -- Eine Sperrzeit als Owner für das Lesen (die Rechte-Prüfung unten schreibt nichts).
  insert into stage_blocked_time (event_id, stage_id, starts_at, ends_at, reason, created_by)
    values (v_ev, s_main, t_d1 + interval '23 hours', t_d1 + interval '23 hours 30 minutes', 'ZZ Lesetest', v_pid) returning id into v_blk;
  foreach v_rolle in array array['programme_team', 'area_lead_speaker', 'area_lead_production', 'stage_lead', 'standbuehne', 'speaker', 'ohne_rolle'] loop
    delete from role_assignment where person_id = v_pid;
    if v_rolle = 'stage_lead' then
      insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'speaker_manager', 'stage', s_main);
    elsif v_rolle = 'standbuehne' then
      insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'standbuehne_editor', 'org', v_org);
    elsif v_rolle <> 'ohne_rolle' then
      insert into role_assignment (person_id, role, scope_type) values (v_pid, v_rolle, 'global');
    end if;
    execute 'set local role authenticated';
    v_abs := has_admin_section('programme');
    begin perform * from stage_blocked_times(v_ev); v_lesen := 'true'; exception when others then v_lesen := sqlstate; end;
    begin
      perform upsert_stage_blocked_time(jsonb_build_object('event_id', v_ev, 'stage_id', s_side, 'starts_at', t_d1 + interval '22 hours', 'ends_at', t_d1 + interval '22 hours 15 minutes', 'reason', 'ZZ Rechtetest ' || v_rolle));
      v_schreiben := 'true';
    exception when others then v_schreiben := sqlstate; end;
    begin perform delete_stage_blocked_time('00000000-0000-0000-0000-000000000000'::uuid); v_loeschen := 'true';
    exception when others then v_loeschen := sqlstate; end;
    execute 'reset role';
    -- Löschen ohne Treffer meldet bei erlaubten Rollen P0002 (blocked_time_not_found): das heißt „Tor offen“.
    if v_loeschen = 'P0002' then v_loeschen := 'true'; end if;
    insert into t_res values ('04_tor_' || v_rolle,
      'abschnitt=' || v_abs::text || ' lesen=' || v_lesen
      || ' schreiben=' || case when v_schreiben = 'true' then 'true' else v_schreiben end
      || case when v_rolle in ('stage_lead', 'standbuehne', 'speaker', 'ohne_rolle') then ' loeschen=' || v_loeschen else '' end);
  end loop;
  delete from stage_blocked_time where reason like 'ZZ Rechtetest %';

  -- Der Zugriff am Tisch vorbei: keine Grants
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'programme_team', 'global');
  execute 'set local role authenticated';
  begin perform count(*) from stage_blocked_time; v_r := 'ALLOWED (BUG)'; exception when others then v_r := 'rejected ' || sqlstate; end;
  begin insert into stage_blocked_time (event_id, starts_at, ends_at, reason) values (v_ev, now(), now() + interval '1 hour', 'ZZ direkt'); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := 'rejected ' || sqlstate; end;
  execute 'reset role';
  insert into t_res values ('04_tabelle_direkt', 'select=' || v_r || ' insert=' || v_s);
  delete from stage_blocked_time where id = v_blk;

  -- === 05 Sperrzeiten pflegen (als programme_team) ==============================================================
  execute 'set local role authenticated';
  v_res := upsert_stage_blocked_time(jsonb_build_object('event_id', v_ev, 'stage_id', s_main,
             'starts_at', t_d1 + interval '10 hours', 'ends_at', t_d1 + interval '12 hours', 'reason', 'ZZ Opening'));
  execute 'reset role';
  v_blk := (v_res ->> 'id')::uuid;
  insert into t_res values ('05_anlegen', 'ok affected=' || (v_res ->> 'affected') || ' stage=' || (select st.name from stage_blocked_time b join stage st on st.id = b.stage_id where b.id = v_blk));
  execute 'set local role authenticated';
  v_res := upsert_stage_blocked_time(jsonb_build_object('event_id', v_ev, 'stage_id', null,
             'starts_at', t_d2 + interval '14 hours', 'ends_at', t_d2 + interval '15 hours', 'reason', 'ZZ Alle'));
  execute 'reset role';
  v_blk_all := (v_res ->> 'id')::uuid;
  insert into t_res values ('05_anlegen_alle_buehnen', 'ok stage_leer=' || (select (stage_id is null)::text from stage_blocked_time where id = v_blk_all));
  execute 'set local role authenticated';
  begin perform upsert_stage_blocked_time(jsonb_build_object('event_id', v_ev, 'starts_at', t_d1 + interval '12 hours', 'ends_at', t_d1 + interval '12 hours', 'reason', 'ZZ leer')); v_r := 'ALLOWED (BUG)';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  insert into t_res values ('05_ende_vor_beginn', v_r);
  execute 'set local role authenticated';
  begin perform upsert_stage_blocked_time(jsonb_build_object('event_id', v_ev, 'starts_at', t_d1 + interval '12 hours', 'ends_at', t_d1 + interval '13 hours', 'reason', '   ')); v_r := 'ALLOWED (BUG)';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  insert into t_res values ('05_ohne_grund', v_r);
  execute 'set local role authenticated';
  begin perform upsert_stage_blocked_time(jsonb_build_object('event_id', v_ev, 'starts_at', t_d1 + interval '12 hours', 'ends_at', t_d1 + interval '13 hours', 'reason', repeat('x', 201))); v_r := 'ALLOWED (BUG)';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  insert into t_res values ('05_grund_zu_lang', v_r);
  if v_stage_fremd is not null then
    execute 'set local role authenticated';
    begin perform upsert_stage_blocked_time(jsonb_build_object('event_id', v_ev, 'stage_id', v_stage_fremd, 'starts_at', t_d1 + interval '12 hours', 'ends_at', t_d1 + interval '13 hours', 'reason', 'ZZ fremd')); v_r := 'ALLOWED (BUG)';
    exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
    execute 'reset role';
  else
    v_r := 'rejected P0002 stage_not_found';   -- kein zweites Event im Bestand: der Fall ist dort nicht prüfbar
  end if;
  insert into t_res values ('05_buehne_anderes_event', v_r);
  -- derselbe Fall am Tisch vorbei (als Owner): der Trigger hält Bühne und Event zusammen
  if v_stage_fremd is not null then
    begin
      insert into stage_blocked_time (event_id, stage_id, starts_at, ends_at, reason)
        values (v_ev, v_stage_fremd, t_d1 + interval '12 hours', t_d1 + interval '13 hours', 'ZZ Trigger');
      v_r := 'ALLOWED (BUG)';
    exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  else
    v_r := 'rejected P0002 stage_not_found';   -- kein zweites Event im Bestand
  end if;
  insert into t_res values ('05_trigger_buehne_anderes_event', v_r);
  execute 'set local role authenticated';
  begin perform upsert_stage_blocked_time(jsonb_build_object('id', '00000000-0000-0000-0000-000000000000', 'reason', 'ZZ x')); v_r := 'ALLOWED (BUG)';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  insert into t_res values ('05_unbekannte_id', v_r);

  -- Ein vorhandener Inhalts-Slot in einer neuen Sperrzeit: bleibt, wird gezählt
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
    values (s_side, v_d1.id, t_d1 + interval '16 hours', t_d1 + interval '16 hours 30 minutes', 'content', 'requested') returning id into v_slot;
  execute 'set local role authenticated';
  v_res := upsert_stage_blocked_time(jsonb_build_object('event_id', v_ev, 'stage_id', s_side,
             'starts_at', t_d1 + interval '15 hours 45 minutes', 'ends_at', t_d1 + interval '16 hours 15 minutes', 'reason', 'ZZ Bestand'));
  execute 'reset role';
  insert into t_res values ('05_affected_vorhandene_slots', 'ok affected=' || (v_res ->> 'affected'));
  delete from stage_blocked_time where id = (v_res ->> 'id')::uuid;

  execute 'set local role authenticated';
  perform upsert_stage_blocked_time(jsonb_build_object('id', v_blk, 'reason', 'ZZ Opening neu'));
  execute 'reset role';
  insert into t_res values ('05_aendern', 'ok grund=' || (select reason from stage_blocked_time where id = v_blk));

  -- === 06 create_slot (als programme_team) =====================================================================
  execute 'set local role authenticated';
  begin perform create_slot(s_main, t_d1 + interval '10 hours 30 minutes', t_d1 + interval '11 hours'); v_r := 'ALLOWED (BUG)';
  exception when others then get stacked diagnostics v_det = pg_exception_detail; v_r := 'rejected ' || sqlstate || ' ' || sqlerrm || ' detail=' || coalesce(v_det, '-'); end;
  execute 'reset role';
  insert into t_res values ('06_in_sperrzeit', v_r);
  execute 'set local role authenticated';
  begin perform create_slot(s_main, t_d1 + interval '9 hours', t_d1 + interval '10 hours'); v_r := 'ok';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  insert into t_res values ('06_ende_genau_am_beginn', v_r);
  execute 'set local role authenticated';
  begin perform create_slot(s_main, t_d1 + interval '12 hours', t_d1 + interval '12 hours 30 minutes'); v_r := 'ok';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  insert into t_res values ('06_beginn_genau_am_ende', v_r);
  execute 'set local role authenticated';
  begin perform create_slot(s_main, t_d1 + interval '11 hours 59 minutes', t_d1 + interval '12 hours 20 minutes'); v_r := 'ALLOWED (BUG)';
  exception when others then get stacked diagnostics v_det = pg_exception_detail; v_r := 'rejected ' || sqlstate || ' ' || sqlerrm || ' detail=' || coalesce(v_det, '-'); end;
  execute 'reset role';
  insert into t_res values ('06_eine_minute_drin', v_r);
  -- dieselbe Zeit auf einer anderen Bühne: frei (die Sperrzeit gehört der Hauptbühne)
  execute 'set local role authenticated';
  begin perform create_slot(s_valid, t_d1 + interval '10 hours 30 minutes', t_d1 + interval '11 hours'); v_r := 'ok';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  insert into t_res values ('06_andere_buehne_frei', v_r);
  -- Sperrzeit für alle Bühnen
  execute 'set local role authenticated';
  begin perform create_slot(s_main, t_d2 + interval '14 hours 15 minutes', t_d2 + interval '14 hours 45 minutes'); v_r := 'ALLOWED (BUG)';
  exception when others then get stacked diagnostics v_det = pg_exception_detail; v_r := 'rejected ' || sqlstate || ' ' || sqlerrm || ' detail=' || coalesce(v_det, '-'); end;
  execute 'reset role';
  insert into t_res values ('06_alle_buehnen_hauptbuehne', v_r);
  execute 'set local role authenticated';
  begin perform create_slot(s_side, t_d2 + interval '14 hours 15 minutes', t_d2 + interval '14 hours 45 minutes'); v_r := 'ALLOWED (BUG)';
  exception when others then get stacked diagnostics v_det = pg_exception_detail; v_r := 'rejected ' || sqlstate || ' ' || sqlerrm || ' detail=' || coalesce(v_det, '-'); end;
  execute 'reset role';
  insert into t_res values ('06_alle_buehnen_nebenbuehne', v_r);
  -- Rahmen und feste Blöcke in der Sperrzeit: erlaubt (das Opening selbst)
  execute 'set local role authenticated';
  begin perform create_slot(s_b1, t_d2 + interval '14 hours 15 minutes', t_d2 + interval '14 hours 45 minutes', 'frame'); v_r := 'ok';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  insert into t_res values ('06_rahmen_in_sperrzeit_frei', v_r);
  execute 'set local role authenticated';
  begin perform create_slot(s_b2, t_d2 + interval '14 hours 15 minutes', t_d2 + interval '14 hours 45 minutes', 'fixed_block'); v_r := 'ok';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  insert into t_res values ('06_fester_block_in_sperrzeit_frei', v_r);
  -- Eine Sperrzeit über die Tagesgrenze: das Detail nennt beide Daten
  insert into stage_blocked_time (event_id, stage_id, starts_at, ends_at, reason, created_by)
    values (v_ev, s_room, t_d1 + interval '20 hours', t_d1 + interval '30 hours', 'ZZ Mehrtag', v_pid) returning id into v_blk_multi;
  execute 'set local role authenticated';
  begin perform create_slot(s_room, t_d1 + interval '21 hours', t_d1 + interval '22 hours'); v_r := 'ALLOWED (BUG)';
  exception when others then get stacked diagnostics v_det = pg_exception_detail; v_r := 'rejected ' || sqlstate || ' ' || sqlerrm || ' detail=' || coalesce(v_det, '-'); end;
  execute 'reset role';
  insert into t_res values ('06_mehrtaegig_detail', v_r);
  -- Löschen gibt die Zeit frei
  execute 'set local role authenticated';
  perform delete_stage_blocked_time(v_blk);
  begin perform create_slot(s_main, t_d1 + interval '10 hours 30 minutes', t_d1 + interval '11 hours'); v_r := 'ok';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  insert into t_res values ('06_nach_loeschen_frei', v_r);
  insert into t_res values ('05_loeschen', 'ok weg=' || (not exists (select 1 from stage_blocked_time where id = v_blk))::text);

  -- Gültigkeitstage
  s_gueltig := s_valid;
  execute 'set local role authenticated';
  perform upsert_stage(jsonb_build_object('id', s_gueltig, 'valid_days', jsonb_build_array(v_d1.day_date)));
  begin perform create_slot(s_gueltig, t_d2 + interval '9 hours', t_d2 + interval '10 hours'); v_r := 'ALLOWED (BUG)';
  exception when others then get stacked diagnostics v_det = pg_exception_detail; v_r := 'rejected ' || sqlstate || ' ' || sqlerrm || ' detail=' || coalesce(v_det, '-'); end;
  execute 'reset role';
  insert into t_res values ('06_tag_nicht_gueltig', v_r);
  execute 'set local role authenticated';
  begin perform create_slot(s_gueltig, t_d1 + interval '13 hours', t_d1 + interval '14 hours'); v_r := 'ok';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  insert into t_res values ('06_tag_gueltig', v_r);
  execute 'set local role authenticated';
  begin perform create_slot(s_side, t_d2 + interval '9 hours', t_d2 + interval '10 hours'); v_r := 'ok';   -- ZZ Nebenbuehne hat keine Einschränkung
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  insert into t_res values ('06_leere_gueltigkeit_alle_tage', v_r);
  execute 'set local role authenticated';
  begin perform create_slot(s_gueltig, t_d2 + interval '9 hours', t_d2 + interval '10 hours', 'fixed_block'); v_r := 'ALLOWED (BUG)';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  insert into t_res values ('06_gueltigkeit_gilt_auch_fuer_rahmen', v_r);
  -- Die Gerüst-Seite liest Art und Gültigkeitstage über programme_skeleton
  execute 'set local role authenticated';
  select (e ->> 'kind') || ' ' || (e -> 'valid_days')::text into v_r
    from jsonb_array_elements(programme_skeleton(v_ev) -> 'stages') e where e ->> 'id' = s_b1::text;
  select (e ->> 'kind') || ' ' || (e -> 'valid_days')::text into v_s
    from jsonb_array_elements(programme_skeleton(v_ev) -> 'stages') e where e ->> 'id' = s_gueltig::text;
  execute 'reset role';
  insert into t_res values ('06_geruest_art', v_r);
  insert into t_res values ('06_geruest_gueltigkeitstage', v_s);

  -- === 07 move_slot ============================================================================================
  -- Ein veröffentlichter Inhalts-Slot auf der Hauptbühne, am Tag 2 morgens
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
    values (s_main, v_d2.id, t_d2 + interval '9 hours', t_d2 + interval '9 hours 30 minutes', 'content', 'final') returning id into v_slot_pub;
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, description_en, publish_status)
    values (v_ev, v_slot_pub, 'talk', 'ZZ Veröffentlicht', 'ZZ Published', 'Beschreibung', 'Description', 'published') returning id into v_se;
  execute 'set local role authenticated';
  begin perform move_slot(v_slot_pub, s_main, t_d2 + interval '14 hours 15 minutes', t_d2 + interval '14 hours 45 minutes', true); v_r := 'ALLOWED (BUG)';
  exception when others then get stacked diagnostics v_det = pg_exception_detail; v_r := 'rejected ' || sqlstate || ' ' || sqlerrm || ' detail=' || coalesce(v_det, '-'); end;
  execute 'reset role';
  insert into t_res values ('07_verschieben_in_sperrzeit', v_r);
  -- ohne Bestätigung: die Sperrzeit gewinnt vor der Rückfrage
  execute 'set local role authenticated';
  begin perform move_slot(v_slot_pub, s_main, t_d2 + interval '14 hours 15 minutes', t_d2 + interval '14 hours 45 minutes', false); v_r := 'ALLOWED (BUG)';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  insert into t_res values ('07_vor_der_rueckfrage', v_r);
  -- freie Zeit: ohne Bestätigung fragt die Datenbank zurück, mit Bestätigung geht es
  execute 'set local role authenticated';
  begin perform move_slot(v_slot_pub, s_main, t_d2 + interval '16 hours', t_d2 + interval '16 hours 30 minutes', false); v_r := 'ALLOWED (BUG)';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  insert into t_res values ('07_verschieben_frei_mit_rueckfrage', v_r);
  execute 'set local role authenticated';
  begin perform move_slot(v_slot_pub, s_main, t_d2 + interval '16 hours', t_d2 + interval '16 hours 30 minutes', true); v_r := 'ok';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  insert into t_res values ('07_verschieben_bestaetigt', v_r);
  -- auf eine Bühne mit Gültigkeit nur für Tag 1, an Tag 2
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
    values (s_b1, v_d2.id, t_d2 + interval '11 hours', t_d2 + interval '11 hours 30 minutes', 'content', 'requested') returning id into v_slot2;
  execute 'set local role authenticated';
  begin perform move_slot(v_slot2, s_gueltig, t_d2 + interval '11 hours', t_d2 + interval '11 hours 30 minutes', false); v_r := 'ALLOWED (BUG)';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  insert into t_res values ('07_verschieben_anderer_tag', v_r);
  -- ein fester Block lässt sich in die Sperrzeit schieben (nur Inhalts-Slots sind gesperrt)
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
    values (s_b2, v_d2.id, t_d2 + interval '17 hours', t_d2 + interval '17 hours 30 minutes', 'fixed_block', 'final') returning id into v_slot3;
  execute 'set local role authenticated';
  begin perform move_slot(v_slot3, s_room, t_d2 + interval '14 hours 20 minutes', t_d2 + interval '14 hours 40 minutes', false); v_r := 'ok';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  insert into t_res values ('07_fester_block_verschieben_frei', v_r);

  -- === 08 Hart für alle ========================================================================================
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'speaker_manager', 'stage', s_main);
  execute 'set local role authenticated';
  begin perform create_slot(s_main, t_d2 + interval '14 hours 15 minutes', t_d2 + interval '14 hours 45 minutes'); v_r := 'ALLOWED (BUG)';
  exception when others then get stacked diagnostics v_det = pg_exception_detail; v_r := 'rejected ' || sqlstate || ' ' || sqlerrm || ' detail=' || coalesce(v_det, '-'); end;
  execute 'reset role';
  insert into t_res values ('08_stage_lead_hart', v_r);
  execute 'set local role authenticated';
  begin perform create_slot(s_main, t_d2 + interval '18 hours', t_d2 + interval '18 hours 30 minutes'); v_r := 'ok';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  insert into t_res values ('08_stage_lead_frei', v_r);
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'standbuehne_editor', 'org', v_org);
  execute 'set local role authenticated';
  begin perform create_slot(s_booth, t_d2 + interval '14 hours 15 minutes', t_d2 + interval '14 hours 45 minutes'); v_r := 'ALLOWED (BUG)';
  exception when others then get stacked diagnostics v_det = pg_exception_detail; v_r := 'rejected ' || sqlstate || ' ' || sqlerrm || ' detail=' || coalesce(v_det, '-'); end;
  execute 'reset role';
  insert into t_res values ('08_standbuehne_hart', v_r);

  -- === 09 partner_create_session (als admin: partner_can_edit über das Partner-Team) ===========================
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  perform upsert_stage_blocked_time(jsonb_build_object('event_id', v_ev, 'stage_id', s_it, 'starts_at', t_d1 + interval '8 hours', 'ends_at', t_d1 + interval '9 hours', 'reason', 'ZZ Tisch gesperrt'));
  update stage set valid_days = array[v_d1.day_date] where id = s_it;
  execute 'set local role authenticated';
  begin perform partner_create_session(v_org, 'interview_table', s_it, v_d2.id, t_d2 + interval '10 hours', t_d2 + interval '10 hours 30 minutes', 'ZZ Gespräch Tag 2', 1, '{}'::jsonb, v_ed); v_r := 'ALLOWED (BUG)';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  insert into t_res values ('09_partner_tag_nicht_gueltig', v_r);
  -- Sperrzeit des Tisches gilt nicht für partner_block, der Tag ist gültig
  execute 'set local role authenticated';
  begin perform partner_create_session(v_org, 'interview_table', s_it, v_d1.id, t_d1 + interval '8 hours 15 minutes', t_d1 + interval '8 hours 45 minutes', 'ZZ Gespräch in Sperrzeit', 1, '{}'::jsonb, v_ed); v_r := 'ok';
  exception when others then v_r := 'rejected ' || sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  insert into t_res values ('09_partner_sperrzeit_gilt_nicht', v_r);

  -- === Audit der Pflege (05) ====================================================================================
  insert into t_res values ('05_audit',
    'upsert=' || (select count(*) from audit_log where action = 'programme.blocked_time_upsert' and created_at >= v_t0)::text
    || ' delete=' || (select count(*) from audit_log where action = 'programme.blocked_time_delete' and created_at >= v_t0)::text
    || ' ohne_at_zeichen=' || (not exists (select 1 from audit_log where action in ('programme.blocked_time_upsert', 'programme.blocked_time_delete')
                                               and created_at >= v_t0 and (coalesce("after"::text, '') ~ '@' or coalesce("before"::text, '') ~ '@')))::text);
end $$;
insert into t_res
  select '99_auswertung',
         case when count(*) filter (where not z.erfuellt) = 0 then 'ok: alle ' || count(*)::text || ' Erwartungen erfüllt'
              else 'FEHLER: ' || string_agg(z.step, ', ' order by z.step) filter (where not z.erfuellt) end
    from (select e.step, exists (select 1 from t_res r where r.step = e.step and r.result ~ e.muster) as erfuellt from t_erw e) z;
select * from t_res order by step;
rollback;
