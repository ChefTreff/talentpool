-- Smoke-Test v6_eure_buehne (Vorschlag, PART-138): „Eure Bühne“ — der Menüpunkt hängt nur an einer Standbühne oder gebrandeten Bühne (`partner_overview.has_stage`),
-- und ein Partner trägt Speaker auch in eine Session auf der von ihm gebrandeten Bühne ein, die das Team ohne Organisation angelegt hat (`partner_add_speaker`,
-- `partner_speakers`). Echter Rollenwechsel: die handelnde Person ist ein Konto aus dem Bestand, deren Rolle je Schritt wechselt (Partner A mit Bearbeitungsrecht,
-- Leser einer anderen Organisation, Team); die Aufrufe laufen unter `set local role authenticated` (Helfer in `pg_temp`: unter der Rolle darf man nicht in `t_res`
-- schreiben). Jede Abweisung hat ihr Gegenstück (abgewiesen neben erlaubt); „0 Treffer“ allein beweist nichts. Erwartung je Schritt als Muster in `t_erw`,
-- `99_auswertung` am Ende. Wegwerfdaten (ZZ …), alles wird zurückgerollt.
--   01 Form: Definer mit gepinntem search_path, EXECUTE für Partner, nicht für anon.
--   02 has_stage: Standbühne und gebrandete Bühne ⇒ wahr, die Flächen für Side-Event und Interview Table, eine inaktive Bühne und keine Bühne ⇒ falsch.
--   03 Speaker auf der gebrandeten Bühne: eine Session ohne Organisation (vom Team angelegt) ⇒ ok, mit Profil der Organisation, Betreuung, Verknüpfung, Audit;
--      die eigene Session unverändert; der Verwaltet-Fall nimmt den Operations-Kontakt der Bühnen-Organisation.
--   04 Abweisungen: gebrandete Bühne einer anderen Organisation, Hauptbühne ohne Partner, Session einer anderen Organisation auf der eigenen Bühne, Leser, ohne Slot,
--      Standbühne und Interview Table ohne Organisation an der Session (dort gelten Gäste, PART-081).
--   05 partner_speakers: der Speaker steht mit seiner Session da; Sessions anderer Organisationen bleiben ohne Verknüpfung.
begin;
create temp table t_res (step text, result text) on commit drop;
create temp table t_erw (step text, muster text) on commit drop;
create temp table t_ctx (pid uuid, claims text) on commit drop;
insert into t_erw values
  ('01_form', '^ok add_authenticated=true add_anon=false definer=true$'),
  ('02_has_stage', '^ok signatur=true a_partner=true d_side=false e_tisch=false f_stand=true g_gebrandet=true h_keine=false i_inaktiv=false a_team=true$'),
  ('03a_team_session', '^ok$'),
  ('03_team_session', '^ok profil=true angelegt_von_a=true edition=true status=lead betreuung=true verknuepft=true audit_org=true audit_neu=true$'),
  ('03b_eigene_session', '^ok$'),
  ('03c_eigene_unveraendert', '^ok angelegt_von_a=true verknuepft=true$'),
  ('03d_verwaltet', '^ok$'),
  ('03_verwaltet', '^ok kontakt=true mail_ueber=true assistenz=true mail=1$'),
  ('03e_verwaltet_zweiter_slot', '^ok$'),
  ('03e_zweiter_slot', '^ok verknuepft=true gleiches_profil=true$'),
  ('04a_fremde_buehne', '^rejected 42501 not allowed$'),
  ('04b_hauptbuehne', '^rejected 42501 not allowed$'),
  ('04c_session_anderer_org', '^rejected 42501 not allowed$'),
  ('04d_leser', '^rejected 42501 not allowed$'),
  ('04e_ohne_slot', '^rejected 42501 not allowed$'),
  ('04f_standbuehne', '^rejected 42501 not allowed$'),
  ('04g_interview_table', '^rejected 42501 not allowed$'),
  ('04z_nichts_angelegt', '^ok sessions=0$'),
  ('05_liste', '^ok zeilen=4 team_session=true eigene_session=true fremde_ohne_session=true fremde_org_ohne_session=true stand_ohne_session=true$');

