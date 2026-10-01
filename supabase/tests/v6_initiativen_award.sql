-- Test zu `v6_initiativen_award` (ADM-022, ADM-024). Belegt:
--   01 Funnel: Stufenwechsel mit Notiz schreibt den Verlauf; Notiz ohne Wechsel
--      auch; gleiche Stufe ohne Notiz nicht; Verlauf nur mit Abschnitt initiatives;
--   02 Stand-Tage: INI-STAND-1T = 1, -2T = 2; upsert_product nimmt 1/2/leer an,
--      3 ⇒ invalid_stand_days;
--   03 Award-Server-Funktionen mit Sitzung: 42501 (nie über das Portal);
--   04 Bewerbung: fehlendes Feld, falsche Adresse, ohne Einwilligung,
--      unbekanntes Themenfeld ⇒ Status invalid mit Feld, **kein Fehler**;
--      gültig ⇒ ok; nach drei am Tag ⇒ rate_limited; Frist vorbei ⇒ closed;
--   05 Bilder: nur eigene Pfade, nur derselbe Absender, nur einmal;
--   06 Abstimmung: eingereicht ⇒ not_votable; angenommen und offen ⇒ ok, zweites
--      Mal duplicate; andere Quelle ⇒ ok; geschlossen ⇒ closed; kein Klartext,
--      nur 64-Hex-Hash im Speicher, und der ist nicht der Wert der Route;
--   07 öffentliche Liste: nur angenommene, ohne Kontaktfelder (Spalten), voted
--      je Quelle; ohne Eintrag eine Zeile mit den Fenstern;
--   08 Admin: Liste mit Stimmen und Kontakt, Status mit Audit, invalid_state,
--      Organisation verknüpfen, Löschen legt Bilder in die Aufräum-Warteschlange;
--      ohne Abschnitt 42501;
--   09 Fristen: drei Platzhalter-Zeilen der Edition mit Zielgruppe award;
--   10 Bucket award-images privat, nur WebP, keine Policy (Upload nur über die Route).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_me uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_oe uuid; v_txt text; v_n integer; v_j jsonb;
  v_a uuid; v_b uuid; v_c uuid; v_d jsonb;
  h1 text := encode(extensions.digest('203.0.113.7', 'sha256'), 'hex');
  h2 text := encode(extensions.digest('198.51.100.9', 'sha256'), 'hex');
  h3 text := encode(extensions.digest('192.0.2.44', 'sha256'), 'hex');
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  v_ed := award_current_edition();
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'partner_team', 'global');
  insert into organization (legal_name, type) values ('ZZTEST Initiative e.V.', 'initiative') returning id into v_org;
  insert into org_edition (org_id, edition_id, source) values (v_org, v_ed, 'portal') returning id into v_oe;
  -- Fenster für den Test: Bewerbung offen, Abstimmung offen.
  update deadline set due_at = now() + interval '1 day' where edition_id = v_ed and key = 'award_apply_until';
  update deadline set due_at = now() - interval '1 day' where edition_id = v_ed and key = 'award_vote_from';
  update deadline set due_at = now() + interval '1 day' where edition_id = v_ed and key = 'award_vote_until';

  -- 01 · Funnel
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  perform set_initiative_stage(v_oe, 'outreach');
  perform set_initiative_stage(v_oe, 'gespraech', 'Erstes Gespräch mit dem Vorstand');
  perform set_initiative_stage(v_oe, 'gespraech', 'Rückruf vereinbart');
  perform set_initiative_stage(v_oe, 'gespraech');
  select string_agg(coalesce(h.stage, '-') || ':' || coalesce(h.note, '-'), ' | ' order by h.changed_at) into v_txt
    from initiative_stage_history(v_oe) h;
  select count(*) into v_n from initiative_stage_log where org_edition_id = v_oe;
  insert into t_res values ('01a_verlauf', v_n || ' Zeilen (erwartet 3)');
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'talent_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin perform initiative_stage_history(v_oe); v_txt := 'ERLAUBT'; exception when sqlstate '42501' then v_txt := '42501'; end;
  insert into t_res values ('01b_verlauf_ohne_abschnitt', v_txt || ' (erwartet 42501)');
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'partner_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 02 · Stand-Tage
  select string_agg(sku || '=' || coalesce(stand_days::text, '-'), ' ' order by sku) into v_txt
    from product where sku in ('INI-STAND-1T', 'INI-STAND-2T');
  perform upsert_product(jsonb_build_object('sku', 'INI-ZZTEST-STAND', 'name_de', 'ZZTEST Stand', 'type', 'package', 'category', 'standflaeche', 'stand_days', '1'));
  perform upsert_product(jsonb_build_object('sku', 'INI-ZZTEST-STAND', 'stand_days', ''));
  v_txt := v_txt || ' geleert=' || coalesce((select stand_days::text from product where sku = 'INI-ZZTEST-STAND'), 'null');
  begin perform upsert_product(jsonb_build_object('sku', 'INI-ZZTEST-STAND', 'stand_days', '3')); v_txt := v_txt || ' 3=ANGENOMMEN';
  exception when sqlstate '22023' then v_txt := v_txt || ' 3=' || sqlerrm; end;
  insert into t_res values ('02_stand_tage', v_txt || ' (erwartet INI-STAND-1T=1 INI-STAND-2T=2 geleert=null 3=invalid_stand_days)');

  -- 03 · Server-Funktionen mit Sitzung
  v_txt := '';
  begin perform award_apply('{}'::jsonb, h1); v_txt := v_txt || 'apply ERLAUBT; '; exception when sqlstate '42501' then v_txt := v_txt || 'apply 42501; '; end;
  begin perform award_vote_cast(gen_random_uuid(), h1); v_txt := v_txt || 'vote ERLAUBT; '; exception when sqlstate '42501' then v_txt := v_txt || 'vote 42501; '; end;
  begin perform award_public_entries(h1); v_txt := v_txt || 'public ERLAUBT'; exception when sqlstate '42501' then v_txt := v_txt || 'public 42501'; end;
  insert into t_res values ('03_mit_sitzung', v_txt || ' (erwartet alle 42501)');
  perform set_config('request.jwt.claims', '', true);

  -- 04 · Bewerbung
  v_d := jsonb_build_object('name', 'ZZTEST Hochschulgruppe', 'topics', jsonb_build_array('tech_ai', 'sustainability'),
           'location', 'Hamburg', 'description', 'Wir sind …', 'mission', 'Wir wollen …', 'project', 'Unser Projekt …',
           'contact_first_name', 'Ada', 'contact_last_name', 'ZZTEST', 'contact_email', 'zztest-award@example.org',
           'founded_year', '2019', 'active_members', '40', 'privacy_consent', 'true');
  select string_agg((award_apply(x.d, h1))->>'field', ',' order by x.n) into v_txt from (values
    (1, v_d - 'mission'), (2, v_d || '{"contact_email":"keine-adresse"}'), (3, v_d - 'privacy_consent'),
    (4, v_d || '{"topics":["astrologie"]}'), (5, v_d || '{"founded_year":"neunzehn"}')) as x(n, d);
  insert into t_res values ('04a_ungueltig', v_txt || ' (erwartet mission,contact_email,privacy_consent,topics,founded_year)');
  v_j := award_apply(v_d, h1); v_a := (v_j->>'id')::uuid;
  v_txt := v_j->>'status';
  v_j := award_apply(v_d || '{"name":"ZZTEST Zwei"}', h1); v_b := (v_j->>'id')::uuid;
  v_j := award_apply(v_d || '{"name":"ZZTEST Drei"}', h1); v_c := (v_j->>'id')::uuid;
  v_txt := v_txt || ' vierte=' || ((award_apply(v_d || '{"name":"ZZTEST Vier"}', h1))->>'status');
  update deadline set due_at = now() - interval '1 minute' where edition_id = v_ed and key = 'award_apply_until';
  v_txt := v_txt || ' nach_frist=' || ((award_apply(v_d, h2))->>'status');
  update deadline set due_at = now() + interval '1 day' where edition_id = v_ed and key = 'award_apply_until';
  insert into t_res values ('04b_gueltig_rate_frist', v_txt || ' (erwartet ok vierte=rate_limited nach_frist=closed)');

  -- 05 · Bilder
  v_txt := award_set_images(v_a, array[v_ed || '/' || v_b || '/1.webp'], h1);
  v_txt := v_txt || ' ' || award_set_images(v_a, array[v_ed || '/' || v_a || '/1.webp'], h2);
  v_txt := v_txt || ' ' || award_set_images(v_a, array[v_ed || '/' || v_a || '/1.webp', v_ed || '/' || v_a || '/2.webp'], h1);
  v_txt := v_txt || ' ' || award_set_images(v_a, array[v_ed || '/' || v_a || '/3.webp'], h1);
  insert into t_res values ('05_bilder', v_txt || ' bilder=' || (select cardinality(images) from award_application where id = v_a)
    || ' (erwartet invalid invalid ok invalid bilder=2)');

  -- 06 · Abstimmung
  v_txt := award_vote_cast(v_a, h2);
  update award_application set status = 'accepted' where id in (v_a, v_b);
  v_txt := v_txt || ' ' || award_vote_cast(v_a, h2) || ' ' || award_vote_cast(v_a, h2) || ' ' || award_vote_cast(v_a, h3)
           || ' ' || award_vote_cast(v_a, 'kein-hash');
  update deadline set due_at = now() - interval '1 minute' where edition_id = v_ed and key = 'award_vote_until';
  v_txt := v_txt || ' ' || award_vote_cast(v_b, h2);
  update deadline set due_at = now() + interval '1 day' where edition_id = v_ed and key = 'award_vote_until';
  insert into t_res values ('06a_abstimmen', v_txt || ' (erwartet not_votable ok duplicate ok invalid closed)');
  select count(*) into v_n from award_vote v where v.application_id = v_a and v.voter_hash ~ '^[0-9a-f]{64}$' and v.voter_hash not in (h2, h3);
  insert into t_res values ('06b_nur_hash', v_n || ' (erwartet 2)');

  -- 07 · öffentliche Liste
  select count(*)::text || ' voted_a=' || bool_or(x.voted and x.id = v_a)::text || ' voted_b=' || coalesce(bool_or(x.voted and x.id = v_b), false)::text
    into v_txt from award_public_entries(h2) x;
  insert into t_res values ('07a_oeffentlich', v_txt || ' (erwartet 2 voted_a=true voted_b=false)');
  select count(*) into v_n from information_schema.parameters
   where specific_name like 'award_public_entries%' and parameter_mode = 'OUT'
     and parameter_name in ('contact_first_name', 'contact_last_name', 'contact_email', 'notes', 'submitter_hash');
  -- Gegenprobe: dieselbe Abfrage findet die Spalte `name` — sonst belegte die 0 nichts.
  insert into t_res values ('07b_ohne_kontakt', v_n || ' Kontaktspalten, name=' || (select count(*) from information_schema.parameters
     where specific_name like 'award_public_entries%' and parameter_mode = 'OUT' and parameter_name = 'name') || ' (erwartet 0 Kontaktspalten, name=1)');
  update award_application set status = 'submitted' where id in (v_a, v_b);
  select count(*)::text || ' fenster=' || bool_and(x.id is null and x.apply_open is not null)::text into v_txt from award_public_entries(null) x;
  insert into t_res values ('07c_leer_mit_fenstern', v_txt || ' (erwartet 1 fenster=true)');

  -- 08 · Admin
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  perform set_award_status(v_a, 'finalist');
  begin perform set_award_status(v_a, 'gold'); v_txt := 'ANGENOMMEN'; exception when sqlstate '22023' then v_txt := sqlerrm; end;
  perform set_award_organization(v_a, v_org);
  select x.status || ' stimmen=' || x.votes || ' kontakt=' || x.contact_email || ' org=' || coalesce(x.organization_name, '-') || ' ' || v_txt
    into v_txt from award_applications_admin() x where x.id = v_a;
  insert into t_res values ('08a_admin', coalesce(v_txt, '-') || ' (erwartet finalist stimmen=2 kontakt=zztest-award@example.org org=ZZTEST Initiative e.V. invalid_state)');
  select count(*) into v_n from audit_log where action in ('award.status', 'award.organization') and object_id = v_a::text;
  perform delete_award_application(v_a);
  insert into t_res values ('08b_audit_loeschen', 'audit=' || v_n || ' weg=' || (select count(*) = 0 from award_application where id = v_a)::text
    || ' stimmen_weg=' || (select count(*) = 0 from award_vote where application_id = v_a)::text
    || ' warteschlange=' || (select count(*) from storage_purge_queue where bucket = 'award-images' and path like v_ed || '/' || v_a || '/%')
    || ' (erwartet audit=2 weg=true stimmen_weg=true warteschlange=2)');
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'talent_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  v_txt := '';
  begin perform award_applications_admin(); v_txt := v_txt || 'liste ERLAUBT; '; exception when sqlstate '42501' then v_txt := v_txt || 'liste 42501; '; end;
  begin perform set_award_status(v_b, 'accepted'); v_txt := v_txt || 'status ERLAUBT'; exception when sqlstate '42501' then v_txt := v_txt || 'status 42501'; end;
  insert into t_res values ('08c_ohne_abschnitt', v_txt || ' (erwartet liste 42501; status 42501)');
  perform set_config('request.jwt.claims', '', true);

  -- 09 · Fristen
  select string_agg(key || ':' || audience, ' ' order by key) into v_txt from deadline where edition_id = v_ed and key like 'award_%';
  insert into t_res values ('09_fristen', v_txt || ' (erwartet award_apply_until:award award_vote_from:award award_vote_until:award)');

  -- 10 · Bucket: privat, nur WebP, keine Policy für Portal oder anon (Upload nur über die Server-Route)
  select b.public::text || ' ' || array_to_string(b.allowed_mime_types, ',') || ' policies='
         || (select count(*) from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects'
              and (coalesce(p.qual, '') || coalesce(p.with_check, '')) like '%award-images%')
    into v_txt from storage.buckets b where b.id = 'award-images';
  -- Gegenprobe: dieselbe Abfrage findet die Policies von person-cv.
  insert into t_res values ('10_bucket', coalesce(v_txt, '-') || ' gegenprobe_cv=' || ((select count(*) from pg_policies p
     where p.schemaname = 'storage' and p.tablename = 'objects'
       and (coalesce(p.qual, '') || coalesce(p.with_check, '')) like '%person-cv%') > 0)::text
     || ' (erwartet false image/webp policies=0 gegenprobe_cv=true)');
end $$;
select * from t_res order by step;
rollback;
