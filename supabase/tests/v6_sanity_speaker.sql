-- Test zu `v6_sanity_speaker` (SPK-046). Belegt:
--   01 eine angemeldete Sitzung bekommt die Liste nicht — auch Admin nicht (42501);
--   02 der Server bekommt die veröffentlichte Speakerin mit beiden Einwilligungen: Tor dreimal wahr, Felder
--      (Jobtitel, Organisation aus dem Rückfall, Bio DE/EN, Website, LinkedIn, Foto) und nur die
--      veröffentlichte Session mit Bühne (Vorbedingung für 03–08);
--   03 bestätigt, aber nicht veröffentlicht ⇒ dabei, `released` falsch; ein Testprofil (`testdaten:` in der
--      internen Notiz) trägt `is_test`, eine andere Notiz nicht;
--   04 ohne `speaker_release` ⇒ dabei, `has_release` falsch;
--   05 Gast der Standbühne, abgesagt, gelöscht, nur Lead ⇒ gar nicht dabei;
--   06 das Ergebnis hat keine Spalte für Mail, Telefon, Notizen oder Ernährung;
--   07 `delete_external_ref` entfernt die Merkzeile nur für den Server (Sitzung 42501);
--   08 Grants: anon und authenticated dürfen keine der beiden Funktionen ausführen.
--
-- Probelauf der Speaker-Session am 02.10.2026 gegen die Live-Datenbank (`sh scripts/db.sh dry-run`, alles
-- zurückgerollt): 8 von 8 Zeilen wie erwartet. `db.sh fn-diff`: zwei neue Funktionen, keine bestehende geändert.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_me uuid; v_uid uuid; v_email text; v_ed uuid; v_ev uuid; v_tz text; v_tag uuid; v_tag_datum date;
  v_stage uuid; v_slot uuid; v_se uuid; v_se_entwurf uuid; v_org uuid;
  v_a uuid; v_b uuid; v_c uuid; v_d uuid; v_e uuid; v_f uuid; v_g uuid;
  v_pa uuid; v_foto uuid; v_txt text; v_n integer; v_start timestamptz; v_ok boolean;
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select ev.id, ev.timezone into v_ev, v_tz from event ev
   where ev.edition_id = v_ed and not ev.is_edition order by (ev.slug = 'summit-27') desc, ev.start_date limit 1;
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;

  select d.id, d.day_date into v_tag, v_tag_datum from event_day d where d.event_id = v_ev order by d.day_date limit 1;
  if v_tag is null then
    insert into event_day (event_id, day_date) values (v_ev, date '2027-04-16') returning id, day_date into v_tag, v_tag_datum;
  end if;
  v_start := (v_tag_datum + time '11:00') at time zone v_tz;
  insert into stage (event_id, name, slug) values (v_ev, 'ZZTEST Sanity-Bühne', 'zztest-sanity-' || substr(gen_random_uuid()::text, 1, 6))
  returning id into v_stage;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type)
  values (v_stage, v_tag, v_start, v_start + interval '30 minutes', 'content') returning id into v_slot;
  -- Der Trigger `session_publish_check` verlangt Slot, beide Titel und eine Beschreibung.
  insert into session (event_id, format, title_de, title_en, description_de, slot_id, publish_status)
  values (v_ev, 'talk', 'ZZTEST Zukunft', 'ZZTEST Future', 'ZZTEST Beschreibung', v_slot, 'published') returning id into v_se;
  insert into session (event_id, format, title_de, title_en)
  values (v_ev, 'talk', 'ZZTEST Entwurf', 'ZZTEST Draft') returning id into v_se_entwurf;
  insert into organization (legal_name, communication_name) values ('ZZTEST Org GmbH', 'ZZTEST Org') returning id into v_org;

  -- A: veröffentlicht, beide Einwilligungen, Foto, Website, LinkedIn, Organisation nur über org_id.
  insert into person (first_name, last_name, linkedin_url) values ('Anna', 'ZZTEST-Sanity-A', 'https://www.linkedin.com/in/zztest-a')
  returning id into v_a;
  insert into speaker_profile (person_id, edition_id, pipeline_status, job_title, org_id, bio_short_de, bio_short_en, socials, internal_notes)
  values (v_a, v_ed, 'published', ' CEO ', v_org, 'Kurz DE', 'Short EN', '{"website":"https://zztest.example.org","x":"@zz"}', 'geheim')
  returning id into v_pa;
  insert into speaker_asset (profile_id, kind, storage_path, filename, mime, version, is_current, uploaded_by)
  values (v_pa, 'photo', v_ed || '/' || v_pa || '/photo/a.jpg', 'a.jpg', 'image/jpeg', 1, true, v_me) returning id into v_foto;
  insert into session_speaker (session_id, person_id, role) values (v_se, v_a, 'speaker'), (v_se_entwurf, v_a, 'speaker');
  insert into consent_record (person_id, consent_type, version, granted) values (v_a, 'speaker_release', 'zztest', true), (v_a, 'photo_video', 'zztest', true);

  -- B: bestätigt, nicht veröffentlicht.
  insert into person (first_name, last_name) values ('Ben', 'ZZTEST-Sanity-B') returning id into v_b;
  insert into speaker_profile (person_id, edition_id, pipeline_status, internal_notes) values (v_b, v_ed, 'confirmed', 'testdaten:konrad');
  insert into consent_record (person_id, consent_type, version, granted) values (v_b, 'speaker_release', 'zztest', true), (v_b, 'photo_video', 'zztest', true);
  -- C: veröffentlicht, nur photo_video.
  insert into person (first_name, last_name) values ('Clara', 'ZZTEST-Sanity-C') returning id into v_c;
  insert into speaker_profile (person_id, edition_id, pipeline_status) values (v_c, v_ed, 'published');
  insert into consent_record (person_id, consent_type, version, granted) values (v_c, 'photo_video', 'zztest', true);
  -- D: Gast der Standbühne · E: abgesagt · F: gelöscht · G: Lead — alle mit Einwilligungen.
  insert into person (first_name, last_name) values ('Dora', 'ZZTEST-Sanity-D') returning id into v_d;
  -- `speaker_profile_stage_guest_chk`: ein Gast hat keine Lounge, gehört einer Organisation und hat zugestimmt.
  insert into speaker_profile (person_id, edition_id, pipeline_status, stage_guest, lounge_access, created_by_org_id, stage_guest_consent_at)
  values (v_d, v_ed, 'published', true, false, v_org, now());
  insert into person (first_name, last_name) values ('Emil', 'ZZTEST-Sanity-E') returning id into v_e;
  insert into speaker_profile (person_id, edition_id, pipeline_status, declined_at) values (v_e, v_ed, 'published', now());
  insert into person (first_name, last_name, deleted_at) values ('Finn', 'ZZTEST-Sanity-F', now()) returning id into v_f;
  insert into speaker_profile (person_id, edition_id, pipeline_status) values (v_f, v_ed, 'published');
  insert into person (first_name, last_name) values ('Gina', 'ZZTEST-Sanity-G') returning id into v_g;
  insert into speaker_profile (person_id, edition_id, pipeline_status) values (v_g, v_ed, 'lead');
  insert into consent_record (person_id, consent_type, version, granted)
  select x, t, 'zztest', true from unnest(array[v_d, v_e, v_f, v_g]) x, unnest(array['speaker_release', 'photo_video']) t;

  -- 01 · Sitzung, sogar als Admin
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin
    perform 1 from sanity_speakers(v_ed);
    insert into t_res values ('01_sitzung', 'ERLAUBT (BUG)');
  exception when sqlstate '42501' then insert into t_res values ('01_sitzung', 'abgewiesen 42501');
  end;
  perform set_config('request.jwt.claims', '', true);

  -- 02 · A vollständig
  select format('Tor %s/%s/%s · %s · %s · %s/%s · %s · %s · Foto %s · Sessions %s',
                s.has_release::text, s.has_photo_video::text, s.released::text, s.job_title, s.organization, s.bio_short_de, s.bio_short_en,
                s.website, s.linkedin, (s.photo_asset_id = v_foto)::text,
                (select string_agg((x->>'title_de') || '@' || coalesce(x->>'stage', '-'), ',') from jsonb_array_elements(s.sessions) x))
    into v_txt from sanity_speakers(v_ed) s where s.person_id = v_a;
  insert into t_res values ('02_veroeffentlicht', coalesce(v_txt, '(fehlt)')
    || ' (erwartet Tor true/true/true · CEO · ZZTEST Org · Kurz DE/Short EN · https://zztest.example.org · https://www.linkedin.com/in/zztest-a · Foto true · Sessions ZZTEST Zukunft@ZZTEST Sanity-Bühne)');

  -- 03 · B bestätigt, nicht veröffentlicht
  select format('dabei, released %s, Test %s · A Test %s', s.released::text, s.is_test::text,
                (select a.is_test::text from sanity_speakers(v_ed) a where a.person_id = v_a))
    into v_txt from sanity_speakers(v_ed) s where s.person_id = v_b;
  insert into t_res values ('03_nur_bestaetigt', coalesce(v_txt, '(fehlt)') || ' (erwartet dabei, released false, Test true · A Test false)');

  -- 04 · C ohne speaker_release
  select format('dabei, has_release %s, photo_video %s, released %s', s.has_release::text, s.has_photo_video::text, s.released::text)
    into v_txt from sanity_speakers(v_ed) s where s.person_id = v_c;
  insert into t_res values ('04_ohne_freigabe_einwilligung', coalesce(v_txt, '(fehlt)') || ' (erwartet has_release false, photo_video true, released true)');

  -- 05 · D, E, F, G nicht dabei
  select count(*) into v_n from sanity_speakers(null) s where s.person_id in (v_d, v_e, v_f, v_g);
  insert into t_res values ('05_nie_dabei', v_n || ' Zeilen (erwartet 0: Gast, Absage, gelöscht, Lead)');

  -- 06 · keine privaten Spalten
  select pg_get_function_result('sanity_speakers(uuid)'::regprocedure) into v_txt;
  insert into t_res values ('06_spalten',
    case when v_txt ~* '(email|phone|telefon|note|diet|hospitality|travel|contact_)' then 'FEHLER: ' || v_txt else 'ok, nur öffentliche Felder' end);

  -- 07 · Merkzeile entfernen
  insert into external_ref (system, object_type, object_id, external_id, meta)
  values ('sanity', 'speaker', v_a, 'speaker-' || v_a, '{"hash":"zztest"}');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin
    perform delete_external_ref('sanity', 'speaker', v_a);
    v_txt := 'Sitzung ERLAUBT (BUG)';
  exception when sqlstate '42501' then v_txt := 'Sitzung 42501';
  end;
  perform set_config('request.jwt.claims', '', true);
  v_ok := delete_external_ref('sanity', 'speaker', v_a);
  insert into t_res values ('07_weg_hinaus', v_txt || ', Server ' || v_ok
    || ', Zeile ' || case when exists (select 1 from external_ref r where r.system = 'sanity' and r.object_type = 'speaker' and r.object_id = v_a) then 'steht noch (BUG)' else 'weg' end
    || ', zweiter Aufruf ' || delete_external_ref('sanity', 'speaker', v_a)
    || ' (erwartet Sitzung 42501, Server true, Zeile weg, zweiter Aufruf false)');

  -- 08 · Grants
  insert into t_res values ('08_grants',
    'anon Liste ' || has_function_privilege('anon', 'sanity_speakers(uuid)', 'execute')
    || ', authenticated Liste ' || has_function_privilege('authenticated', 'sanity_speakers(uuid)', 'execute')
    || ', authenticated Weg hinaus ' || has_function_privilege('authenticated', 'delete_external_ref(text,text,uuid)', 'execute')
    || ' (erwartet false, false, false)');
end $$;
select * from t_res order by step;
rollback;