-- Wer handelt: 'partner' (die Person mit ihrer Mitgliedschaft in A und C, ohne Teamrolle) oder 'team' (Rolle area_lead_partner).
create function pg_temp.zz_als(p_wer text) returns void language plpgsql as $$
declare v_pid uuid;
begin
  select pid into v_pid from t_ctx;
  perform set_config('request.jwt.claims', (select claims from t_ctx), true);
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  if p_wer = 'team' then insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global'); end if;
end $$;

-- Ausführen (optional unter einer Rolle) und das Ergebnis als Zeile ablegen: „ok“ oder „rejected <SQLSTATE> <Meldung>“.
create function pg_temp.zz_r(p_step text, p_sql text, p_role text default null) returns void language plpgsql as $$
declare v_r text;
begin
  begin
    if p_role is not null then execute 'set local role ' || quote_ident(p_role); end if;
    execute p_sql;
    v_r := 'ok';
  exception when others then
    v_r := 'rejected ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  insert into t_res values (p_step, v_r);
end $$;

-- Eine Abfrage mit einem jsonb-Ergebnis, optional unter einer Rolle.
create function pg_temp.zz_j(p_sql text, p_role text default null) returns jsonb language plpgsql as $$
declare v_j jsonb;
begin
  if p_role is not null then execute 'set local role ' || quote_ident(p_role); end if;
  execute p_sql into v_j;
  execute 'reset role';
  return v_j;
end $$;

-- `has_stage` aus `partner_overview` einer Organisation, als Text.
create function pg_temp.zz_hs(p_org uuid) returns text language plpgsql as $$
begin
  return (pg_temp.zz_j(format('select partner_overview(%L)', p_org), 'authenticated'))->>'has_stage';
end $$;

create function pg_temp.zz_person(p_nachname text) returns uuid language plpgsql as $$
declare v_p uuid;
begin
  insert into person (first_name, last_name) values ('ZZ', p_nachname) returning id into v_p;
  insert into person_email (person_id, email, is_primary) values (v_p, 'zz-eb-' || lower(p_nachname) || '-' || v_p::text || '@example.com', true);
  return v_p;
end $$;

-- Ein Slot am ersten Eventtag, `p_n` × 30 Minuten nach 10:00 (Berliner Zeit im Sommer).
create function pg_temp.zz_slot(p_stage uuid, p_day uuid, p_n integer) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into slot (stage_id, event_day_id, start_at, end_at)
  values (p_stage, p_day, timestamptz '2027-04-16 10:00+02' + p_n * interval '30 minutes', timestamptz '2027-04-16 10:25+02' + p_n * interval '30 minutes')
  returning id into v_id;
  return v_id;
end $$;

-- Eine Session auf einem Slot; `p_org` ist `partner_org_id` (leer = vom Team ohne Organisation angelegt).
create function pg_temp.zz_session(p_event uuid, p_slot uuid, p_org uuid, p_titel text) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, publish_status, partner_org_id)
  values (p_event, p_slot, 'talk', p_titel, p_titel, 'Beschreibung', 'draft', p_org) returning id into v_id;
  return v_id;
end $$;

create function pg_temp.zz_add(p_session uuid, p_vorname text, p_verwaltet boolean default false) returns text language sql as $$
  select format('select to_jsonb(partner_add_speaker(%L, %L, %L, %L, %L))', p_session,
                'zz-eb-' || replace(gen_random_uuid()::text, '-', '') || '@example.org', p_vorname, 'Sprecher', p_verwaltet)
$$;

