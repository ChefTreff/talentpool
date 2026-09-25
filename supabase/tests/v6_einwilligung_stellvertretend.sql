-- Smoke-Test zum Vorschlag v6_einwilligung_stellvertretend (SPK-074, K-40). Aufbau
-- im Rollback: Speakerin S ohne Zugang mit Profil P im Verwaltet-Fall — T ist
-- ihr Kontakt mit Zugang (Art `partner`) und Empfänger der Mail-Weiche. Profil Q
-- (Speakerin S2): T ist dort auch Kontakt mit Zugang, aber ohne Verwaltet-Fall.
-- K ist kein Kontakt, M hat programme_team (Team). T, K und M sind Live-Konten;
-- geurteilt wird nur über die Einwilligungen der Wegwerf-Personen S und S2.
--
--   01 can_confirm_consent_on_behalf als T: P ja, Q nein; als K: P nein   (gegen live: Funktion fehlt)
--   02 record_speaker_consent_on_behalf als T: drei Zeilen für S, Quelle
--      `stellvertretend`, im Protokoll T, Kontakt und Profil               (gegen live: Funktion fehlt)
--   03 derselbe Stand noch einmal → 0 Zeilen; Folien umentschieden → 1 Zeile
--   04 hospitality_data → 22023 consent_type_not_allowed, nichts geschrieben
--   05 Q (nicht verwaltet) → P0001 consent_not_managed; K auf P → 42501; S2 ohne Zeile
--   06 direkt in consent_record als T: für S → abgewiesen; für sich selbst mit
--      Quelle `stellvertretend` → abgewiesen (die Quelle lässt sich nicht fälschen)
--                                                          (gegen live: schon so — Wächter)
--   07 speaker_consents_admin als M: Folien erteilt, stellvertretend durch T (Name);
--      als T (kein Team) → 42501                                             (gegen live: Funktion fehlt)
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_ed uuid; v_ps uuid; v_ps2 uuid; v_p uuid; v_q uuid; v_c uuid; v_c2 uuid;
  v_pt uuid; v_ut uuid; v_pk uuid; v_uk uuid; v_pm uuid; v_um uuid;
  v_b1 boolean; v_b2 boolean; v_b3 boolean; v_n int; v_m int; v_k int; v_z int;
  v_txt text; v_state text; v_state2 text; v_meta jsonb; v_name text; v_tname text; v_granted boolean;
