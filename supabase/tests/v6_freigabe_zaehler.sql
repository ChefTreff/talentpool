-- Smoke-Test v6_freigabe_zaehler (Vorschlag, ADM-072b / ADM-080): `freigabe_zaehler()` nennt je Art, wie viele Einträge
-- auf eine Entscheidung warten — nur für Arten, die der Aufrufer entscheiden darf.
-- Ablauf mit echtem Rollenwechsel (`set local role authenticated`, damit die RLS des Boards gilt) und **Vorbedingung**:
--   1. Grundstand je Rolle (admin, programme_team, area_lead_speaker, area_lead_production, keine) — vor den Testdaten.
--   2. Testdaten: je Art Einträge, die zählen, **und Gegenstücke, die nicht zählen** (entschieden, storniert, auf der
--      Standbühne im Entwurf) — „0 Treffer“ allein beweist nichts.
--   3. Stand je Rolle noch einmal: Schlüsselmenge und Differenz zum Grundstand je Art.
-- Erwartung je Rolle (Differenz zum Grundstand):
--   admin                  inhalte +1, slots +2 (Hauptbühne im Entwurf + Standbühne in Prüfung), reisekosten +1, hotel +2 (angefragt + Warteliste), shuttle +1
--   programme_team         inhalte +1, slots +2, shuttle +1; **kein** reisekosten (nicht Freigeber); hotel +2, **wenn** die Hotel-Liste ihm offensteht
--   area_lead_speaker      inhalte +1, slots +0 (RLS: kein Programm-Team, sieht Unveröffentlichtes nicht), reisekosten +1, shuttle +1; hotel +2, wenn offen
--   area_lead_production   nur slots (+0) — der Abschnitt `programme`, sonst nichts
--   keine Rolle            {} (keine Art, nie eine 0)
-- Dazu: ohne Anmeldung 28000; `anon` darf nicht aufrufen, `authenticated` ja.
-- Ob „hotel“ bei Programm-Team und area_lead_speaker im Ergebnis steht, bestimmt die Hotel-Liste selbst
-- (`hospitality_admin_overview`, Tor `is_staff()` bzw. nach `v6_hotel_freigabe_rechte` `is_speaker_team`) — der Test
-- fragt sie als dieselbe Rolle und hält Menü und Liste gegeneinander, vor wie nach dieser Migration.
begin;
create temp table t_res (step text, result text) on commit drop;
create temp table t_base (rolle text primary key, z jsonb) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text;
  v_ev uuid; v_ed uuid; v_tz text; v_day event_day%rowtype; v_start timestamptz;
  v_org uuid; v_main uuid; v_booth uuid; v_slot1 uuid; v_slot2 uuid; v_slot3 uuid; v_slot4 uuid;
  v_se uuid; v_other uuid; v_sp uuid; v_q uuid;
  v_rolle text; v_z jsonb; v_b jsonb; v_exp jsonb; v_k text; v_hotel_offen boolean; v_fehler text; v_keys text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- Der Summit, wie ihn die Seite wählt (boardEvents): nur Veranstaltungen mit Bühnen, Summit zuerst.
  select e.id, e.timezone into v_ev, v_tz
    from event e where not e.is_edition and exists (select 1 from stage st where st.event_id = e.id)
   order by (e.format_tag is distinct from 'summit'), e.start_date limit 1;
  select ed.* into v_day from event_day ed where ed.event_id = v_ev order by ed.day_date limit 1;
  v_start := (v_day.day_date + time '09:00') at time zone v_tz;
  -- Die Fahrtliste (`shuttle_bookings_admin`) liest die jüngste Edition; das Profil gehört dorthin.
  select e.id into v_ed from event e where e.is_edition order by e.start_date desc limit 1;

  -- === 1 · Grundstand je Rolle ================================================================================
  foreach v_rolle in array array['admin', 'programme_team', 'area_lead_speaker', 'area_lead_production', 'keine'] loop
    delete from role_assignment where person_id = v_pid;
    if v_rolle <> 'keine' then
      insert into role_assignment (person_id, role, scope_type) values (v_pid, v_rolle, 'global');
    end if;
    execute 'set local role authenticated';
    v_z := freigabe_zaehler();
    execute 'reset role';
    insert into t_base values (v_rolle, v_z);
  end loop;
  insert into t_res values ('01_grundstand_keine_rolle', (select z::text from t_base where rolle = 'keine'));

  -- === 2 · Testdaten (als Owner) ===============================================================================
  insert into person (first_name, last_name) values ('ZZ', 'Zaehlerspeaker') returning id into v_other;
  insert into person_email (person_id, email, is_primary) values (v_other, 'zz-zaehler-' || v_other::text || '@example.com', true);
  insert into speaker_profile (person_id, edition_id, speaker_type, hospitality_status, created_by)
    values (v_other, v_ed, 'panelist', 'requested', v_pid) returning id into v_sp;
  insert into organization (communication_name) values ('ZZ Zähler Partner') returning id into v_org;

  -- Bühnen und Slots: eine Hauptbühne (Entwurf zählt, abgesagt nicht), eine Standbühne (Prüfung zählt, Entwurf nicht)
  insert into stage (event_id, name, slug, type)
    values (v_ev, 'ZZ Zähler Hauptbühne', 'zz-zaehler-main-' || substr(gen_random_uuid()::text, 1, 6), 'main') returning id into v_main;
  insert into stage (event_id, name, slug, type, partner_org_id)
    values (v_ev, 'ZZ Zähler Standbühne', 'zz-zaehler-booth-' || substr(gen_random_uuid()::text, 1, 6), 'partner_booth', v_org) returning id into v_booth;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
    values (v_main, v_day.id, v_start, v_start + interval '30 minutes', 'content', 'requested') returning id into v_slot1;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
    values (v_main, v_day.id, v_start + interval '60 minutes', v_start + interval '90 minutes', 'content', 'requested') returning id into v_slot2;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
    values (v_booth, v_day.id, v_start, v_start + interval '30 minutes', 'content', 'requested') returning id into v_slot3;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
    values (v_booth, v_day.id, v_start + interval '60 minutes', v_start + interval '90 minutes', 'content', 'requested') returning id into v_slot4;
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, publish_status)
    values (v_ev, v_slot1, 'talk', 'ZZ Zähler Entwurf', 'ZZ counter draft', 'Beschreibung', 'draft') returning id into v_se;        -- zählt (Slots)
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, publish_status)
    values (v_ev, v_slot2, 'talk', 'ZZ Zähler abgesagt', 'ZZ counter cancelled', 'Beschreibung', 'cancelled');                      -- zählt nicht
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, partner_org_id, host_org_id, publish_status)
    values (v_ev, v_slot3, 'talk', 'ZZ Zähler Standbühne Prüfung', 'ZZ counter booth review', 'Beschreibung', v_org, v_org, 'review'); -- zählt (Slots)
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, partner_org_id, host_org_id, publish_status)
    values (v_ev, v_slot4, 'talk', 'ZZ Zähler Standbühne Entwurf', 'ZZ counter booth draft', 'Beschreibung', v_org, v_org, 'draft'); -- zählt nicht (Entwurf auf der Standbühne)

  -- Titel & Beschreibungen: ein offener Vorschlag zählt, ein freigegebener nicht
  insert into session_submission (session_id, speaker_profile_id, submitted_by, title, status) values (v_se, v_sp, v_other, 'ZZ Vorschlag', 'submitted');
  insert into session_submission (session_id, speaker_profile_id, submitted_by, title, status) values (v_se, v_sp, v_other, 'ZZ Vorschlag alt', 'approved');

  -- Reisekosten: eingereicht zählt, freigegeben nicht
  insert into expense_claim (profile_id, status, positions, amount_cents) values (v_sp, 'submitted', '[]'::jsonb, 100);
  insert into expense_claim (profile_id, status, positions, amount_cents) values (v_sp, 'approved', '[]'::jsonb, 100);

  -- Hotel: angefragt und Warteliste zählen, bestätigt und storniert nicht
  insert into hospitality_quota (edition_id, kind, tier, label_de, label_en, capacity)
    values (v_ed, 'hotel', 'standard', 'ZZ Zähler Hotel', 'ZZ Zähler Hotel', 5) returning id into v_q;
  insert into hospitality_booking (quota_id, profile_id, kind, status, guests, created_by) values (v_q, v_sp, 'hotel', 'requested', 1, v_other);
  insert into hospitality_booking (quota_id, profile_id, kind, status, guests, created_by) values (v_q, v_sp, 'hotel', 'waitlisted', 1, v_other);
  insert into hospitality_booking (quota_id, profile_id, kind, status, guests, created_by) values (v_q, v_sp, 'hotel', 'confirmed', 1, v_other);
  insert into hospitality_booking (quota_id, profile_id, kind, status, guests, created_by) values (v_q, v_sp, 'hotel', 'cancelled', 1, v_other);

  -- Shuttle: angefragt zählt, bestätigt nicht
  insert into shuttle_booking (profile_id, passenger_name, pickup_at, pickup_location, dropoff_location, status)
    values (v_sp, 'ZZ Fahrgast', now() + interval '30 days', 'Hbf', 'Messe', 'requested');
  insert into shuttle_booking (profile_id, passenger_name, pickup_at, pickup_location, dropoff_location, status)
    values (v_sp, 'ZZ Fahrgast 2', now() + interval '31 days', 'Hbf', 'Messe', 'confirmed');

  insert into t_res values ('02_testdaten', 'vorschlaege_offen=' || (select count(*) from session_submission where session_id = v_se and status = 'submitted')::text
    || ' slots_entwurf=' || (select count(*) from session where id = v_se and publish_status = 'draft')::text
    || ' standbuehne_pruefung=' || (select count(*) from session where partner_org_id = v_org and publish_status = 'review')::text
    || ' abrechnungen_offen=' || (select count(*) from expense_claim where profile_id = v_sp and status = 'submitted')::text
    || ' hotel_offen=' || (select count(*) from hospitality_booking where quota_id = v_q and status in ('requested', 'waitlisted'))::text
    || ' fahrten_offen=' || (select count(*) from shuttle_booking where profile_id = v_sp and status = 'requested')::text);

  -- === 3 · Stand je Rolle: Schlüsselmenge und Differenz zum Grundstand ==========================================
  foreach v_rolle in array array['admin', 'programme_team', 'area_lead_speaker', 'area_lead_production', 'keine'] loop
    delete from role_assignment where person_id = v_pid;
    if v_rolle <> 'keine' then
      insert into role_assignment (person_id, role, scope_type) values (v_pid, v_rolle, 'global');
    end if;
    execute 'set local role authenticated';
    v_z := freigabe_zaehler();
    execute 'reset role';
    select z into v_b from t_base where rolle = v_rolle;

    -- Steht die Hotel-Liste dieser Rolle offen? (Tor der Funktion selbst, nicht eine Annahme des Tests)
    begin
      perform hospitality_admin_overview();
      v_hotel_offen := true;
    exception when insufficient_privilege then
      v_hotel_offen := false;
    end;

    v_exp := case v_rolle
      when 'admin'                then '{"inhalte": 1, "slots": 2, "reisekosten": 1, "hotel": 2, "shuttle": 1}'::jsonb
      when 'programme_team'       then '{"inhalte": 1, "slots": 2, "shuttle": 1}'::jsonb || case when v_hotel_offen then '{"hotel": 2}'::jsonb else '{}'::jsonb end
      when 'area_lead_speaker'    then '{"inhalte": 1, "slots": 0, "reisekosten": 1, "shuttle": 1}'::jsonb || case when v_hotel_offen then '{"hotel": 2}'::jsonb else '{}'::jsonb end
      when 'area_lead_production' then '{"slots": 0}'::jsonb
      else '{}'::jsonb
    end;

    v_fehler := '';
    -- Schlüsselmenge: genau die erwarteten Arten, keine zusätzliche (auch keine mit 0)
    select coalesce(string_agg(k, ',' order by k), '') into v_keys from jsonb_object_keys(v_z) k;
    if v_keys <> (select coalesce(string_agg(k, ',' order by k), '') from jsonb_object_keys(v_exp) k) then
      v_fehler := v_fehler || ' SCHLUESSEL ' || v_keys || ' statt ' || (select coalesce(string_agg(k, ',' order by k), '') from jsonb_object_keys(v_exp) k) || ';';
    end if;
    -- Differenz zum Grundstand je erwarteter Art
    for v_k in select k from jsonb_object_keys(v_exp) k loop
      if coalesce((v_z ->> v_k)::integer, -1) - coalesce((v_b ->> v_k)::integer, 0) is distinct from (v_exp ->> v_k)::integer then
        v_fehler := v_fehler || ' ' || v_k || ' ' || coalesce(v_z ->> v_k, 'fehlt') || ' (Grundstand ' || coalesce(v_b ->> v_k, '-') || ') erwartet +' || (v_exp ->> v_k) || ';';
      end if;
    end loop;
    insert into t_res values ('03_' || v_rolle, case when v_fehler = '' then 'ok ' || v_z::text else 'FEHLER' || v_fehler || ' z=' || v_z::text end);
  end loop;

  -- === 4 · Zugriff =============================================================================================
  -- Ohne Anmeldung
  perform set_config('request.jwt.claims', '{}', true);
  begin
    perform freigabe_zaehler();
    insert into t_res values ('04_ohne_anmeldung', 'ALLOWED (BUG)');
  exception when others then
    insert into t_res values ('04_ohne_anmeldung', 'rejected ' || sqlstate);
  end;
  insert into t_res values ('05_execute_rechte', 'anon=' || has_function_privilege('anon', 'freigabe_zaehler()', 'execute')::text
                                                  || ' authenticated=' || has_function_privilege('authenticated', 'freigabe_zaehler()', 'execute')::text);
  insert into t_res values ('06_invoker', (select case when p.prosecdef then 'DEFINER (nicht beabsichtigt)' else 'invoker' end
                                              || ' stable=' || (p.provolatile = 's')::text from pg_proc p where p.proname = 'freigabe_zaehler'));
end $$;
select * from t_res order by step;
rollback;
