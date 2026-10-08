-- Smoke-Test v6_neue_speaker (Vorschlag, ADM-084): `partner_created_speakers` und `new_speaker_count` — die von Partnern
-- angelegten Speaker für die Liste „Neue Speaker“, die Marke in der Speaker-Liste und den Menü-Zähler.
-- Ablauf mit echtem Rollenwechsel (`set local role authenticated`) und **Vorbedingung**: die Gegenstücke, die nicht in die Liste
-- gehören, erfüllen die Bedingung „Betreuung fehlt oder Stand lead“ — gäbe es die Ausschlüsse nicht, stünden sie darin. „0
-- Treffer“ allein beweist nichts.
--   01 Form: SECURITY DEFINER, STABLE, `search_path` gepinnt, `anon` ohne EXECUTE, Ergebnis ohne E-Mail/Telefon/Notizen,
--      Regel „neu“ im Funktionskommentar.
--   02 Vorbedingung: acht Testprofile; vier davon dürfen nicht erscheinen (Gast, abgesagt, Person gelöscht, nicht von einem Partner),
--      erfüllen aber die Bedingung für „neu“.
--   03 Team (admin, area_lead_speaker, programme_team): genau die vier Partner-Speaker, `is_new` stimmt je Zeile, der Zähler steigt
--      um die drei neuen und gleicht der Zahl der `is_new`-Zeilen.
--   04 Zeilenform: Partner, Betreuung, Programmpunkt mit Bühne und Beginn, Buddy.
--   05 Stage Lead (speaker_manager, Bühnen-Scope): sieht nur die Speaker seiner Bühne und die, die er betreut — nie fremde.
--   06 Alle anderen (area_lead_production, speaker, ohne Rolle, ohne Anmeldung): beide Funktionen 42501.
--   07 Zuteilen mit den vorhandenen Funktionen: Betreuung setzen lässt „neu“ stehen (Stand noch lead); Stand setzen nimmt die
--      Zeile aus „neu“, sie bleibt in der Funktion (Marke); Zähler fällt entsprechend.
--   08 Eine andere Edition: keine Zeilen, kein Fehler.
begin;
create temp table t_res (step text, result text) on commit drop;
create temp table t_erw (step text, muster text) on commit drop;
insert into t_erw values
  ('01_form_liste', '^definer=true stable=true search_path=gepinnt anon=false authenticated=true ohne_email_telefon_notizen=true regel_im_kommentar=true$'),
  ('01_form_zaehler', '^definer=true stable=true search_path=gepinnt anon=false authenticated=true regel_im_kommentar=true$'),
  ('02_vorbedingung', '^8 Profile: partner=7 gast=1 abgesagt=1 geloescht=1 nicht_partner=1 ausgeschlossene_die_sonst_neu_waeren=4 betreuer_ist_speaker_manager=true$'),
  ('03_admin_liste', '^ZZNeuA:true,ZZNeuB:true,ZZNeuC:true,ZZNeuFertig:false$'),
  ('03_admin_zaehler', '^\+3 gegenueber Grundstand, gleich Zahl der is_new-Zeilen=true$'),
  ('03_area_lead_speaker_liste', '^ZZNeuA:true,ZZNeuB:true,ZZNeuC:true,ZZNeuFertig:false$'),
  ('03_area_lead_speaker_zaehler', '^\+3 gegenueber Grundstand, gleich Zahl der is_new-Zeilen=true$'),
  ('03_programme_team_liste', '^ZZNeuA:true,ZZNeuB:true,ZZNeuC:true,ZZNeuFertig:false$'),
  ('03_programme_team_zaehler', '^\+3 gegenueber Grundstand, gleich Zahl der is_new-Zeilen=true$'),
  ('03_gegenstuecke_nicht_in_liste', '^0 von 4$'),
  ('04_zeile_a', '^partner=ZZ Neu Partner partner_org_ok=true stand=lead betreuung=- sessions=1 titel=ZZ Neu Talk A buehne=ZZ Neu Buehne 1 beginn_gesetzt=true buddy=- lead_contact=-$'),
  ('04_zeile_fertig', '^betreuung=ZZ Betreuer stand=contacted buddy=ZZ Neu Buddy sessions=0$'),
  ('05_stage_lead_liste', '^ZZNeuA:true$'),
  ('05_stage_lead_zaehler', '^zaehler gleich Zahl der is_new-Zeilen=true$'),
  ('05_stage_lead_betreut_liste', '^ZZNeuA:true,ZZNeuC:true$'),
  ('06_area_lead_production', '^liste=rejected 42501 zaehler=rejected 42501$'),
  ('06_speaker', '^liste=rejected 42501 zaehler=rejected 42501$'),
  ('06_keine', '^liste=rejected 42501 zaehler=rejected 42501$'),
  ('06_ohne_anmeldung', '^liste=rejected 42501 zaehler=rejected 42501$'),
  ('07_betreuung_gesetzt', '^ZZNeuA:true betreuung=ZZ Betreuer zaehler=\+3$'),
  ('07_stand_gesetzt', '^ZZNeuA:false in_liste=true zaehler=\+2$'),
  ('07_b_betreuung_gesetzt', '^ZZNeuB:false zaehler=\+1$'),
  ('07_c_bleibt_neu', '^ZZNeuC:true$'),
  ('08_andere_edition', '^0 Zeilen, kein Fehler$');