do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_claims text; v_ed uuid; v_vorlage uuid; v_ev uuid; v_tag uuid; p_lead uuid; p_x uuid; p_y uuid;
  o_a uuid; o_b uuid; o_c uuid; o_d uuid; o_e uuid; o_f uuid; o_g uuid; o_h uuid; o_i uuid;
  s_bra_a uuid; s_bra_b uuid; s_bra_c uuid; s_haupt uuid; s_stand_a uuid; s_tisch_a uuid;
  se_team uuid; se_eigene uuid; se_verw uuid; se_verw2 uuid; se_b uuid; se_haupt uuid; se_fremd uuid; se_c uuid; se_ohne uuid; se_stand uuid; se_tisch uuid;
  v_prof uuid; v_prof2 uuid; v_prof3 uuid; v_json jsonb; v_a text; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null order by p.created_at limit 1;
  if v_pid is null then raise exception 'VORBEDINGUNG: keine Person mit Konto'; end if;
  v_claims := json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text;
  insert into t_ctx values (v_pid, v_claims);
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_vorlage from event e where e.edition_id = v_ed and not e.is_edition limit 1;
  if v_ed is null or v_vorlage is null then raise exception 'VORBEDINGUNG: Edition fls27 oder Veranstaltung fehlt'; end if;

  -- Veranstaltung mit einem Tag in der Edition
  insert into event (name, format_tag, edition_id, timezone, slug, start_date, end_date)
    select 'ZZ Eure Bühne', e.format_tag, v_ed, 'Europe/Berlin', 'zz-eure-buehne-test', date '2027-04-16', date '2027-04-16' from event e where e.id = v_vorlage
    returning id into v_ev;
  insert into event_day (event_id, day_date, programme_start, programme_end, sort_order) values (v_ev, date '2027-04-16', time '09:00', time '18:00', 1) returning id into v_tag;

  -- Organisationen: A (die handelnde Person ist Hauptkontakt), B (fremd), C (die Person ist nur Leser), D–I je mit genau einer Fläche für has_stage
  insert into organization (legal_name) values ('ZZ Eure Bühne A GmbH') returning id into o_a;
  insert into organization (legal_name) values ('ZZ Eure Bühne B GmbH') returning id into o_b;
  insert into organization (legal_name) values ('ZZ Eure Bühne C GmbH') returning id into o_c;
  insert into organization (legal_name) values ('ZZ Side-Event-Ort D GmbH') returning id into o_d;
  insert into organization (legal_name) values ('ZZ Interview-Tisch E GmbH') returning id into o_e;
  insert into organization (legal_name) values ('ZZ Standbühne F GmbH') returning id into o_f;
  insert into organization (legal_name) values ('ZZ Gebrandet G GmbH') returning id into o_g;
  insert into organization (legal_name) values ('ZZ Ohne Bühne H GmbH') returning id into o_h;
  insert into organization (legal_name) values ('ZZ Inaktiv I GmbH') returning id into o_i;
  insert into org_edition (org_id, edition_id, onboarding_status) select o, v_ed, 'invited' from unnest(array[o_a, o_b, o_c, o_d, o_e, o_f, o_g, o_h, o_i]) o;
  insert into org_membership (org_id, person_id, roles) values (o_a, v_pid, array['primary_ops']);
  insert into org_membership (org_id, person_id, roles) values (o_c, v_pid, array['event_app_member']);
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'partner_contact', 'org', o_a), (v_pid, 'partner_contact', 'org', o_c);

  -- Bühnen: gebrandet A, B und C (main mit Partner), Hauptbühne ohne Partner, Standbühne A, Interview Table A; je eine Fläche für D–I
  p_lead := pg_temp.zz_person('Leitung');
  insert into stage (event_id, name, type, partner_org_id, active, stage_lead_person_id) values (v_ev, 'ZZ Eure Bühne A', 'main', o_a, true, p_lead) returning id into s_bra_a;
  insert into stage (event_id, name, type, partner_org_id, active) values (v_ev, 'ZZ Eure Bühne B', 'main', o_b, true) returning id into s_bra_b;
  insert into stage (event_id, name, type, partner_org_id, active) values (v_ev, 'ZZ Eure Bühne C', 'main', o_c, true) returning id into s_bra_c;
  insert into stage (event_id, name, type, active) values (v_ev, 'ZZ Hauptbühne', 'main', true) returning id into s_haupt;
  insert into stage (event_id, name, type, partner_org_id, active) values (v_ev, 'ZZ Standbühne A', 'partner_booth', o_a, true) returning id into s_stand_a;
  insert into stage (event_id, name, type, partner_org_id, active) values (v_ev, 'ZZ Tisch A', 'interview_table', o_a, true) returning id into s_tisch_a;
  insert into stage (event_id, name, type, partner_org_id, active) values (v_ev, 'ZZ Ort D', 'side_event_venue', o_d, true);
  insert into stage (event_id, name, type, partner_org_id, active) values (v_ev, 'ZZ Tisch E', 'interview_table', o_e, true);
  insert into stage (event_id, name, type, partner_org_id, active) values (v_ev, 'ZZ Standbühne F', 'partner_booth', o_f, true);
  insert into stage (event_id, name, type, partner_org_id, active) values (v_ev, 'ZZ Eure Bühne G', 'main', o_g, true);
  insert into stage (event_id, name, type, partner_org_id, active) values (v_ev, 'ZZ Eure Bühne I', 'main', o_i, false);

  -- Sessions auf je einem Slot: vom Team ohne Organisation auf der gebrandeten Bühne A (mehrere), die eigene mit Organisation A, auf B, auf der Hauptbühne,
  -- die von B auf der Bühne von A, auf C, ohne Slot, auf der Standbühne und am Interview Table von A (beide ohne Organisation)
  se_team := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_bra_a, v_tag, 0), null, 'ZZ Team-Session');
  se_eigene := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_bra_a, v_tag, 1), o_a, 'ZZ Eigene Session');
  se_verw := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_bra_a, v_tag, 2), null, 'ZZ Verwaltet');
  se_fremd := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_bra_a, v_tag, 3), o_b, 'ZZ Session von B auf der Bühne von A');
  se_verw2 := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_bra_a, v_tag, 4), null, 'ZZ Verwaltet zwei');
  se_b := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_bra_b, v_tag, 0), null, 'ZZ Session auf Bühne B');
  se_haupt := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_haupt, v_tag, 0), null, 'ZZ Session auf der Hauptbühne');
  se_c := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_bra_c, v_tag, 0), null, 'ZZ Session auf Bühne C');
  insert into session (event_id, format, title_de, title_en, description_de, publish_status) values (v_ev, 'talk', 'ZZ Ohne Slot', 'ZZ Ohne Slot', 'Beschreibung', 'draft') returning id into se_ohne;
  se_stand := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_stand_a, v_tag, 0), null, 'ZZ Session auf der Standbühne');
  se_tisch := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_tisch_a, v_tag, 0), null, 'ZZ Session am Interview Table');

  -- === 01 Form =====================================================================================================
  insert into t_res values ('01_form',
    'ok add_authenticated=' || has_function_privilege('authenticated', 'partner_add_speaker(uuid, text, text, text, boolean)', 'execute')::text
    || ' add_anon=' || has_function_privilege('anon', 'partner_add_speaker(uuid, text, text, text, boolean)', 'execute')::text
    || ' definer=' || (select bool_and(p.prosecdef and p.proconfig::text like '%search_path=public, extensions%') from pg_proc p
                        where p.pronamespace = 'public'::regnamespace and p.proname in ('partner_overview', 'partner_add_speaker', 'partner_speakers'))::text);

  -- === 02 has_stage ================================================================================================
  perform pg_temp.zz_als('partner');
  v_a := pg_temp.zz_hs(o_a);
  perform pg_temp.zz_als('team');
  insert into t_res values ('02_has_stage',
    'ok signatur=' || (select (count(*) = 1)::text from pg_proc where pronamespace = 'public'::regnamespace and proname = 'partner_overview')
    || ' a_partner=' || v_a
    || ' d_side=' || pg_temp.zz_hs(o_d)
    || ' e_tisch=' || pg_temp.zz_hs(o_e)
    || ' f_stand=' || pg_temp.zz_hs(o_f)
    || ' g_gebrandet=' || pg_temp.zz_hs(o_g)
    || ' h_keine=' || pg_temp.zz_hs(o_h)
    || ' i_inaktiv=' || pg_temp.zz_hs(o_i)
    || ' a_team=' || pg_temp.zz_hs(o_a));

  -- === 03 Speaker auf der gebrandeten Bühne =============================================================================
  perform pg_temp.zz_als('partner');
  perform pg_temp.zz_r('03a_team_session', pg_temp.zz_add(se_team, 'Erste'), 'authenticated');
  v_prof := (select sp.id from session_speaker ss join speaker_profile sp on sp.person_id = ss.person_id where ss.session_id = se_team and ss.role = 'speaker' limit 1);
  insert into t_res values ('03_team_session',
    'ok profil=' || (v_prof is not null)::text
    || ' angelegt_von_a=' || (select (created_by_org_id = o_a)::text from speaker_profile where id = v_prof)
    || ' edition=' || (select (edition_id = v_ed)::text from speaker_profile where id = v_prof)
    || ' status=' || (select pipeline_status from speaker_profile where id = v_prof)
    || ' betreuung=' || (select (owner_person_id = p_lead)::text from speaker_profile where id = v_prof)
    || ' verknuepft=' || exists (select 1 from session_speaker ss join speaker_profile sp on sp.person_id = ss.person_id where ss.session_id = se_team and sp.id = v_prof and ss.role = 'speaker')::text
    || ' audit_org=' || exists (select 1 from audit_log where action = 'partner.add_speaker' and object_id = se_team::text and after->>'org_id' = o_a::text)::text
    || ' audit_neu=' || exists (select 1 from audit_log where action = 'partner.add_speaker' and object_id = se_team::text and after->>'profile_id' = v_prof::text and (after->>'claimed')::boolean = false)::text);
  -- die eigene Session der Organisation: unverändert
  perform pg_temp.zz_r('03b_eigene_session', pg_temp.zz_add(se_eigene, 'Zweite'), 'authenticated');
  v_prof2 := (select sp.id from session_speaker ss join speaker_profile sp on sp.person_id = ss.person_id where ss.session_id = se_eigene and ss.role = 'speaker' limit 1);
  insert into t_res values ('03c_eigene_unveraendert',
    'ok angelegt_von_a=' || (select (created_by_org_id = o_a)::text from speaker_profile where id = v_prof2)
    || ' verknuepft=' || exists (select 1 from session_speaker ss join speaker_profile sp on sp.person_id = ss.person_id where ss.session_id = se_eigene and sp.id = v_prof2)::text);
  -- der Verwaltet-Fall: der Operations-Kontakt der Bühnen-Organisation (A) bekommt den Zugang, alle Mails gehen an ihn
  perform pg_temp.zz_r('03d_verwaltet', pg_temp.zz_add(se_verw, 'Dritte', true), 'authenticated');
  v_prof3 := (select sp.id from session_speaker ss join speaker_profile sp on sp.person_id = ss.person_id where ss.session_id = se_verw and ss.role = 'speaker' limit 1);
  insert into t_res values ('03_verwaltet',
    'ok kontakt=' || exists (select 1 from speaker_contact c where c.profile_id = v_prof3 and c.person_id = v_pid and c.has_access)::text
    || ' mail_ueber=' || exists (select 1 from speaker_profile sp join speaker_contact c on c.id = sp.mail_via_contact_id where sp.id = v_prof3 and c.person_id = v_pid)::text
    || ' assistenz=' || exists (select 1 from role_assignment where person_id = v_pid and role = 'speaker_assistant' and note = 'partner contact of ' || v_prof3::text)::text
    || ' mail=' || (select count(*) from mail_log where template_key = 'partner_speaker_contact' and person_id = v_pid and related_id = v_prof3)::text);
  -- derselbe Speaker auf einem zweiten Slot der Bühne, wieder verwaltet: erlaubt, weil dieselbe Organisation ihn verwaltet angelegt hat
  perform pg_temp.zz_r('03e_verwaltet_zweiter_slot',
    format('select to_jsonb(partner_add_speaker(%L, %L, %L, %L, true))', se_verw2,
           (select pe.email::text from speaker_profile sp join person_email pe on pe.person_id = sp.person_id and pe.is_primary where sp.id = v_prof3), 'Dritte', 'Sprecher'),
    'authenticated');
  insert into t_res values ('03e_zweiter_slot',
    'ok verknuepft=' || exists (select 1 from session_speaker ss join speaker_profile sp on sp.person_id = ss.person_id where ss.session_id = se_verw2 and sp.id = v_prof3)::text
    || ' gleiches_profil=' || ((select count(*) from speaker_profile sp join session_speaker ss on ss.person_id = sp.person_id
                                 where ss.session_id in (se_verw, se_verw2) and sp.created_by_org_id = o_a) = 2 and (select count(distinct sp.id) from speaker_profile sp join session_speaker ss on ss.person_id = sp.person_id
                                 where ss.session_id in (se_verw, se_verw2)) = 1)::text);

  -- === 04 Abweisungen ================================================================================================
  v_n := (select count(*) from session_speaker where session_id in (se_b, se_haupt, se_fremd, se_c, se_ohne, se_stand, se_tisch));
  perform pg_temp.zz_r('04a_fremde_buehne', pg_temp.zz_add(se_b, 'Vierte'), 'authenticated');
  perform pg_temp.zz_r('04b_hauptbuehne', pg_temp.zz_add(se_haupt, 'Fünfte'), 'authenticated');
  perform pg_temp.zz_r('04c_session_anderer_org', pg_temp.zz_add(se_fremd, 'Sechste'), 'authenticated');
  perform pg_temp.zz_r('04d_leser', pg_temp.zz_add(se_c, 'Siebte'), 'authenticated');
  perform pg_temp.zz_r('04e_ohne_slot', pg_temp.zz_add(se_ohne, 'Achte'), 'authenticated');
  perform pg_temp.zz_r('04f_standbuehne', pg_temp.zz_add(se_stand, 'Neunte'), 'authenticated');
  perform pg_temp.zz_r('04g_interview_table', pg_temp.zz_add(se_tisch, 'Zehnte'), 'authenticated');
  insert into t_res values ('04z_nichts_angelegt',
    'ok sessions=' || ((select count(*) from session_speaker where session_id in (se_b, se_haupt, se_fremd, se_c, se_ohne, se_stand, se_tisch)) - v_n)::text);

  -- === 05 partner_speakers ===========================================================================================
  -- Gegenproben: ein Speaker der Organisation A, den das Team (hier: direkt) an eine Session auf der Bühne von B und an die Session von B auf der Bühne von A legt —
  -- für A bleiben beide ohne Verknüpfung (die Session gehört nicht zu A)
  p_x := pg_temp.zz_person('Fremdverknuepft');
  p_y := pg_temp.zz_person('Standverknuepft');
  insert into speaker_profile (person_id, edition_id, pipeline_status, created_by_org_id) values (p_x, v_ed, 'lead', o_a);
  insert into session_speaker (session_id, person_id, role) values (se_b, p_x, 'speaker'), (se_fremd, p_x, 'speaker');
  -- und einer an einer Session ohne Organisation auf der Standbühne von A (keine gebrandete Bühne: dort gelten Gäste)
  insert into speaker_profile (person_id, edition_id, pipeline_status, created_by_org_id) values (p_y, v_ed, 'lead', o_a);
  insert into session_speaker (session_id, person_id, role) values (se_stand, p_y, 'speaker');
  v_json := pg_temp.zz_j(format('select jsonb_agg(to_jsonb(s)) from partner_speakers(%L) s', o_a), 'authenticated');
  insert into t_res values ('05_liste',
    'ok zeilen=' || (select count(*) from jsonb_array_elements(v_json) e where (e->>'person_id')::uuid <> all(array[p_x, p_y]))::text
    || ' team_session=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'profile_id')::uuid = v_prof and (e->>'session_id')::uuid = se_team and e->>'session_title' = 'ZZ Team-Session')::text
    || ' eigene_session=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'profile_id')::uuid = v_prof2 and (e->>'session_id')::uuid = se_eigene)::text
    || ' fremde_ohne_session=' || (not exists (select 1 from jsonb_array_elements(v_json) e where (e->>'person_id')::uuid = p_x and (e->>'session_id')::uuid = se_b))::text
    || ' fremde_org_ohne_session=' || (not exists (select 1 from jsonb_array_elements(v_json) e where (e->>'person_id')::uuid = p_x and (e->>'session_id')::uuid = se_fremd))::text
    || ' stand_ohne_session=' || (not exists (select 1 from jsonb_array_elements(v_json) e where (e->>'person_id')::uuid = p_y and (e->>'session_id')::uuid = se_stand))::text);
end $$;
insert into t_res
  select '99_auswertung',
         case when count(*) filter (where not z.erfuellt) = 0 then 'ok: alle ' || count(*)::text || ' Erwartungen erfüllt'
              else 'FEHLER: ' || string_agg(z.step, ', ' order by z.step) filter (where not z.erfuellt) end
    from (select e.step, exists (select 1 from t_res r where r.step = e.step and r.result ~ e.muster) as erfuellt from t_erw e) z;
select * from t_res order by step;
rollback;
