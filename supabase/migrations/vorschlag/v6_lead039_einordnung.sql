-- 00NN · LEAD-039 Schnitt 1: Einordnung der Speaker-Pipeline und Bühnen in Frage
--
-- Vorschlag der Build-Session Speaker-Domäne. Nummer, Anwenden, Umbenennen und
-- der Eintrag ins Entscheidungslog gehören der Architektur-Session.
--
-- Anlass: LEAD-039 (Teil 2 von LEAD-028, Konrad 24.09.) — die CRM-Felder aus
-- Konrads Arbeitstabelle „FLS27_Speaker_Themen_Bühnen_Master“ (nur der Aufbau,
-- keine Zeile). Datenmodell nach `docs/vorschlag-lead039-pipeline-felder.md`
-- (#194), freigegeben von Konrad und der Architektur-Session (K-36, 25.09.).
-- Schnitt 1 ist die Einordnung am Profil und die Bühnen in Frage; der Verlauf
-- (`speaker_activity`, LEAD-025/027) folgt als Schnitt 2.
--
-- Neu:
--   * Vokabulare `speaker_category` (11 Sektoren), `topic_cluster` (7),
--     `speaker_priority` (A/B/C) und `outreach_channel` (7), mit `vocab_binding`.
--   * `speaker_profile`: `category`, `topic_cluster`, `topic_role`, `priority`,
--     `recommended_format` (bestehendes Vokabular `session_format`),
--     `contact_via`, `outreach_channel` — alle optional.
--   * `speaker_profile_check` prüft die fünf Vokabularfelder **nur, wenn sie sich
--     ändern**: `is_vocab_key` kennt nur aktive Begriffe, und ein stillgelegter
--     Begriff sperrte sonst jedes spätere Speichern des Profils. Dazu die Längen
--     (`topic_role` 300, `contact_via` 200) und kein `@` in `contact_via` — dort
--     steht der Weg, keine Kontaktdaten Dritter.
--   * Tabelle `speaker_stage_candidate` (Bühnen in Frage, konkrete Bühnen der
--     Edition, K-36 F3). Lesen wie das Profil (`can_manage_speaker`), schreiben
--     nur über `set_speaker_stage_candidates(profile, stage_ids)`.
--   * `update_speaker` nimmt die sieben Schlüssel; `manager_speakers` (drop +
--     create, der Rückgabetyp wächst hinten — alle alten Spalten bleiben, auch
--     `internal_notes`) und `speaker_detail` geben sie aus, dazu
--     `stage_candidates`.
--   * `anonymize_person` leert die Felder und löscht die Bühnen in Frage.
--
-- Sichtbarkeit wie `internal_notes` (K-36 F1): wer `can_manage_speaker` hat,
-- liest und schreibt — Team, Speaker-Leads für ihre Speaker, Stage Leads für
-- Speaker mit Session auf ihrer Bühne. Speaker, Assistenz und Partner lesen die
-- Tabelle nicht (einzige Policy `sp_manage_sel`), und keine ihrer RPCs gibt das
-- Profil als Ganzes aus.
--
-- Funktionen aus `supabase/snapshot/functions/`: `speaker_profile_check`,
-- `update_speaker`, `manager_speakers`, `speaker_detail`, `anonymize_person`;
-- neu: `set_speaker_stage_candidates`. Fehlerschlüssel: 22023 `invalid_category`,
-- `invalid_topic_cluster`, `invalid_priority`, `invalid_format`,
-- `invalid_outreach_channel`, `text_too_long`, `contact_details_not_allowed`;
-- P0001 `stage_not_in_edition`; P0002 `speaker_not_found`; 42501 `not allowed`.

set search_path = public, extensions;

-- ---- 1 · Vokabulare
insert into vocab_term (vocabulary, key, label_de, label_en, sort_order) values
  -- Die nummerierten Sektoren der Arbeitstabelle.
  ('speaker_category', 'politics',      'Politik',         'Politics',        1),
  ('speaker_category', 'defence_space', 'Defence & Space', 'Defence & Space', 2),
  ('speaker_category', 'business',      'Wirtschaft',      'Business',        3),
  ('speaker_category', 'technology',    'Technology',      'Technology',      4),
  ('speaker_category', 'society',       'Gesellschaft',    'Society',         5),
  ('speaker_category', 'journalism',    'Journalismus',    'Journalism',      6),
  ('speaker_category', 'startup',       'Start-Up',        'Start-up',        7),
  ('speaker_category', 'influencer',    'Influencer',      'Influencer',      8),
  ('speaker_category', 'sport',         'Sport',           'Sports',          9),
  ('speaker_category', 'academia',      'Academia',        'Academia',       10),
  ('speaker_category', 'vc',            'VC',              'VC',             11),
  -- Die sieben Cluster, wie das Team sie in der Tabelle benennt.
  ('topic_cluster', 'politics_society',              'Politics & Society',                'Politics & Society',                1),
  ('topic_cluster', 'tech_science_deeptech',         'Technology, Science & Deep Tech',   'Technology, Science & Deep Tech',   2),
  ('topic_cluster', 'defence_space_resilience',      'Defence, Space & Resilience',       'Defence, Space & Resilience',       3),
  ('topic_cluster', 'climate_energy_infrastructure', 'Climate, Energy & Infrastructure',  'Climate, Energy & Infrastructure',  4),
  ('topic_cluster', 'business_capital_industry',     'Business, Capital & Industry',      'Business, Capital & Industry',      5),
  ('topic_cluster', 'work_leadership_career',        'Work, Leadership & Career',         'Work, Leadership & Career',         6),
  ('topic_cluster', 'sport_health_lifestyle',        'Sport, Health & Lifestyle',         'Sport, Health & Lifestyle',         7),
  ('speaker_priority', 'a', 'A-Tier', 'A tier', 1),
  ('speaker_priority', 'b', 'B-Tier', 'B tier', 2),
  ('speaker_priority', 'c', 'C-Tier', 'C tier', 3),
  ('outreach_channel', 'email',    'E-Mail',                'Email',              1),
  ('outreach_channel', 'linkedin', 'LinkedIn',              'LinkedIn',           2),
  ('outreach_channel', 'phone',    'Telefon',               'Phone',              3),
  ('outreach_channel', 'personal', 'Persönlich / Netzwerk', 'In person / network', 4),
  ('outreach_channel', 'agency',   'Agentur / Management',  'Agency / management', 5),
  ('outreach_channel', 'partner',  'Über Partner',          'Via a partner',      6),
  ('outreach_channel', 'other',    'Sonstiges',             'Other',              7)
on conflict (vocabulary, key) do nothing;

-- ---- 2 · Einordnung am Profil
alter table speaker_profile
  add column if not exists category text,
  add column if not exists topic_cluster text,
  add column if not exists topic_role text,
  add column if not exists priority text,
  add column if not exists recommended_format text,
  add column if not exists contact_via text,
  add column if not exists outreach_channel text;

comment on column speaker_profile.category is
  'Vokabular speaker_category (LEAD-039): Sektor der Person, einer je Speaker. Intern wie internal_notes (can_manage_speaker).';
comment on column speaker_profile.topic_cluster is
  'Vokabular topic_cluster (LEAD-039): Themencluster, in dem die Person spricht. Nicht dasselbe wie die Programmthemen (session_topic).';
comment on column speaker_profile.topic_role is
  'Thema oder programmatische Rolle, Freitext bis 300 Zeichen (LEAD-039).';
comment on column speaker_profile.priority is
  'Vokabular speaker_priority (LEAD-039): A/B/C wie 2026. Nicht person.tier — das ist der Login-Stand.';
comment on column speaker_profile.recommended_format is
  'Vokabular session_format (LEAD-039): unsere Idee während der Akquise. speaker_type bleibt die Rolle auf der Bühne nach der Zusage; beide dürfen abweichen.';
comment on column speaker_profile.contact_via is
  'Wer den Draht hat oder über wen der Kontakt läuft, bis 200 Zeichen, ohne @ (LEAD-039). Keine Kontaktdaten Dritter — die gehören nach speaker_contact, mit Einverständnis.';
comment on column speaker_profile.outreach_channel is
  'Vokabular outreach_channel (LEAD-039): der Weg, über den wir die Person ansprechen.';

insert into vocab_binding (vocabulary, table_name, column_name, is_array, vocabulary_column, note) values
  ('speaker_category', 'speaker_profile', 'category',           false, null, 'speaker_profile.category (LEAD-039)'),
  ('topic_cluster',    'speaker_profile', 'topic_cluster',      false, null, 'speaker_profile.topic_cluster (LEAD-039)'),
  ('speaker_priority', 'speaker_profile', 'priority',           false, null, 'speaker_profile.priority (LEAD-039)'),
  ('session_format',   'speaker_profile', 'recommended_format', false, null, 'speaker_profile.recommended_format (LEAD-039)'),
  ('outreach_channel', 'speaker_profile', 'outreach_channel',   false, null, 'speaker_profile.outreach_channel (LEAD-039)')
on conflict (vocabulary, table_name, column_name) do nothing;

-- ---- 3 · Prüfung im Trigger
create or replace function speaker_profile_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not exists (select 1 from event where id = new.edition_id and is_edition) then
    raise exception 'edition_required' using errcode = '23514';
  end if;
  if not is_vocab_key('speaker_type', new.speaker_type) then
    raise exception 'invalid speaker_type' using errcode = '23514', detail = new.speaker_type;
  end if;
  if not is_vocab_key('speaker_pipeline', new.pipeline_status) then
    raise exception 'invalid pipeline_status' using errcode = '23514', detail = new.pipeline_status;
  end if;
  if not is_vocab_key('hospitality_status', new.hospitality_status) then
    raise exception 'invalid hospitality_status' using errcode = '23514', detail = new.hospitality_status;
  end if;
  if not is_vocab_key('hotel_tier', new.hotel_tier) then
    raise exception 'invalid hotel_tier' using errcode = '23514', detail = new.hotel_tier;
  end if;
  if not is_vocab_key('ticket_type', new.pass_type) then
    raise exception 'invalid pass_type' using errcode = '23514', detail = new.pass_type;
  end if;
  if new.assistant_person_id is not null and new.assistant_person_id = new.person_id then
    raise exception 'assistant_is_speaker' using errcode = '23514';
  end if;
  -- LEAD-039: Einordnung. Die Vokabularfelder werden nur geprüft, wenn sie sich
  -- ändern — `is_vocab_key` kennt nur aktive Begriffe, und ein später
  -- stillgelegter Begriff soll das Profil nicht für jede andere Änderung sperren.
  if new.category is not null and (tg_op = 'INSERT' or new.category is distinct from old.category)
     and not is_vocab_key('speaker_category', new.category) then
    raise exception 'invalid_category' using errcode = '22023', detail = new.category;
  end if;
  if new.topic_cluster is not null and (tg_op = 'INSERT' or new.topic_cluster is distinct from old.topic_cluster)
     and not is_vocab_key('topic_cluster', new.topic_cluster) then
    raise exception 'invalid_topic_cluster' using errcode = '22023', detail = new.topic_cluster;
  end if;
  if new.priority is not null and (tg_op = 'INSERT' or new.priority is distinct from old.priority)
     and not is_vocab_key('speaker_priority', new.priority) then
    raise exception 'invalid_priority' using errcode = '22023', detail = new.priority;
  end if;
  if new.recommended_format is not null and (tg_op = 'INSERT' or new.recommended_format is distinct from old.recommended_format)
     and not is_vocab_key('session_format', new.recommended_format) then
    raise exception 'invalid_format' using errcode = '22023', detail = new.recommended_format;
  end if;
  if new.outreach_channel is not null and (tg_op = 'INSERT' or new.outreach_channel is distinct from old.outreach_channel)
     and not is_vocab_key('outreach_channel', new.outreach_channel) then
    raise exception 'invalid_outreach_channel' using errcode = '22023', detail = new.outreach_channel;
  end if;
  if coalesce(length(new.topic_role), 0) > 300 or coalesce(length(new.contact_via), 0) > 200 then
    raise exception 'text_too_long' using errcode = '22023';
  end if;
  -- Nur der Weg, keine Kontaktdaten: Adressen Dritter gehören nach
  -- `speaker_contact`, und nur mit Einverständnis (0148).
  if strpos(coalesce(new.contact_via, ''), '@') > 0 then
    raise exception 'contact_details_not_allowed' using errcode = '22023';
  end if;
  return new;
end $$;

-- ---- 4 · Bühnen in Frage
create table if not exists speaker_stage_candidate (
  profile_id uuid not null references speaker_profile(id) on delete cascade,
  stage_id   uuid not null references stage(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references person(id) on delete set null,
  primary key (profile_id, stage_id)
);
comment on table speaker_stage_candidate is
  'Bühnen, die für einen Speaker in Frage kommen (LEAD-039) — konkrete Bühnen der Edition. Intern wie das Profil: lesen mit can_manage_speaker, schreiben nur über set_speaker_stage_candidates.';
create index if not exists speaker_stage_candidate_stage_idx on speaker_stage_candidate (stage_id);

alter table speaker_stage_candidate enable row level security;
drop policy if exists ssc_manage_sel on speaker_stage_candidate;
create policy ssc_manage_sel on speaker_stage_candidate for select to authenticated
  using (can_manage_speaker(profile_id));
revoke all on speaker_stage_candidate from anon;
revoke insert, update, delete on speaker_stage_candidate from authenticated;   -- Schreiben nur per RPC
grant select on speaker_stage_candidate to authenticated;

create or replace function set_speaker_stage_candidates(p_profile_id uuid, p_stage_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_sp speaker_profile%rowtype; v_ids uuid[]; v_before jsonb; v_fremd boolean;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce(can_manage_speaker(p_profile_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_ids
    from unnest(coalesce(p_stage_ids, '{}')) x where x is not null;
  -- Jede Bühne gehört zu einer Veranstaltung dieser Edition — der Edition selbst
  -- oder einem Teilevent wie dem Summit. Alle, nicht mindestens eine.
  select exists (
    select 1 from unnest(v_ids) x
     where not exists (select 1 from stage st join event ev on ev.id = st.event_id
                        where st.id = x and (ev.id = v_sp.edition_id or ev.edition_id = v_sp.edition_id))
  ) into v_fremd;
  if v_fremd then raise exception 'stage_not_in_edition' using errcode = 'P0001'; end if;

  select coalesce(jsonb_agg(c.stage_id order by c.stage_id), '[]'::jsonb) into v_before
    from speaker_stage_candidate c where c.profile_id = p_profile_id;
  delete from speaker_stage_candidate c where c.profile_id = p_profile_id and not (c.stage_id = any (v_ids));
  insert into speaker_stage_candidate (profile_id, stage_id, created_by)
    select p_profile_id, x, v_me from unnest(v_ids) x
  on conflict (profile_id, stage_id) do nothing;

  perform log_audit('speaker.stage_candidates', 'speaker_profile', p_profile_id::text,
                    jsonb_build_object('stage_ids', v_before), jsonb_build_object('stage_ids', to_jsonb(v_ids)));
  return coalesce(array_length(v_ids, 1), 0);
end $$;

-- ---- 5 · Schreiben: update_speaker nimmt die sieben Schlüssel
create or replace function update_speaker(p_profile_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_team boolean; v_before jsonb;
begin
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not can_manage_speaker(p_profile_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_team := is_speaker_team(v_sp.edition_id);
  if not v_team and (p_data ?| array['lounge_access', 'pass_type', 'hotel_tier', 'hospitality_status',
                                     'org_id', 'travel_costs_approved', 'owner_person_id']) then
    raise exception 'team_only_fields' using errcode = '42501';
  end if;
  v_before := to_jsonb(v_sp) - 'internal_notes';

  update speaker_profile set
    speaker_type         = coalesce(nullif(p_data->>'speaker_type', ''), speaker_type),
    pipeline_status      = coalesce(nullif(p_data->>'pipeline_status', ''), pipeline_status),
    owner_person_id      = case when p_data ? 'owner_person_id' then nullif(p_data->>'owner_person_id', '')::uuid else owner_person_id end,
    job_title            = case when p_data ? 'job_title'         then nullif(btrim(p_data->>'job_title'), '')         else job_title end,
    organization_name    = case when p_data ? 'organization_name' then nullif(btrim(p_data->>'organization_name'), '') else organization_name end,
    bio_short_en         = case when p_data ? 'bio_short_en'      then nullif(btrim(p_data->>'bio_short_en'), '')      else bio_short_en end,
    bio_short_de         = case when p_data ? 'bio_short_de'      then nullif(btrim(p_data->>'bio_short_de'), '')      else bio_short_de end,
    bio_long_en          = case when p_data ? 'bio_long_en'       then nullif(btrim(p_data->>'bio_long_en'), '')       else bio_long_en end,
    bio_long_de          = case when p_data ? 'bio_long_de'       then nullif(btrim(p_data->>'bio_long_de'), '')       else bio_long_de end,
    socials              = case when p_data ? 'socials'    and jsonb_typeof(p_data->'socials') = 'object'    then p_data->'socials'    else socials end,
    tech_rider           = case when p_data ? 'tech_rider' and jsonb_typeof(p_data->'tech_rider') = 'object' then p_data->'tech_rider' else tech_rider end,
    internal_notes       = case when p_data ? 'internal_notes'    then nullif(btrim(p_data->>'internal_notes'), '')    else internal_notes end,
    -- LEAD-039: Einordnung, für alle mit `can_manage_speaker` (K-36 F1). Geprüft
    -- im Trigger `speaker_profile_check`.
    category             = case when p_data ? 'category'           then nullif(btrim(p_data->>'category'), '')           else category end,
    topic_cluster        = case when p_data ? 'topic_cluster'      then nullif(btrim(p_data->>'topic_cluster'), '')      else topic_cluster end,
    topic_role           = case when p_data ? 'topic_role'         then nullif(btrim(p_data->>'topic_role'), '')         else topic_role end,
    priority             = case when p_data ? 'priority'           then nullif(btrim(p_data->>'priority'), '')           else priority end,
    recommended_format   = case when p_data ? 'recommended_format' then nullif(btrim(p_data->>'recommended_format'), '') else recommended_format end,
    contact_via          = case when p_data ? 'contact_via'        then nullif(btrim(p_data->>'contact_via'), '')        else contact_via end,
    outreach_channel     = case when p_data ? 'outreach_channel'   then nullif(btrim(p_data->>'outreach_channel'), '')   else outreach_channel end,
    reception_eligible   = coalesce((p_data->>'reception_eligible')::boolean, reception_eligible),
    travel_costs_covered = coalesce((p_data->>'travel_costs_covered')::boolean, travel_costs_covered),
    lounge_access        = coalesce((p_data->>'lounge_access')::boolean, lounge_access),
    pass_type            = coalesce(nullif(p_data->>'pass_type', ''), pass_type),
    hotel_tier           = coalesce(nullif(p_data->>'hotel_tier', ''), hotel_tier),
    hospitality_status   = coalesce(nullif(p_data->>'hospitality_status', ''), hospitality_status),
    org_id               = case when p_data ? 'org_id' then nullif(p_data->>'org_id', '')::uuid else org_id end
  where id = p_profile_id;

  perform log_audit('speaker.update', 'speaker_profile', p_profile_id::text, v_before, p_data);
  return p_profile_id;
end $$;

-- ---- 6 · Lesen: manager_speakers (Rückgabetyp wächst) und speaker_detail
drop function if exists manager_speakers(uuid);
create function manager_speakers(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, person_id uuid, first_name text, last_name text, title text, email text, job_title text, organization_name text, speaker_type text, pipeline_status text, owner_person_id uuid, owner_name text, reception_eligible boolean, travel_costs_covered boolean, travel_costs_approved boolean, hospitality_status text, hotel_tier text, pass_type text, lounge_access boolean, invited_at timestamp with time zone, confirmed_at timestamp with time zone, declined_at timestamp with time zone, decline_reason text, assistant_name text, sessions jsonb, next_open jsonb, updated_at timestamp with time zone, internal_notes text, category text, topic_cluster text, topic_role text, priority text, recommended_format text, contact_via text, outreach_channel text, stage_candidates jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not (has_role('speaker_manager') or has_role('admin') or has_role('area_lead_speaker') or has_role('programme_team')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select sp.id, sp.person_id, p.first_name, p.last_name, p.title,
           (select pe.email::text from person_email pe where pe.person_id = p.id and pe.is_primary),
           sp.job_title, sp.organization_name, sp.speaker_type, sp.pipeline_status,
           sp.owner_person_id, (select btrim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, '')) from person o where o.id = sp.owner_person_id),
           sp.reception_eligible, sp.travel_costs_covered, (sp.travel_costs_approved_at is not null),
           sp.hospitality_status, sp.hotel_tier, sp.pass_type, sp.lounge_access, sp.invited_at,
           sp.confirmed_at, sp.declined_at, sp.decline_reason,
           (select string_agg(x.name, ', ' order by x.name) from (
              select nullif(btrim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), '') as name
                from person a where a.id = sp.assistant_person_id
              union
              select nullif(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '')
                from speaker_contact c where c.profile_id = sp.id and c.has_access
            ) x where x.name is not null),
           coalesce((select jsonb_agg(jsonb_build_object('session_id', se.id, 'title_de', se.title_de, 'title_en', se.title_en,
                                                          'publish_status', se.publish_status, 'start_at', sl.start_at, 'stage_name', st.name)
                                       order by sl.start_at nulls last)
                     from session_speaker ss join session se on se.id = ss.session_id join event e on e.id = se.event_id
                     left join slot sl on sl.id = se.slot_id left join stage st on st.id = sl.stage_id
                     where ss.person_id = sp.person_id and (e.edition_id = sp.edition_id or e.id = sp.edition_id)), '[]'::jsonb),
           speaker_next_steps(sp.id)->'open',
           sp.updated_at, sp.internal_notes,
           -- LEAD-039: Einordnung und Bühnen in Frage.
           sp.category, sp.topic_cluster, sp.topic_role, sp.priority, sp.recommended_format,
           sp.contact_via, sp.outreach_channel,
           coalesce((select jsonb_agg(jsonb_build_object('stage_id', st.id, 'name', st.name)
                                      order by st.sort_order, st.name)
                       from speaker_stage_candidate c join stage st on st.id = c.stage_id
                      where c.profile_id = sp.id), '[]'::jsonb)
    from speaker_profile sp
    join person p on p.id = sp.person_id
    left join vocab_term v on v.vocabulary = 'speaker_pipeline' and v.key = sp.pipeline_status
    where (p_edition_id is null or sp.edition_id = p_edition_id)
      and p.deleted_at is null
      and can_manage_speaker(sp.id)
    order by v.sort_order nulls last, p.last_name nulls last, p.first_name nulls last;
end $$;

create or replace function speaker_detail(p_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_p person%rowtype; v_team boolean;
begin
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not can_manage_speaker(p_profile_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_p from person where id = v_sp.person_id;
  v_team := is_speaker_team(v_sp.edition_id);

  return jsonb_build_object(
    -- Der Kontakt ohne Portalzugang (0127) ist genau fuer das Team da: es
    -- soll wissen, wen es statt der Speakerin anschreibt.
    'contact', case when v_sp.contact_first_name is null and v_sp.contact_last_name is null
                     and v_sp.contact_email is null and v_sp.contact_phone is null
                    then null
                    else jsonb_build_object(
                      'first_name', v_sp.contact_first_name, 'last_name', v_sp.contact_last_name,
                      'email', v_sp.contact_email, 'phone', v_sp.contact_phone,
                      'kind', v_sp.contact_kind, 'consent_at', v_sp.contact_consent_at) end,
    'id', v_sp.id,
    'edition_id', v_sp.edition_id,
    'person', jsonb_build_object(
      'id', v_p.id, 'first_name', v_p.first_name, 'last_name', v_p.last_name, 'title', v_p.title,
      'email', (select pe.email::text from person_email pe where pe.person_id = v_p.id and pe.is_primary),
      'preferred_language', v_p.preferred_language,
      'salutation_de', v_p.salutation_de, 'salutation_en', v_p.salutation_en,
      'has_account', v_p.auth_user_id is not null),
    'speaker_type', v_sp.speaker_type,
    'pipeline_status', v_sp.pipeline_status,
    'confirmed_at', v_sp.confirmed_at,
    'declined_at', v_sp.declined_at,
    'decline_reason', v_sp.decline_reason,
    'invited_at', v_sp.invited_at,
    'owner_person_id', v_sp.owner_person_id,
    'owner_name', (select nullif(btrim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, '')), '')
                     from person o where o.id = v_sp.owner_person_id),
    'assistant_person_id', v_sp.assistant_person_id,
    'assistant_name', (select nullif(btrim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), '')
                         from person a where a.id = v_sp.assistant_person_id),
    'job_title', v_sp.job_title,
    'organization_name', v_sp.organization_name,
    'org_id', v_sp.org_id,
    'org_name', (select coalesce(og.communication_name, og.legal_name) from organization og where og.id = v_sp.org_id),
    'bio_short_de', v_sp.bio_short_de, 'bio_short_en', v_sp.bio_short_en,
    'bio_long_de', v_sp.bio_long_de, 'bio_long_en', v_sp.bio_long_en,
    'socials', v_sp.socials,
    'tech_rider', v_sp.tech_rider,
    'photo_asset_id', v_sp.photo_asset_id,
    'reception_eligible', v_sp.reception_eligible,
    'lounge_access', v_sp.lounge_access,
    'pass_type', v_sp.pass_type,
    'hotel_tier', v_sp.hotel_tier,
    'hospitality_status', v_sp.hospitality_status,
    'travel_costs_covered', v_sp.travel_costs_covered,
    'expense_mode', v_sp.expense_mode,
    'expense_lump_sum_cents', v_sp.expense_lump_sum_cents,
    'travel_costs_approved_at', v_sp.travel_costs_approved_at,
    'travel_costs_approved_by', (select nullif(btrim(coalesce(b.first_name, '') || ' ' || coalesce(b.last_name, '')), '')
                                   from person b where b.id = v_sp.travel_costs_approved_by),
    'lead_contact_id', v_sp.lead_contact_id,
    'buddy_contact_id', v_sp.buddy_contact_id,
    'contacts', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'type', c.type, 'display_name', c.display_name)
                                           order by c.type), '[]'::jsonb)
                   from edition_contact c
                  where c.id in (v_sp.lead_contact_id, v_sp.buddy_contact_id)),
    'travel', (select to_jsonb(tr) - 'updated_by' from speaker_travel tr where tr.profile_id = v_sp.id),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object(
                                   'session_id', se.id, 'title_de', se.title_de, 'title_en', se.title_en,
                                   'publish_status', se.publish_status, 'start_at', sl.start_at, 'stage_name', st.name)
                                 order by sl.start_at nulls last)
                          from session_speaker ss
                          join session se on se.id = ss.session_id
                          join event e on e.id = se.event_id
                          left join slot sl on sl.id = se.slot_id
                          left join stage st on st.id = sl.stage_id
                          where ss.person_id = v_sp.person_id
                            and (e.edition_id = v_sp.edition_id or e.id = v_sp.edition_id)), '[]'::jsonb),
    'speaker_contacts', (select coalesce(jsonb_agg(jsonb_build_object(
                                   'id', c.id, 'kind', c.kind, 'first_name', c.first_name,
                                   'last_name', c.last_name, 'email', c.email, 'phone', c.phone,
                                   'has_access', c.has_access, 'consent_at', c.consent_at)
                                 order by c.kind, c.created_at), '[]'::jsonb)
                           from speaker_contact c where c.profile_id = v_sp.id),
    'internal_notes_visible', v_team,
    'created_at', v_sp.created_at,
    'updated_at', v_sp.updated_at
  )
  -- LEAD-039: als zweites Objekt — das erste hat 44 Paare, und
  -- `jsonb_build_object` nimmt höchstens 100 Argumente.
  || jsonb_build_object(
    'category', v_sp.category,
    'topic_cluster', v_sp.topic_cluster,
    'topic_role', v_sp.topic_role,
    'priority', v_sp.priority,
    'recommended_format', v_sp.recommended_format,
    'contact_via', v_sp.contact_via,
    'outreach_channel', v_sp.outreach_channel,
    'stage_candidates', coalesce((select jsonb_agg(jsonb_build_object('stage_id', st.id, 'name', st.name)
                                                   order by st.sort_order, st.name)
                                    from speaker_stage_candidate c join stage st on st.id = c.stage_id
                                   where c.profile_id = v_sp.id), '[]'::jsonb))
  || case when v_team then jsonb_build_object('internal_notes', v_sp.internal_notes) else '{}'::jsonb end;