create temp table t_base (rolle text primary key, n integer) on commit drop;
-- Die acht Testprofile: Schlüssel, Nachname, Stand, von einem Partner, Gast, abgesagt, Person gelöscht, mit Betreuung, Programmpunkt-Nr.
create temp table t_spec (
  key text primary key, last_name text, status text, partner boolean, guest boolean, declined boolean, deleted boolean,
  with_owner boolean, session_no integer, person uuid, profile uuid) on commit drop;
insert into t_spec (key, last_name, status, partner, guest, declined, deleted, with_owner, session_no) values
  ('a',         'ZZNeuA',         'lead',      true,  false, false, false, false, 1),
  ('b',         'ZZNeuB',         'contacted', true,  false, false, false, false, 2),
  ('c',         'ZZNeuC',         'lead',      true,  false, false, false, true,  null),
  ('fertig',    'ZZNeuFertig',    'contacted', true,  false, false, false, true,  null),
  ('gast',      'ZZNeuGast',      'lead',      true,  true,  false, false, false, null),
  ('abgesagt',  'ZZNeuAbgesagt',  'declined',  true,  false, true,  false, false, null),
  ('geloescht', 'ZZNeuGeloescht', 'lead',      true,  false, false, true,  false, null),
  ('eigen',     'ZZNeuEigen',     'lead',      false, false, false, false, false, null);
