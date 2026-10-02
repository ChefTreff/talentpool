-- Smoke-Test zum Vorschlag v6_einwilligung_alle_stellvertretend (SPK-074-Nachtrag, K-45, K-46). Aufbau
-- im Rollback wie im Test zu v6_einwilligung_stellvertretend: Speakerin S ohne Zugang mit Profil P im
-- Verwaltet-Fall und Hotel-Anspruch (`eligible`) — T ist ihr Kontakt mit Zugang (Art `partner`) und
-- Empfänger der Mail-Weiche. Profil Q (Speakerin S2): T ist dort auch Kontakt mit Zugang, aber ohne
-- Verwaltet-Fall. K ist kein Kontakt, M hat programme_team (Team). T, K und M sind Live-Konten;
-- geurteilt wird nur über die Einwilligungen der Wegwerf-Personen S und S2.
--
-- Zeitstempel: in einer Transaktion ist now() überall gleich, und `consent_current` bricht den
-- Gleichstand über eine zufällige uuid — „zuletzt“ wäre Glückssache (der Vorgängertest scheiterte so
-- in Schritt 07 etwa jedes zweite Mal). Der Test schiebt die vorhandenen Zeilen deshalb vor jedem
-- weiteren Schreiben in die Vergangenheit. Im Betrieb hat jeder Aufruf seine eigene Transaktion.
--
--   01 Ausgangslage: Hotel für P ist gesperrt, weil die Einwilligung fehlt (`hospitality_block_reason` = 'consent')
--   02 T bestätigt alle vier Arten: 4 Zeilen für S, Quelle `stellvertretend`, im Protokoll T, Kontakt,
--      Profil und `wording = 'proxy'`                            (gegen live: hospitality_data → 22023)
--   03 Wirkung: Hotel für P ist nicht mehr gesperrt (`hospitality_block_reason` ist leer)
--   04 Widerruf von hospitality_data: 1 Zeile mit granted = false, Hotel wieder gesperrt; derselbe
--      Stand noch einmal → 0 Zeilen (nur Änderungen)
--   05 eine unbekannte Art in der Mischung → 22023 consent_type_not_allowed, Detail = die Art; auch die
--      gültige Änderung daneben bleibt ungeschrieben (erst alles prüfen, dann schreiben)
--   06 Q (kein Verwaltet-Fall) → P0001 consent_not_managed; K auf P → 42501; S2 ohne Zeile
--   07 direkt in consent_record als T für S (Quelle `stellvertretend` und `portal`) → abgewiesen
--   08 speaker_consents_admin als M: hospitality_data stellvertretend durch T (Name), vier Arten;
--      als T (kein Team) → 42501
--   09 Rechte: authenticated darf aufrufen, anon nicht
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_ed uuid; v_ps uuid; v_ps2 uuid; v_p uuid; v_q uuid; v_c uuid; v_c2 uuid;
  v_pt uuid; v_ut uuid; v_pk uuid; v_uk uuid; v_pm uuid; v_um uuid;
  v_n int; v_m int; v_k int; v_z int; v_rows int;
  v_txt text; v_state text; v_state2 text; v_detail text; v_name text; v_tname text; v_src text; v_reason text;
  v_granted boolean;
