-- =============================================================================
-- Demo-Programm für Summit 27 (Freitag) — nur für Walkthroughs/Tests.
--   Idempotent: löscht zuerst alle Demo-Daten (Sessions mit Tag 'demo', Slots mit
--   source_ref 'demo', Demo-Personen mit source_first 'demo') und legt sie neu an.
--   Ausführen per Supabase-MCP `execute_sql` oder SQL-Editor (Owner-Kontext).
--   Vor dem Go-live: nur den Lösch-Block ausführen (alles bis „-- ANLEGEN").
--   Keine echten Personen: Namen sind Platzhalter, E-Mails auf example.invalid.
-- =============================================================================
set search_path = public, extensions;

-- === LÖSCHEN ================================================================
delete from session where tags @> '{demo}';
delete from slot where source_ref = 'demo';
delete from person where source_first = 'demo';

-- === ANLEGEN ================================================================
do $$
declare
  v_summit uuid; v_fri uuid;
  v_main uuid; v_lg uuid; v_ind uuid; v_startup uuid; v_impact uuid;
  v_p uuid[] := '{}';
  v_slot uuid; v_sess uuid;
  r record;
  i integer;
begin
  select id into v_summit from event where slug = 'summit-27';
  select id into v_fri from event_day where event_id = v_summit and day_date = '2027-04-16';
  select id into v_main    from stage where event_id = v_summit and slug = 'main';
  select id into v_lg      from stage where event_id = v_summit and slug = 'leadership-growth';
  select id into v_ind     from stage where event_id = v_summit and slug = 'industry';
  select id into v_startup from stage where event_id = v_summit and slug = 'startup';
  select id into v_impact  from stage where event_id = v_summit and slug = 'impact-tech';

  -- Demo-Speaker (6), jede mit primärer E-Mail (Invariante)
  for i in 1..6 loop
    insert into person (first_name, last_name, employer_name, tier, source_first)
      values ('Demo', 'Speaker ' || chr(64 + i), 'Beispiel GmbH ' || i, 'lead', 'demo')
      returning id into v_slot;
    insert into person_email (person_id, email, is_primary, verified)
      values (v_slot, ('demo.speaker.' || lower(chr(64 + i)) || '@example.invalid')::citext, true, false);
    v_p := array_append(v_p, v_slot);
  end loop;

  -- Rahmen: Einlass 12:00–13:00 auf allen Bühnen
  for r in select id from stage where event_id = v_summit loop
    insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status, source_ref, internal_title)
      values (r.id, v_fri, '2027-04-16 12:00+02', '2027-04-16 13:00+02', 'frame', 'final', 'demo', 'Einlass');
  end loop;

  -- Main: Opening (Fixblock, veröffentlicht)
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status, source_ref)
    values (v_main, v_fri, '2027-04-16 13:00+02', '2027-04-16 13:30+02', 'fixed_block', 'final', 'demo') returning id into v_slot;
  insert into session (event_id, slot_id, title_de, title_en, description_de, format, language, access_mode, publish_status, tags)
    values (v_summit, v_slot, 'DEMO Opening', 'DEMO Opening', 'Eröffnung des Summits.', 'opening', 'mixed', 'open', 'published', '{demo}');

  -- Main: Keynote (final, veröffentlicht, 1 Speaker)
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status, source_ref)
    values (v_main, v_fri, '2027-04-16 13:30+02', '2027-04-16 14:00+02', 'content', 'final', 'demo') returning id into v_slot;
  insert into session (event_id, slot_id, title_de, title_en, description_de, description_en, format, language, access_mode, publish_status, tags)
    values (v_summit, v_slot, 'DEMO Keynote: Führung 2030', 'DEMO Keynote: Leadership 2030', 'Wie sich Führung verändert.', 'How leadership changes.', 'keynote', 'en', 'open', 'published', '{demo}')
    returning id into v_sess;
  insert into session_speaker (session_id, person_id, role, confirmed) values (v_sess, v_p[1], 'speaker', true);

  -- Main: Panel (angefragt, Entwurf, 3 Speaker)
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status, source_ref)
    values (v_main, v_fri, '2027-04-16 14:15+02', '2027-04-16 15:00+02', 'content', 'requested', 'demo') returning id into v_slot;
  insert into session (event_id, slot_id, title_de, format, language, access_mode, publish_status, tags)
    values (v_summit, v_slot, 'DEMO Panel: Karriere ohne Plan?', 'panel', 'de', 'open', 'draft', '{demo}') returning id into v_sess;
  insert into session_speaker (session_id, person_id, role, sort_order) values
    (v_sess, v_p[2], 'moderator', 0), (v_sess, v_p[3], 'panelist', 1), (v_sess, v_p[4], 'panelist', 2);

  -- Leadership & Growth: 25-Minuten-Keynote (bestätigt, Titel offen)
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status, source_ref)
    values (v_lg, v_fri, '2027-04-16 13:30+02', '2027-04-16 13:55+02', 'content', 'confirmed_title_open', 'demo') returning id into v_slot;
  insert into session (event_id, slot_id, title_de, format, language, access_mode, publish_status, tags)
    values (v_summit, v_slot, 'DEMO Titel in Klärung', 'keynote', 'de', 'open', 'draft', '{demo}') returning id into v_sess;
  insert into session_speaker (session_id, person_id) values (v_sess, v_p[5]);

  -- Industry: Keynote DE (final, veröffentlicht)
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status, source_ref)
    values (v_ind, v_fri, '2027-04-16 14:00+02', '2027-04-16 14:30+02', 'content', 'final', 'demo') returning id into v_slot;
  insert into session (event_id, slot_id, title_de, title_en, description_de, format, language, access_mode, publish_status, tags)
    values (v_summit, v_slot, 'DEMO Industrie im Wandel', 'DEMO Industry in transition', 'Ein Blick in die Werkhalle der Zukunft.', 'keynote', 'de', 'open', 'published', '{demo}')
    returning id into v_sess;
  insert into session_speaker (session_id, person_id, confirmed) values (v_sess, v_p[6], true);

  -- Startup: Platzhalter ohne Session
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status, source_ref, internal_title)
    values (v_startup, v_fri, '2027-04-16 13:30+02', '2027-04-16 14:00+02', 'placeholder', 'open', 'demo', 'Pitch Battle (Slot offen)');

  -- Startup: Bewerbungs-Format (Company Tour) mit u35-Regel, veröffentlicht
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status, source_ref)
    values (v_startup, v_fri, '2027-04-16 15:00+02', '2027-04-16 16:00+02', 'content', 'final', 'demo') returning id into v_slot;
  insert into session (event_id, slot_id, title_de, title_en, description_de, description_en, format, language, access_mode,
                       eligibility_rule, capacity, ticket_required, application_deadline, publish_status, tags)
    values (v_summit, v_slot, 'DEMO Company Tour: Beispiel GmbH', 'DEMO Company tour: Beispiel GmbH',
            'Exklusiver Einblick für 20 Talente unter 35.', 'Exclusive insight for 20 talents under 35.',
            'company_tour', 'de', 'application', '{"u35": true}', 20, true, '2027-03-01 23:59+01', 'published', '{demo}')
    returning id into v_sess;
  insert into session_speaker (session_id, person_id, role) values (v_sess, v_p[3], 'host');
  insert into session_question (session_id, question_id, required, sort_order, approved_at)
    select v_sess, q.id, true, 0, now() from question_catalog q where q.key = 'motivation';

  -- Impact & Tech: Anmelde-Format (Reception) mit Kapazität 2 (Warteliste testen), ohne Ticketpflicht
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status, source_ref)
    values (v_impact, v_fri, '2027-04-16 18:30+02', '2027-04-16 19:30+02', 'content', 'final', 'demo') returning id into v_slot;
  insert into session (event_id, slot_id, title_de, title_en, description_de, format, language, access_mode, capacity, ticket_required, publish_status, tags)
    values (v_summit, v_slot, 'DEMO Get-together', 'DEMO Get-together', 'Lockeres Kennenlernen, Plätze begrenzt.', 'reception', 'mixed', 'registration', 2, false, 'published', '{demo}');

  -- Backlog: Session ohne Slot
  insert into session (event_id, title_de, title_en, format, language, access_mode, publish_status, tags)
    values (v_summit, 'DEMO Backlog-Talk', 'DEMO backlog talk', 'talk', 'en', 'open', 'draft', '{demo}') returning id into v_sess;
  insert into session_speaker (session_id, person_id) values (v_sess, v_p[2]);
end $$;

select 'demo sessions' as k, count(*)::text as v from session where tags @> '{demo}'
union all select 'demo slots', count(*)::text from slot where source_ref = 'demo'
union all select 'demo persons', count(*)::text from person where source_first = 'demo';