do $$
declare
  v_pid uuid; v_uid uuid; v_email text;
  v_ed uuid; v_ev uuid; v_tz text; v_day event_day%rowtype; v_start timestamptz;
  v_org uuid; v_owner uuid; v_buddy uuid; v_stage1 uuid; v_stage2 uuid; v_slot1 uuid; v_slot2 uuid; v_se1 uuid; v_se2 uuid;
  v_spec t_spec%rowtype; v_person uuid; v_prof uuid;
  v_rolle text; v_liste text; v_liste2 text; v_zeile_a text; v_zeile_f text;
  v_n integer; v_nl integer; v_base integer; v_r1 text; v_r2 text;
  v_a uuid; v_b uuid; v_c uuid;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  select e.id into v_ed from event e where e.is_edition order by e.start_date desc limit 1;
  select e.id, e.timezone into v_ev, v_tz
    from event e where not e.is_edition and exists (select 1 from stage st where st.event_id = e.id)
   order by (e.format_tag is distinct from 'summit'), e.start_date limit 1;
  select ed.* into v_day from event_day ed where ed.event_id = v_ev order by ed.day_date limit 1;
  v_start := (v_day.day_date + time '09:00') at time zone v_tz;

  -- === Grundstand je Team-Rolle (vor den Testdaten; im echten Datenbestand gibt es schon Partner-Speaker) =====
  foreach v_rolle in array array['admin', 'area_lead_speaker', 'programme_team'] loop
    delete from role_assignment where person_id = v_pid;
    insert into role_assignment (person_id, role, scope_type) values (v_pid, v_rolle, 'global');
    execute 'set local role authenticated';
    v_n := new_speaker_count();
    execute 'reset role';
    insert into t_base values (v_rolle, v_n);
  end loop;

  -- === Testdaten (als Owner) ==================================================================================
  insert into organization (communication_name) values ('ZZ Neu Partner') returning id into v_org;
  insert into person (first_name, last_name) values ('ZZ', 'Betreuer') returning id into v_owner;
  insert into person_email (person_id, email, is_primary) values (v_owner, 'zz-neu-owner-' || v_owner::text || '@example.com', true);
  -- Betreuung darf nur, wer `is_speaker_manager` ist; ein globaler speaker_manager verbietet die Tabelle (Stage Leads haben immer
  -- einen Bühnen-Scope), deshalb die Teamleitung.
  insert into role_assignment (person_id, role, scope_type) values (v_owner, 'area_lead_speaker', 'global');
  insert into edition_contact (edition_id, type, display_name, email, phone)
    values (v_ed, 'speaker_buddy', 'ZZ Neu Buddy', 'zz-neu-buddy@chef-treff.de', '+49 30 0000000') returning id into v_buddy;

  for v_spec in select * from t_spec order by key loop
    insert into person (first_name, last_name) values ('ZZ', v_spec.last_name) returning id into v_person;
    insert into person_email (person_id, email, is_primary) values (v_person, 'zz-neu-' || v_person::text || '@example.com', true);
    -- Ein Gast darf keine Lounge haben (`speaker_profile_stage_guest_chk`); alle anderen behalten den Standard.
    insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, owner_person_id, created_by_org_id,
                                 stage_guest, stage_guest_consent_at, lounge_access, declined_at, job_title, organization_name)
      values (v_person, v_ed, 'other', v_spec.status,
              case when v_spec.with_owner then v_owner end,
              case when v_spec.partner then v_org end,
              v_spec.guest, case when v_spec.guest then now() end, not v_spec.guest,
              case when v_spec.declined then now() end, 'ZZ Rolle', 'ZZ Firma')
      returning id into v_prof;
    if v_spec.deleted then update person set deleted_at = now() where id = v_person; end if;
    update t_spec set person = v_person, profile = v_prof where key = v_spec.key;
  end loop;
  select profile into v_a from t_spec where key = 'a';
  select profile into v_b from t_spec where key = 'b';
  select profile into v_c from t_spec where key = 'c';
  update speaker_profile set buddy_contact_id = v_buddy where id = (select profile from t_spec where key = 'fertig');

  -- Zwei Bühnen mit je einem Programmpunkt: A spricht auf Bühne 1, B auf Bühne 2.
  insert into stage (event_id, name, slug, type)
    values (v_ev, 'ZZ Neu Buehne 1', 'zz-neu-1-' || substr(gen_random_uuid()::text, 1, 6), 'main') returning id into v_stage1;
  insert into stage (event_id, name, slug, type)
    values (v_ev, 'ZZ Neu Buehne 2', 'zz-neu-2-' || substr(gen_random_uuid()::text, 1, 6), 'main') returning id into v_stage2;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
    values (v_stage1, v_day.id, v_start, v_start + interval '30 minutes', 'content', 'requested') returning id into v_slot1;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
    values (v_stage2, v_day.id, v_start + interval '60 minutes', v_start + interval '90 minutes', 'content', 'requested') returning id into v_slot2;
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, publish_status)
    values (v_ev, v_slot1, 'talk', 'ZZ Neu Talk A', 'ZZ New Talk A', 'Beschreibung', 'draft') returning id into v_se1;
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, publish_status)
    values (v_ev, v_slot2, 'talk', 'ZZ Neu Talk B', 'ZZ New Talk B', 'Beschreibung', 'draft') returning id into v_se2;
  insert into session_speaker (session_id, person_id, role) values (v_se1, (select person from t_spec where key = 'a'), 'speaker');
  insert into session_speaker (session_id, person_id, role) values (v_se2, (select person from t_spec where key = 'b'), 'speaker');

  -- Vorbedingung: die vier Ausschlüsse würden „neu“ sonst erfüllen (Betreuung fehlt oder Stand lead)
  insert into t_res values ('02_vorbedingung',
    (select count(*)::text from speaker_profile sp join t_spec s on s.profile = sp.id) || ' Profile: partner='
    || (select count(*) from speaker_profile sp join t_spec s on s.profile = sp.id where sp.created_by_org_id = v_org)::text
    || ' gast=' || (select count(*) from speaker_profile sp join t_spec s on s.profile = sp.id where sp.stage_guest)::text
    || ' abgesagt=' || (select count(*) from speaker_profile sp join t_spec s on s.profile = sp.id where sp.declined_at is not null and sp.pipeline_status = 'declined')::text
    || ' geloescht=' || (select count(*) from speaker_profile sp join t_spec s on s.profile = sp.id join person p on p.id = sp.person_id where p.deleted_at is not null)::text
    || ' nicht_partner=' || (select count(*) from speaker_profile sp join t_spec s on s.profile = sp.id where sp.created_by_org_id is null)::text
    || ' ausgeschlossene_die_sonst_neu_waeren=' || (select count(*) from speaker_profile sp join t_spec s on s.profile = sp.id join person p on p.id = sp.person_id
         where s.key in ('gast', 'abgesagt', 'geloescht', 'eigen') and (sp.owner_person_id is null or sp.pipeline_status = 'lead'))::text
    || ' betreuer_ist_speaker_manager=' || is_speaker_manager(v_owner)::text);

  -- === 01 Form =================================================================================================
  insert into t_res
    select '01_form_liste',
           'definer=' || p.prosecdef::text || ' stable=' || (p.provolatile = 's')::text
           || ' search_path=' || coalesce((select 'gepinnt' from unnest(p.proconfig) c where c like 'search_path=%'), 'FEHLT')
           || ' anon=' || has_function_privilege('anon', p.oid, 'execute')::text
           || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'execute')::text
           || ' ohne_email_telefon_notizen=' || (pg_get_function_result(p.oid) !~* '(mail|phone|telefon|note)')::text
           || ' regel_im_kommentar=' || (coalesce(obj_description(p.oid, 'pg_proc'), '') ~ 'Betreuung fehlt ODER Pipeline-Stand ist noch lead')::text
      from pg_proc p where p.proname = 'partner_created_speakers' and p.pronamespace = 'public'::regnamespace;
  insert into t_res
    select '01_form_zaehler',
           'definer=' || p.prosecdef::text || ' stable=' || (p.provolatile = 's')::text
           || ' search_path=' || coalesce((select 'gepinnt' from unnest(p.proconfig) c where c like 'search_path=%'), 'FEHLT')
           || ' anon=' || has_function_privilege('anon', p.oid, 'execute')::text
           || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'execute')::text
           || ' regel_im_kommentar=' || (coalesce(obj_description(p.oid, 'pg_proc'), '') ~ 'Betreuung fehlt ODER Stand noch lead')::text
      from pg_proc p where p.proname = 'new_speaker_count' and p.pronamespace = 'public'::regnamespace;

  -- === 03 Team: Liste und Zähler ===============================================================================
  foreach v_rolle in array array['admin', 'area_lead_speaker', 'programme_team'] loop
    delete from role_assignment where person_id = v_pid;
    insert into role_assignment (person_id, role, scope_type) values (v_pid, v_rolle, 'global');
    execute 'set local role authenticated';
    select coalesce(string_agg(s.last_name || ':' || s.is_new::text, ',' order by s.last_name), '') into v_liste
      from partner_created_speakers() s where s.partner_name = 'ZZ Neu Partner';
    v_n := new_speaker_count();
    select count(*)::integer into v_nl from partner_created_speakers() s where s.is_new;
    execute 'reset role';
    select n into v_base from t_base where rolle = v_rolle;
    insert into t_res values ('03_' || v_rolle || '_liste', v_liste);
    insert into t_res values ('03_' || v_rolle || '_zaehler',
      case when v_n - v_base >= 0 then '+' else '' end || (v_n - v_base)::text || ' gegenueber Grundstand, gleich Zahl der is_new-Zeilen=' || (v_n = v_nl)::text);
  end loop;

  -- Als admin: die Gegenstücke fehlen, die Zeilenform stimmt
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  execute 'set local role authenticated';
  select count(*)::integer into v_n from partner_created_speakers() s
   where s.last_name in ('ZZNeuGast', 'ZZNeuAbgesagt', 'ZZNeuGeloescht', 'ZZNeuEigen');
  select 'partner=' || s.partner_name || ' partner_org_ok=' || (s.partner_org_id = v_org)::text
         || ' stand=' || s.pipeline_status || ' betreuung=' || coalesce(s.owner_name, '-')
         || ' sessions=' || jsonb_array_length(s.sessions)::text
         || ' titel=' || coalesce(s.sessions -> 0 ->> 'title_de', '-')
         || ' buehne=' || coalesce(s.sessions -> 0 ->> 'stage_name', '-')
         || ' beginn_gesetzt=' || ((s.sessions -> 0 ->> 'start_at') is not null)::text
         || ' buddy=' || coalesce(s.buddy_name, '-') || ' lead_contact=' || coalesce(s.lead_contact_id::text, '-')
    into v_zeile_a from partner_created_speakers() s where s.last_name = 'ZZNeuA';
  select 'betreuung=' || coalesce(s.owner_name, '-') || ' stand=' || s.pipeline_status
         || ' buddy=' || coalesce(s.buddy_name, '-') || ' sessions=' || jsonb_array_length(s.sessions)::text
    into v_zeile_f from partner_created_speakers() s where s.last_name = 'ZZNeuFertig';
  execute 'reset role';
  insert into t_res values ('03_gegenstuecke_nicht_in_liste', v_n::text || ' von 4');
  insert into t_res values ('04_zeile_a', v_zeile_a);
  insert into t_res values ('04_zeile_fertig', v_zeile_f);

  -- === 05 Stage Lead (speaker_manager mit Bühnen-Scope): nur die Speaker der eigenen Bühne =====================
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'speaker_manager', 'stage', v_stage1);
  execute 'set local role authenticated';
  select coalesce(string_agg(s.last_name || ':' || s.is_new::text, ',' order by s.last_name), '') into v_liste
    from partner_created_speakers() s where s.partner_name = 'ZZ Neu Partner';
  v_n := new_speaker_count();
  select count(*)::integer into v_nl from partner_created_speakers() s where s.is_new;
  execute 'reset role';
  insert into t_res values ('05_stage_lead_liste', v_liste);
  insert into t_res values ('05_stage_lead_zaehler', 'zaehler gleich Zahl der is_new-Zeilen=' || (v_n = v_nl)::text);
  -- Betreuung: wer eine Speakerin betreut, sieht sie, auch ohne Bühne
  update speaker_profile set owner_person_id = v_pid where id = v_c;
  execute 'set local role authenticated';
  select coalesce(string_agg(s.last_name || ':' || s.is_new::text, ',' order by s.last_name), '') into v_liste
    from partner_created_speakers() s where s.partner_name = 'ZZ Neu Partner';
  execute 'reset role';
  insert into t_res values ('05_stage_lead_betreut_liste', v_liste);
  update speaker_profile set owner_person_id = v_owner where id = v_c;

  -- === 06 Alle anderen: 42501 ==================================================================================
  foreach v_rolle in array array['area_lead_production', 'speaker', 'keine'] loop
    delete from role_assignment where person_id = v_pid;
    if v_rolle <> 'keine' then
      insert into role_assignment (person_id, role, scope_type) values (v_pid, v_rolle, 'global');
    end if;
    execute 'set local role authenticated';
    begin perform partner_created_speakers(); v_r1 := 'ALLOWED (BUG)'; exception when others then v_r1 := 'rejected ' || sqlstate; end;
    begin perform new_speaker_count(); v_r2 := 'ALLOWED (BUG)'; exception when others then v_r2 := 'rejected ' || sqlstate; end;
    execute 'reset role';
    insert into t_res values ('06_' || v_rolle, 'liste=' || v_r1 || ' zaehler=' || v_r2);
  end loop;

  -- === 07 Zuteilen mit den vorhandenen Funktionen (area_lead_speaker) ==========================================
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_speaker', 'global');
  select n into v_base from t_base where rolle = 'area_lead_speaker';
  -- Schritt 1: Betreuung für A setzen — der Stand ist noch lead, A bleibt neu
  execute 'set local role authenticated';
  perform handover_speaker(v_a, v_owner);
  select s.last_name || ':' || s.is_new::text || ' betreuung=' || coalesce(s.owner_name, '-') into v_liste
    from partner_created_speakers() s where s.last_name = 'ZZNeuA';
  v_n := new_speaker_count();
  execute 'reset role';
  insert into t_res values ('07_betreuung_gesetzt', v_liste || ' zaehler=+' || (v_n - v_base)::text);
  -- Schritt 2: Stand für A setzen — A verlässt „neu“, bleibt aber in der Funktion
  execute 'set local role authenticated';
  perform set_speaker_pipeline(v_a, 'contacted');
  select s.last_name || ':' || s.is_new::text into v_liste from partner_created_speakers() s where s.last_name = 'ZZNeuA';
  v_n := new_speaker_count();
  execute 'reset role';
  insert into t_res values ('07_stand_gesetzt',
    coalesce(v_liste, 'ZZNeuA fehlt') || ' in_liste=' || (v_liste is not null)::text || ' zaehler=+' || (v_n - v_base)::text);
  -- Schritt 3: B hat den Stand schon, es fehlt die Betreuung — mit ihr ist B nicht mehr neu; C (Betreuung da, Stand lead) bleibt neu
  execute 'set local role authenticated';
  perform handover_speaker(v_b, v_owner);
  select s.last_name || ':' || s.is_new::text into v_liste from partner_created_speakers() s where s.last_name = 'ZZNeuB';
  v_n := new_speaker_count();
  select s.last_name || ':' || s.is_new::text into v_liste2 from partner_created_speakers() s where s.last_name = 'ZZNeuC';
  execute 'reset role';
  insert into t_res values ('07_b_betreuung_gesetzt', v_liste || ' zaehler=+' || (v_n - v_base)::text);
  insert into t_res values ('07_c_bleibt_neu', v_liste2);

  -- === 08 Eine andere Edition: leer, kein Fehler ===============================================================
  execute 'set local role authenticated';
  select count(*)::integer into v_n from partner_created_speakers('00000000-0000-0000-0000-000000000000'::uuid);
  execute 'reset role';
  insert into t_res values ('08_andere_edition', v_n::text || ' Zeilen, kein Fehler');

  -- === 06 Ohne Anmeldung (zuletzt: die Anmeldung wird dafür entfernt) ==========================================
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role authenticated';
  begin perform partner_created_speakers(); v_r1 := 'ALLOWED (BUG)'; exception when others then v_r1 := 'rejected ' || sqlstate; end;
  begin perform new_speaker_count(); v_r2 := 'ALLOWED (BUG)'; exception when others then v_r2 := 'rejected ' || sqlstate; end;
  execute 'reset role';
  insert into t_res values ('06_ohne_anmeldung', 'liste=' || v_r1 || ' zaehler=' || v_r2);
end $$;
insert into t_res
  select '99_auswertung',
         case when count(*) filter (where not z.erfuellt) = 0 then 'ok: alle ' || count(*)::text || ' Erwartungen erfüllt'
              else 'FEHLER: ' || string_agg(z.step, ', ' order by z.step) filter (where not z.erfuellt) end
    from (select e.step, exists (select 1 from t_res r where r.step = e.step and r.result ~ e.muster) as erfuellt from t_erw e) z;
select * from t_res order by step;
rollback;