begin
  -- ---- Aufbau
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  insert into person (first_name, last_name, preferred_language) values ('Sina', 'ZZAlle Speakerin', 'de') returning id into v_ps;
  insert into person (first_name, last_name, preferred_language) values ('Sven', 'ZZAlle Ohne', 'de') returning id into v_ps2;
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at, hospitality_status)
  values (v_ps, v_ed, 'panelist', 'confirmed', now(), 'eligible') returning id into v_p;
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at, hospitality_status)
  values (v_ps2, v_ed, 'panelist', 'confirmed', now(), 'eligible') returning id into v_q;

  select p.id, p.auth_user_id, nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
    into v_pt, v_ut, v_tname from person p where p.auth_user_id is not null order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_pk, v_uk from person p where p.auth_user_id is not null and p.id <> v_pt order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_pm, v_um from person p where p.auth_user_id is not null and p.id not in (v_pt, v_pk) order by p.created_at limit 1;
  delete from role_assignment where person_id in (v_pt, v_pk, v_pm);
  insert into role_assignment (person_id, role, scope_type, edition_id) values (v_pm, 'programme_team', 'edition', v_ed);

  insert into speaker_contact (profile_id, kind, person_id, first_name, last_name, email, has_access, consent_at)
  values (v_p, 'partner', v_pt, 'Tara', 'ZZAlle Kontakt', 'zzalle-kontakt@example.org', true, current_date) returning id into v_c;
  insert into speaker_contact (profile_id, kind, person_id, first_name, last_name, email, has_access, consent_at)
  values (v_q, 'assistant', v_pt, 'Tara', 'ZZAlle Kontakt', 'zzalle-kontakt@example.org', true, current_date) returning id into v_c2;
  update speaker_profile set mail_via_contact_id = v_c where id = v_p;

  -- ---- 01 Ausgangslage: Hotel gesperrt, weil die Einwilligung fehlt
  v_reason := hospitality_block_reason(v_p);
  insert into t_res values ('01_ausgangslage_hotel_gesperrt',
    case when v_reason = 'consent' then 'ok' else 'FEHLER grund=' || coalesce(v_reason, 'leer') end);

  -- ---- 02 T bestätigt alle vier Arten stellvertretend
  v_txt := null;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute $q$select record_speaker_consent_on_behalf($1, '{"photo_video": true, "speaker_release": true, "slides_publication": false, "hospitality_data": true}'::jsonb, '2026-09')$q$
      into v_n using v_p;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  select count(*), count(*) filter (where cr.source = 'stellvertretend'
                                      and cr.meta->>'by_person_id' = v_pt::text
                                      and cr.meta->>'contact_id' = v_c::text
                                      and cr.meta->>'profile_id' = v_p::text
                                      and cr.meta->>'wording' = 'proxy')
    into v_m, v_k from consent_record cr where cr.person_id = v_ps;
  insert into t_res values ('02_alle_vier_protokolliert',
    coalesce(v_txt, case when v_n = 4 and v_m = 4 and v_k = 4 then 'ok'
                         else 'FEHLER geschrieben=' || v_n || ' zeilen=' || v_m || ' mit_protokoll=' || v_k end));

  -- ---- 03 Wirkung: Hotel nicht mehr gesperrt
  v_reason := hospitality_block_reason(v_p);
  insert into t_res values ('03_hotel_nicht_mehr_gesperrt',
    case when v_reason is null then 'ok' else 'FEHLER grund=' || v_reason end);

  -- ---- 04 Widerruf, dann derselbe Stand noch einmal
  update consent_record set granted_at = granted_at - interval '1 hour', created_at = created_at - interval '1 hour'
   where person_id = v_ps;
  v_txt := null;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute $q$select record_speaker_consent_on_behalf($1, '{"hospitality_data": false}'::jsonb, '2026-09')$q$ into v_n using v_p;
    execute $q$select record_speaker_consent_on_behalf($1, '{"hospitality_data": false}'::jsonb, '2026-09')$q$ into v_z using v_p;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  select c.granted into v_granted from consent_current c where c.person_id = v_ps and c.consent_type = 'hospitality_data';
  v_reason := hospitality_block_reason(v_p);
  select count(*) into v_m from consent_record cr
   where cr.person_id = v_ps and cr.consent_type = 'hospitality_data' and cr.meta->>'wording' = 'proxy';
  insert into t_res values ('04_widerruf_sperrt_wieder',
    coalesce(v_txt, case when v_n = 1 and v_z = 0 and v_granted = false and v_reason = 'consent' and v_m = 2 then 'ok'
                         else 'FEHLER widerruf=' || v_n || ' gleich=' || v_z || ' stand=' || coalesce(v_granted::text, '?')
                              || ' grund=' || coalesce(v_reason, 'leer') || ' zeilen=' || v_m end));

  -- ---- 05 Eine unbekannte Art in der Mischung: nichts wird geschrieben
  select count(*) into v_rows from consent_record cr where cr.person_id = v_ps;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute $q$select record_speaker_consent_on_behalf($1, '{"hospitality_data": true, "zz_unbekannt": true}'::jsonb, '2026-09')$q$ using v_p;
    v_state := 'kein Fehler';
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    v_state := sqlstate || ' ' || sqlerrm || ' ' || coalesce(v_detail, '?');
  end;
  execute 'reset role';
  select count(*) into v_m from consent_record cr where cr.person_id = v_ps;
  select c.granted into v_granted from consent_current c where c.person_id = v_ps and c.consent_type = 'hospitality_data';
  insert into t_res values ('05_unbekannte_art_nichts_geschrieben',
    case when v_state = '22023 consent_type_not_allowed zz_unbekannt' and v_m = v_rows and v_granted = false then 'ok'
         else 'FEHLER ' || v_state || ' zeilen=' || v_m || '/' || v_rows || ' stand=' || coalesce(v_granted::text, '?') end);

  -- ---- 06 Ohne Verwaltet-Fall, ohne Kontakt
  perform set_config('request.jwt.claims', json_build_object('sub', v_ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute $q$select record_speaker_consent_on_behalf($1, '{"hospitality_data": true}'::jsonb, '2026-09')$q$ using v_q;
    v_state := 'kein Fehler';
  exception when others then v_state := sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_uk, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute $q$select record_speaker_consent_on_behalf($1, '{"hospitality_data": true}'::jsonb, '2026-09')$q$ using v_p;
    v_state2 := 'kein Fehler';
  exception when others then v_state2 := sqlstate;
  end;
  execute 'reset role';
  select count(*) into v_m from consent_record cr where cr.person_id = v_ps2;
  select c.granted into v_granted from consent_current c where c.person_id = v_ps and c.consent_type = 'hospitality_data';
  insert into t_res values ('06_nur_im_verwaltet_fall',
    case when v_state = 'P0001 consent_not_managed' and v_state2 = '42501' and v_m = 0 and v_granted = false then 'ok'
         else 'FEHLER Q=' || v_state || ' K=' || v_state2 || ' S2_zeilen=' || v_m || ' S_hotel=' || coalesce(v_granted::text, '?') end);

  -- ---- 07 Direkt in consent_record: weder die Quelle noch fremde Zeilen
  perform set_config('request.jwt.claims', json_build_object('sub', v_ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into consent_record (person_id, consent_type, version, granted, source)
    values (v_ps, 'hospitality_data', '2026-09', true, 'stellvertretend');
    v_state := 'kein Fehler';
  exception when others then v_state := sqlstate;
  end;
  begin
    insert into consent_record (person_id, consent_type, version, granted, source)
    values (v_ps, 'hospitality_data', '2026-09', true, 'portal');
    v_state2 := 'kein Fehler';
  exception when others then v_state2 := sqlstate;
  end;
  execute 'reset role';
  insert into t_res values ('07_direkt_abgewiesen',
    case when v_state = '42501' and v_state2 = '42501' then 'ok' else 'FEHLER stellvertretend=' || v_state || ' portal=' || v_state2 end);

  -- ---- 08 Das Team sieht, wer bestätigt hat — auch für Hotel und Shuttle
  v_txt := null;
  perform set_config('request.jwt.claims', json_build_object('sub', v_um, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute $q$select a.granted, a.source, a.by_name, (select count(*)::int from speaker_consents_admin($1))
                 from speaker_consents_admin($1) a where a.consent_type = 'hospitality_data'$q$
      into v_granted, v_src, v_name, v_n using v_p;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute 'select count(*) from speaker_consents_admin($1)' into v_m using v_p;
    v_state := 'kein Fehler';
  exception when others then v_state := sqlstate;
  end;
  execute 'reset role';
  insert into t_res values ('08_team_sieht_wer',
    coalesce(v_txt, case when v_granted = false and v_src = 'stellvertretend' and v_name is not distinct from v_tname
                              and v_n = 4 and v_state = '42501' then 'ok'
                         else 'FEHLER hotel=' || coalesce(v_granted::text, '?') || ' quelle=' || coalesce(v_src, '?')
                              || ' name=' || coalesce(v_name, '?') || ' arten=' || coalesce(v_n::text, '?') || ' T=' || v_state end));

  -- ---- 09 Rechte: nur angemeldete Konten rufen auf
  insert into t_res values ('09_rechte',
    case when has_function_privilege('authenticated', 'record_speaker_consent_on_behalf(uuid, jsonb, text)', 'execute')
              and not has_function_privilege('anon', 'record_speaker_consent_on_behalf(uuid, jsonb, text)', 'execute') then 'ok'
         else 'FEHLER authenticated=' || has_function_privilege('authenticated', 'record_speaker_consent_on_behalf(uuid, jsonb, text)', 'execute')
              || ' anon=' || has_function_privilege('anon', 'record_speaker_consent_on_behalf(uuid, jsonb, text)', 'execute') end);
end $$;
select * from t_res order by step;
rollback;
