-- Smoke-Test 0136 (EA2 · Speaker in die Event-App). Belegt:
--   01 die Liste ist ohne Speaker-/Partner-Team zu (42501) und liest im
--      Servicekontext weiter — der Lauf haengt daran (Lehre 0120);
--   02 ein **bestaetigtes** Profil steht in der Liste, ein abgesagtes nicht,
--      eines im Zustand `contacted` auch nicht;
--   03 **die Einwilligung steht als Zustand an der Zeile, nicht als Filter**:
--      ohne Erhebung `missing`, nach Erteilung `granted`, nach Widerruf
--      `revoked` — wer stillschweigend uebersprungen wird, faellt niemandem auf;
--   04 Name, Titel und Organisation kommen mit; die Organisation nimmt den
--      Freitext, sonst den Namen der verknuepften Organisation;
--   05 das Foto wird als Pfad **und** Kennzeichen geliefert (der Lauf schickt es
--      noch nicht, aber die Oberflaeche muss sagen koennen, wem es fehlt);
--   06 der Rueckverweis gehoert dem Server: aus einem angemeldeten Kontext 42501;
--   07 im Servicekontext steht er, und ein zweiter Aufruf **aendert** statt zu
--      verdoppeln;
--   08 eine unbekannte Person P0002, ein fremdes System 22023;
--   09 Personen- und Ausstellerverweis stehen nebeneinander (getrennte Arten);
--   10 die Funktion gibt `person` **nicht** als Ganzes heraus — kein `select *`,
--      keine Ernaehrungs-/Gesundheitsspalte in der Signatur (db-konventionen §2);
--   11 **der Widerruf gewinnt auch bei gleichem Zeitstempel**: Schritt 03c setzt
--      denselben `granted_at` wie die Erteilung. Vorher entschied `consent_current`
--      bei Gleichstand zufaellig und der Widerruf verschwand — an genau der Sicht
--      haengt, ob personenbezogene Daten nach Swapcard gehen.
-- Der Test leiht sich ein Konto, legt Profile an und rollt zurueck.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid;
  v_p_ok uuid; v_p_weg uuid; v_p_neu uuid;
  v_prof_ok uuid; v_prof_weg uuid; v_prof_neu uuid;
  v_org uuid; v_oe uuid; v_n integer; v_txt text;