end $$;

-- ---- 7 · Profil löschen
create or replace function anonymize_person(p_person_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_hash text; v_profile uuid[];
begin
  if p_person_id is null then raise exception 'person_not_found' using errcode = 'P0002'; end if;
  perform log_audit('profile.delete', 'person', p_person_id::text, null, null);

  select array_agg(sp.id) into v_profile from speaker_profile sp where sp.person_id = p_person_id;
  v_profile := coalesce(v_profile, '{}');

  -- 1 · Sperrliste. Der Hash bleibt, die Adresse geht.
  insert into suppression (email_hash, reason)
    select email_hash(email::text), 'profile_deleted' from person_email where person_id = p_person_id
  on conflict (email_hash) do nothing;
  select email_hash(pe.email::text) into v_hash
    from person_email pe where pe.person_id = p_person_id and pe.is_primary;

  -- 2 · Dateien zum Wegräumen anmelden, **bevor** die Zeilen fallen: danach
  --     wüsste niemand mehr, welche Pfade gemeint waren.
  insert into storage_purge_queue (bucket, path)
    select 'speaker-assets', sa.storage_path from speaker_asset sa where sa.profile_id = any (v_profile)
  on conflict (bucket, path) do nothing;
  -- Porträt aus dem Teilnehmer-Profil (TAL-012).
  insert into storage_purge_queue (bucket, path)
    select 'person-photos', p.photo_path from person p
     where p.id = p_person_id and p.photo_path is not null
  on conflict (bucket, path) do nothing;
  -- Lebenslauf aus dem Teilnehmer-Profil (TAL-013, B3).
  insert into storage_purge_queue (bucket, path)
    select 'person-cv', p.cv_path from person p
     where p.id = p_person_id and p.cv_path is not null
  on conflict (bucket, path) do nothing;

  -- 3 · Zeilen, die ohne die Person keinen Sinn mehr haben.
  delete from person_interest            where person_id = p_person_id;
  delete from person_acquisition_channel where person_id = p_person_id;
  delete from person_language            where person_id = p_person_id;
  delete from role_assignment            where person_id = p_person_id;
  -- Ansprechperson einer Organisation kann nur sein, wen es gibt.
  delete from org_membership             where person_id = p_person_id;
  delete from speaker_asset  where profile_id = any (v_profile);
  -- Anreise ist reine Logistik eines vergangenen Termins: Flugnummer, Ankunft,
  -- Notiz. Nichts davon trägt eine Zahl, die später jemand braucht.
  delete from speaker_travel where profile_id = any (v_profile);

  -- 4 · Die Person selbst. Grobe Merkmale bleiben für die Statistik
  --     (career_level, study_field, country, tier, occupation_status) — sie
  --     beschreiben eine Gruppe, keinen Menschen. Freitext, Kontaktdaten und
  --     alles nach Art. 9 DSGVO (Ernährung, Geschlecht) fällt weg.
  update person set
    first_name = null, last_name = null, birthdate = null, phone = null, phone_e164 = null,
    linkedin_url = null, linkedin_normalized = null,
    employer_name = null, university = null, title = null, city = null,
    nationality = null, invite_code = null, auth_user_id = null,
    gender = null, diet = null, diet_note = null, photo_path = null,
    job_title = null, study_program_label = null, cv_path = null,
    salutation_de = null, salutation_en = null, self_assessment = null,
    deleted_at = now()
  where id = p_person_id;

  delete from person_email where person_id = p_person_id and not is_primary;
  update person_email
     set email = ('deleted+' || p_person_id::text || '@anonym.invalid')::citext, verified = false
   where person_id = p_person_id and is_primary;

  -- 5 · Mail-Protokoll: die Zeile bleibt als Zahl (wie viele Einladungen gingen
  --     raus), die Adresse wird zum Hash und die eingesetzten Angaben — dort
  --     steht der Name im Klartext — verschwinden.
  update mail_log
     set to_email = ('deleted:' || coalesce(v_hash, p_person_id::text))::citext,
         meta = coalesce(meta, '{}'::jsonb) - 'vars'
   where person_id = p_person_id;

  -- 6 · Freitexte und Fremdschlüssel in allen übrigen Tabellen mit `person_id`.
  --     Was bleibt, ist jeweils der zählbare Teil: Status, Typ, Zeitpunkt.
  update application      set answers = '{}'::jsonb where person_id = p_person_id;
  update hack_application set motivation = null, team_pref = null, note = null where person_id = p_person_id;
  -- Der Einwilligungsnachweis bleibt — er ist der Beleg, dass wir durften, was
  -- wir getan haben. Das Gerät, von dem sie kam, ist dafür ohne Bedeutung.
  update consent_record   set user_agent = null where person_id = p_person_id;
  -- Fremdsystem-Verweise zeigen auf Kopien, die dort noch den Namen tragen;
  -- der Verweis selbst darf nicht bleiben (siehe Kopf, vivenu).
  update registration     set external_ref = null, external_ids = '{}'::jsonb where person_id = p_person_id;
  update shift_assignment set decline_reason = null where person_id = p_person_id;
  update volunteer_profile set availability = null, buddy_note = null, notes_internal = null,
                               decision_note = null, coupon_error = null, buddy_person_id = null
   where person_id = p_person_id;
  update ticket set holder_email = null, holder_first_name = null, holder_last_name = null,
                    holder_company = null, holder_position = null, buyer_email = null,
                    team_note = null, extra_fields = '{}'::jsonb
   where person_id = p_person_id;

  -- 7 · Speaker-Profil und was daran hängt.
  update speaker_profile set
    bio_short_de = null, bio_short_en = null, bio_long_de = null, bio_long_en = null,
    job_title = null, organization_name = null, internal_notes = null,
    -- `tech_rider` und `socials` sind `not null default '{}'` — hier gehoert der
    -- leere Wert hin, nicht `null` (Probelauf der Architektur-Session, 23502).
    tech_rider = '{}'::jsonb, socials = '{}'::jsonb,
    decline_reason = null, photo_asset_id = null,
    -- Der Kontakt ohne Portalzugang (0127) gehoert einer **dritten** Person:
    -- Agentur, Office, Management. Sie hat hier nie ein Konto gehabt und kann
    -- die Loeschung auch nicht selbst verlangen — deshalb faellt sie mit dem
    -- Profil, das sie eingetragen hat. Keine Sperrliste: die Adresse stand nie
    -- in einem Verteiler, das Portal kann an sie gar nicht senden (`queue_mail`
    -- braucht eine `person_id`, und eine hat sie nicht).
    contact_first_name = null, contact_last_name = null, contact_email = null,
    contact_phone = null, contact_kind = null, contact_consent_at = null,
    -- LEAD-039: die Einordnung ist eine Einschätzung über die Person, und
    -- `contact_via` nennt, über wen sie läuft.
    category = null, topic_cluster = null, topic_role = null, priority = null,
    recommended_format = null, contact_via = null, outreach_channel = null
   where person_id = p_person_id;
  delete from speaker_stage_candidate where profile_id = any (v_profile);
  -- Titel und Beschreibung sind der veröffentlichte Programmpunkt und gehören
  -- zur Veranstaltung, nicht zur Person; die interne Notiz nicht.
  update session_submission  set notes = null      where speaker_profile_id = any (v_profile);
  update hospitality_booking set details = '{}'::jsonb, team_note = null where profile_id = any (v_profile);

  -- 8 · Reisekosten. Der Antrag bleibt als Buchung (§147 AO), die Bankdaten
  --     nicht: bezahlt ist bezahlt, und ein offener Antrag ist eine Hürde, die
  --     bis hierher gar nicht kommt.
  delete from vault.secrets
   where id in (select ec.bank_secret_id from expense_claim ec
                 where ec.profile_id = any (v_profile) and ec.bank_secret_id is not null);
  update expense_claim set bank_secret_id = null, bank_masked = null, bank_holder = null,
                           review_note = null
   where profile_id = any (v_profile);

  -- 9 · Der selbst geschriebene Grund ist Freitext von dieser Person und darf
  --     ihre Löschung nicht überleben. Status, Hürden und Zeitpunkt bleiben —
  --     das ist der Nachweis, und der trägt keinen Personenbezug.
  update profile_deletion_request set reason = null where person_id = p_person_id;
end $$;

select harden_definer_functions();