begin
  -- ---- Aufbau
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  insert into person (first_name, last_name, preferred_language) values ('Sina', 'ZZVertretung Speakerin', 'de') returning id into v_ps;
  insert into person (first_name, last_name, preferred_language) values ('Sven', 'ZZVertretung Ohne', 'de') returning id into v_ps2;
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at)
  values (v_ps, v_ed, 'panelist', 'confirmed', now()) returning id into v_p;
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at)
  values (v_ps2, v_ed, 'panelist', 'confirmed', now()) returning id into v_q;

  select p.id, p.auth_user_id, nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
    into v_pt, v_ut, v_tname from person p where p.auth_user_id is not null order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_pk, v_uk from person p where p.auth_user_id is not null and p.id <> v_pt order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_pm, v_um from person p where p.auth_user_id is not null and p.id not in (v_pt, v_pk) order by p.created_at limit 1;
  delete from role_assignment where person_id in (v_pt, v_pk, v_pm);
  insert into role_assignment (person_id, role, scope_type, edition_id) values (v_pm, 'programme_team', 'edition', v_ed);

  insert into speaker_contact (profile_id, kind, person_id, first_name, last_name, email, has_access, consent_at)
  values (v_p, 'partner', v_pt, 'Tara', 'ZZVertretung Kontakt', 'zzvertretung-kontakt@example.org', true, current_date) returning id into v_c;
  insert into speaker_contact (profile_id, kind, person_id, first_name, last_name, email, has_access, consent_at)
  values (v_q, 'assistant', v_pt, 'Tara', 'ZZVertretung Kontakt', 'zzvertretung-kontakt@example.org', true, current_date) returning id into v_c2;
  update speaker_profile set mail_via_contact_id = v_c where id = v_p;

  -- ---- 01 Darf T stellvertretend bestätigen?
  perform set_config('request.jwt.claims', json_build_object('sub', v_ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute 'select can_confirm_consent_on_behalf($1), can_confirm_consent_on_behalf($2)' into v_b1, v_b2 using v_p, v_q;
    v_txt := null;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_uk, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute 'select can_confirm_consent_on_behalf($1)' into v_b3 using v_p;
  exception when others then v_txt := coalesce(v_txt, 'FEHLER ' || sqlstate || ' ' || sqlerrm);
  end;
  execute 'reset role';
  insert into t_res values ('01_wer_darf_stellvertretend',
    coalesce(v_txt, case when v_b1 and not v_b2 and not v_b3 then 'ok'
                         else 'FEHLER P=' || v_b1 || ' Q=' || v_b2 || ' K=' || v_b3 end));

  -- ---- 02 T bestätigt stellvertretend
  v_txt := null;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute $q$select record_speaker_consent_on_behalf($1, '{"photo_video": true, "speaker_release": true, "slides_publication": false}'::jsonb, '2026-09')$q$
      into v_n using v_p;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  select count(*), count(*) filter (where cr.source = 'stellvertretend'
                                      and cr.meta->>'by_person_id' = v_pt::text
                                      and cr.meta->>'contact_id' = v_c::text
                                      and cr.meta->>'profile_id' = v_p::text)
    into v_m, v_k from consent_record cr where cr.person_id = v_ps;
  insert into t_res values ('02_stellvertretend_protokolliert',
    coalesce(v_txt, case when v_n = 3 and v_m = 3 and v_k = 3 then 'ok'
                         else 'FEHLER geschrieben=' || v_n || ' zeilen=' || v_m || ' mit_protokoll=' || v_k end));

  -- ---- 03 Nur Änderungen
  v_txt := null;
  execute 'set local role authenticated';
  begin
    execute $q$select record_speaker_consent_on_behalf($1, '{"photo_video": true, "speaker_release": true, "slides_publication": false}'::jsonb, '2026-09')$q$
      into v_n using v_p;
    execute $q$select record_speaker_consent_on_behalf($1, '{"slides_publication": true}'::jsonb, '2026-09')$q$
      into v_z using v_p;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  insert into t_res values ('03_nur_aenderungen',
    coalesce(v_txt, case when v_n = 0 and v_z = 1 then 'ok' else 'FEHLER gleich=' || v_n || ' umentschieden=' || v_z end));

  -- ---- 04 Hotel und Shuttle bleibt bei der Speakerin
  execute 'set local role authenticated';
  begin
    execute $q$select record_speaker_consent_on_behalf($1, '{"photo_video": true, "hospitality_data": true}'::jsonb, '2026-09')$q$ using v_p;
    v_state := 'kein Fehler';
  exception when others then v_state := sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  select count(*) into v_m from consent_record cr where cr.person_id = v_ps and cr.consent_type = 'hospitality_data';
  insert into t_res values ('04_hotel_nur_selbst',
    case when v_state = '22023 consent_type_not_allowed' and v_m = 0 then 'ok' else 'FEHLER ' || v_state || ' zeilen=' || v_m end);

  -- ---- 05 Ohne Verwaltet-Fall, ohne Kontakt
  execute 'set local role authenticated';
  begin
    execute $q$select record_speaker_consent_on_behalf($1, '{"photo_video": true}'::jsonb, '2026-09')$q$ using v_q;
    v_state := 'kein Fehler';
  exception when others then v_state := sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_uk, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute $q$select record_speaker_consent_on_behalf($1, '{"photo_video": false}'::jsonb, '2026-09')$q$ using v_p;
    v_state2 := 'kein Fehler';
  exception when others then v_state2 := sqlstate;
  end;
  execute 'reset role';
  select count(*) into v_m from consent_record cr where cr.person_id = v_ps2;
  select cr.granted into v_granted from consent_current cr where cr.person_id = v_ps and cr.consent_type = 'photo_video';
  insert into t_res values ('05_nur_im_verwaltet_fall',
    case when v_state = 'P0001 consent_not_managed' and v_state2 = '42501' and v_m = 0 and v_granted then 'ok'
         else 'FEHLER Q=' || v_state || ' K=' || v_state2 || ' S2_zeilen=' || v_m || ' S_foto=' || coalesce(v_granted::text, '?') end);

  -- ---- 06 Direkt in consent_record: Quelle nicht zu fälschen
  perform set_config('request.jwt.claims', json_build_object('sub', v_ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into consent_record (person_id, consent_type, version, granted, source)
    values (v_ps, 'photo_video', '2026-09', false, 'stellvertretend');
    v_state := 'kein Fehler';
  exception when others then v_state := sqlstate;
  end;
  begin
    insert into consent_record (person_id, consent_type, version, granted, source)
    values (v_pt, 'zz_test_quelle', '2026-09', true, 'stellvertretend');
    v_state2 := 'kein Fehler';
  exception when others then v_state2 := sqlstate;
  end;
  execute 'reset role';
  insert into t_res values ('06_quelle_nicht_faelschbar',
    case when v_state = '42501' and v_state2 = '42501' then 'ok' else 'FEHLER fremd=' || v_state || ' selbst=' || v_state2 end);

  -- ---- 07 Das Team sieht, wer bestätigt hat
  v_txt := null;
  perform set_config('request.jwt.claims', json_build_object('sub', v_um, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute $q$select a.granted, a.by_name, (select count(*)::int from speaker_consents_admin($1))
                 from speaker_consents_admin($1) a where a.consent_type = 'slides_publication'$q$
      into v_granted, v_name, v_n using v_p;
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
  insert into t_res values ('07_team_sieht_wer',
    coalesce(v_txt, case when v_granted and v_name is not distinct from v_tname and v_n = 3 and v_state = '42501' then 'ok'
                         else 'FEHLER folien=' || coalesce(v_granted::text, '?') || ' name=' || coalesce(v_name, '?')
                              || ' arten=' || coalesce(v_n::text, '?') || ' T=' || v_state end));
end $$;
select * from t_res order by step;
rollback;