begin
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01a ohne Recht ----------------------------------------------------------------
  begin
    perform event_app_speakers(v_ed);
    insert into t_res values ('01a_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01a_ohne_recht', 'abgewiesen ' || sqlstate); end;

  insert into role_assignment (person_id, role, scope_type, valid_from)
  values (v_pid, 'area_lead_speaker', 'global', now() - interval '1 hour');

  -- Testdaten ----------------------------------------------------------------------
  insert into organization (legal_name, communication_name, type, slug)
  values ('ZZTEST Speaker Org GmbH', 'ZZTEST Speaker Org', 'corporate', 'zztest-speaker-org') returning id into v_org;
  insert into org_edition (org_id, edition_id) values (v_org, v_ed) returning id into v_oe;

  insert into person (first_name, last_name) values ('Zeta', 'ZZTEST-Bestaetigt') returning id into v_p_ok;
  insert into person (first_name, last_name) values ('Yolanda', 'ZZTEST-Abgesagt') returning id into v_p_weg;
  insert into person (first_name, last_name) values ('Xaver', 'ZZTEST-Kontaktiert') returning id into v_p_neu;
  insert into person_email (person_id, email, is_primary) values (v_p_ok, 'zztest-bestaetigt@example.org', true);

  insert into speaker_profile (person_id, edition_id, job_title, organization_name, bio_short_de, confirmed_at, pipeline_status, speaker_type)
  values (v_p_ok, v_ed, 'Head of Nothing', 'ZZTEST Freitext AG', 'Kurzbio DE.', now(), 'confirmed', 'keynote')
  returning id into v_prof_ok;
  insert into speaker_profile (person_id, edition_id, org_id, confirmed_at, declined_at, pipeline_status, speaker_type)
  values (v_p_weg, v_ed, v_org, now(), now(), 'declined', 'panelist') returning id into v_prof_weg;
  insert into speaker_profile (person_id, edition_id, org_id, pipeline_status, speaker_type)
  values (v_p_neu, v_ed, v_org, 'contacted', 'panelist') returning id into v_prof_neu;

  -- 02 wer in der Liste steht ---------------------------------------------------------
  select string_agg(x.last_name, ', ' order by x.last_name) into v_txt
    from event_app_speakers(v_ed) x where x.last_name like 'ZZTEST-%';
  insert into t_res values ('02_liste', coalesce(v_txt, '(leer)'));

  -- 03 Einwilligung als Zustand -------------------------------------------------------
  select x.consent_state into v_txt from event_app_speakers(v_ed) x where x.person_id = v_p_ok;
  insert into t_res values ('03a_ohne_erhebung', v_txt);
  insert into consent_record (person_id, consent_type, version, granted, granted_at, source)
  values (v_p_ok, 'event_app', 'v1', true, now(), 'test');
  select x.consent_state into v_txt from event_app_speakers(v_ed) x where x.person_id = v_p_ok;
  insert into t_res values ('03b_erteilt', v_txt);
  -- Bewusst mit **demselben** `granted_at`: genau dieser Gleichstand liess die
  -- Sicht vorher zufaellig entscheiden, und der Widerruf verschwand.
  insert into consent_record (person_id, consent_type, version, granted, granted_at, revoked_at, source)
  values (v_p_ok, 'event_app', 'v1', false, (select cr.granted_at from consent_record cr
                                              where cr.person_id = v_p_ok and cr.consent_type = 'event_app' limit 1),
          now(), 'test');
  select x.consent_state into v_txt from event_app_speakers(v_ed) x where x.person_id = v_p_ok;
  insert into t_res values ('03c_widerrufen', v_txt);

  -- 04 Felder --------------------------------------------------------------------------
  select x.first_name || ' ' || x.last_name || ' · ' || coalesce(x.job_title, '-') || ' · ' || coalesce(x.organization, '-')
         || ' · ' || coalesce(x.email, '-') into v_txt
    from event_app_speakers(v_ed) x where x.person_id = v_p_ok;
  insert into t_res values ('04a_felder', v_txt);
  update speaker_profile set organization_name = null, org_id = v_org where id = v_prof_ok;
  select coalesce(x.organization, '-') into v_txt from event_app_speakers(v_ed) x where x.person_id = v_p_ok;
  insert into t_res values ('04b_org_aus_verknuepfung', v_txt);

  -- 05 Foto ----------------------------------------------------------------------------
  select coalesce(x.photo_path, '(kein Pfad)') || ' / ' || x.has_photo::text into v_txt
    from event_app_speakers(v_ed) x where x.person_id = v_p_ok;
  insert into t_res values ('05a_ohne_foto', v_txt);
  insert into speaker_asset (profile_id, kind, storage_path, filename, mime, size_bytes, version, is_current)
  values (v_prof_ok, 'photo', 'fls27/zztest/foto.jpg', 'foto.jpg', 'image/jpeg', 1000, 1, true);
  select coalesce(x.photo_path, '(kein Pfad)') || ' / ' || x.has_photo::text into v_txt
    from event_app_speakers(v_ed) x where x.person_id = v_p_ok;
  insert into t_res values ('05b_mit_foto', v_txt);

  -- 06 Rueckverweis gehoert dem Server ---------------------------------------------------
  begin
    perform set_event_app_person_ref(v_p_ok, 'swapcard', 'ZZTEST-PERSON-1');
    insert into t_res values ('06_angemeldet', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('06_angemeldet', 'abgewiesen ' || sqlstate); end;

  -- 10 keine Rundum-Ausgabe von `person` -------------------------------------------------
  select count(*) into v_n from pg_proc p, unnest(p.proargnames) as spalte
   where p.proname = 'event_app_speakers'
     and spalte in ('diet_note', 'allergies', 'health_note', 'phone', 'address_street');
  insert into t_res values ('10_keine_sensiblen_spalten', v_n::text);
end $$;

-- 01b/07/08/09 Servicekontext ------------------------------------------------------------
do $$
declare v_n integer; v_p uuid; v_oe uuid; v_txt text;
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  select count(*) into v_n from event_app_speakers(null);
  insert into t_res values ('01b_servicekontext', v_n::text || ' Zeilen');

  select x.person_id into v_p from event_app_speakers(null) x where x.last_name = 'ZZTEST-Bestaetigt';
  perform set_event_app_person_ref(v_p, 'swapcard', 'ZZTEST-PERSON-1');
  perform set_event_app_person_ref(v_p, 'swapcard', 'ZZTEST-PERSON-2');
  select count(*)::text || ' Zeile, ' || max(r.external_id) into v_txt
    from external_ref r where r.system = 'swapcard' and r.object_type = 'person' and r.object_id = v_p;
  insert into t_res values ('07_zweiter_aufruf_aendert', v_txt);

  begin
    perform set_event_app_person_ref(gen_random_uuid(), 'swapcard', 'ZZTEST-X');
    insert into t_res values ('08a_unbekannte_person', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('08a_unbekannte_person', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  begin
    perform set_event_app_person_ref(v_p, 'hubspot', 'ZZTEST-X');
    insert into t_res values ('08b_fremdes_system', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('08b_fremdes_system', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  select oe.id into v_oe from org_edition oe join organization o on o.id = oe.org_id where o.slug = 'zztest-speaker-org';
  perform set_event_app_ref(v_oe, 'swapcard', 'ZZTEST-EXH-9');
  select string_agg(r.object_type, ', ' order by r.object_type) into v_txt
    from external_ref r where r.system = 'swapcard' and r.external_id like 'ZZTEST-%';
  insert into t_res values ('09_arten_nebeneinander', v_txt);
exception when others then
  insert into t_res values ('SERVICEKONTEXT', 'FEHLER ' || sqlstate || ' ' || sqlerrm);
end $$;

select * from t_res order by step;
rollback;

-- Lauf 22.09.2026 gegen jqmqvgaiyjudkvtncijw (Probelauf, zurueckgerollt): 16/16 gruen.
--   01a abgewiesen 42501, 01b 1 Zeile im Servicekontext; 02 nur 'ZZTEST-Bestaetigt';
--   03a missing, 03b granted, 03c revoked (bei **gleichem** granted_at — vor dem
--   Gleichstandsbrecher in `consent_current` stand hier 'granted', der Widerruf war weg);
--   04a Name/Titel/Freitext-Org/E-Mail, 04b Org aus der Verknuepfung;
--   05a '(kein Pfad) / false', 05b Pfad mit true; 06 abgewiesen 42501;
--   07 '1 Zeile, ZZTEST-PERSON-2'; 08a P0002 person_not_found, 08b 22023 invalid_system;
--   09 'exhibitor, person'; 10 0 sensible Spalten.
