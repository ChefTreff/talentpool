-- =============================================================================
-- 0025 · v2 Speaker-Datenmodell (Welle 2 A1) + Anlegen/Einladen (A2)
--   Vokabulare speaker_type, speaker_pipeline, hospitality_status, hotel_tier ·
--   Tabelle speaker_profile (edition-bezogen) · Scope-Prüfung can_manage_speaker() ·
--   RPCs: my_speaker_profile, update_my_speaker_profile (Speaker/Assistenz, Whitelist),
--   upsert_speaker, update_speaker, set_speaker_pipeline, approve_travel_costs,
--   invite_speaker, invite_assistant, remove_assistant, manager_speakers, speaker_next_steps ·
--   Mail-Vorlagen speaker_invite, assistant_invite (EN/DE).
-- Regeln (Arbeitsauftrag Welle 2, Abschnitt C/E): Speaker/Assistenz schreiben nur per
-- RPC mit Feld-Whitelist; Assistenz nie Consent/Bankdaten; Manager nur im Scope
-- (Bühne×Tag, Slot, Edition, eigene Speaker); Team alles; jede Fremdänderung im Audit.
-- Pass-Regel R5: masterclass_host ⇒ professional ohne Lounge, sonst speaker mit Lounge.
-- Reisekosten: Lead setzt travel_costs_covered, finale Freigabe durch area_lead_speaker/admin.
-- =============================================================================
set search_path = public, extensions;

-- === Vokabulare ==============================================================
insert into vocab_term (vocabulary, key, label_de, label_en, sort_order)
select v.vocabulary, v.key, v.label_de, v.label_en, v.sort_order from (values
  ('speaker_type', 'keynote', 'Keynote', 'Keynote', 1),
  ('speaker_type', 'panelist', 'Panelist', 'Panelist', 2),
  ('speaker_type', 'moderator', 'Moderation', 'Moderator', 3),
  ('speaker_type', 'masterclass_host', 'Masterclass-Host', 'Masterclass host', 4),
  ('speaker_type', 'jury', 'Jury', 'Jury', 5),
  ('speaker_type', 'other', 'Sonstige', 'Other', 6),
  ('speaker_pipeline', 'lead', 'Lead', 'Lead', 1),
  ('speaker_pipeline', 'contacted', 'Kontaktiert', 'Contacted', 2),
  ('speaker_pipeline', 'confirmed', 'Bestätigt', 'Confirmed', 3),
  ('speaker_pipeline', 'onboarded', 'Onboarding abgeschlossen', 'Onboarded', 4),
  ('speaker_pipeline', 'ready', 'Bereit', 'Ready', 5),
  ('speaker_pipeline', 'published', 'Veröffentlicht', 'Published', 6),
  ('speaker_pipeline', 'attended', 'Teilgenommen', 'Attended', 7),
  ('speaker_pipeline', 'declined', 'Abgesagt', 'Declined', 8),
  ('hospitality_status', 'none', 'Keine', 'None', 1),
  ('hospitality_status', 'eligible', 'Freigeschaltet', 'Eligible', 2),
  ('hospitality_status', 'requested', 'Angefragt', 'Requested', 3),
  ('hospitality_status', 'booked', 'Gebucht', 'Booked', 4),
  ('hospitality_status', 'declined', 'Abgelehnt', 'Declined', 5),
  ('hotel_tier', 'standard', 'Standard (Radisson Blu Dammtor)', 'Standard (Radisson Blu Dammtor)', 1),
  ('hotel_tier', 'premium', 'Premium (Grand Elysée)', 'Premium (Grand Elysée)', 2),
  ('hotel_tier', 'vip', 'VIP (The Fontenay)', 'VIP (The Fontenay)', 3)
) as v(vocabulary, key, label_de, label_en, sort_order)
where not exists (select 1 from vocab_term t where t.vocabulary = v.vocabulary and t.key = v.key);

create or replace function is_vocab_key(p_vocabulary text, p_key text) returns boolean
language sql stable set search_path = public, extensions as $$
  select exists (select 1 from vocab_term where vocabulary = p_vocabulary and key = p_key and active)
$$;

-- === speaker_profile =========================================================
create table if not exists speaker_profile (
  id                       uuid primary key default gen_random_uuid(),
  person_id                uuid not null references person (id) on delete cascade,
  edition_id               uuid not null references event (id) on delete cascade,      -- Edition (event.is_edition)
  speaker_type             text not null default 'other',                              -- vocab speaker_type
  pipeline_status          text not null default 'lead',                               -- vocab speaker_pipeline
  owner_person_id          uuid references person (id) on delete set null,             -- verantwortlicher Lead
  job_title                text,
  organization_name        text,
  org_id                   uuid references organization (id) on delete set null,
  bio_short_en             text,
  bio_short_de             text,
  bio_long_en              text,
  bio_long_de              text,
  socials                  jsonb not null default '{}'::jsonb,                          -- {linkedin, x, instagram, website, …}
  photo_asset_id           uuid,                                                        -- FK folgt mit speaker_asset (A4)
  reception_eligible       boolean not null default false,                              -- Haken „Reception-berechtigt"
  lounge_access            boolean not null default true,
  pass_type                text not null default 'speaker',                             -- vocab ticket_type
  hotel_tier               text not null default 'standard',                            -- vocab hotel_tier
  hospitality_status       text not null default 'none',                                -- vocab hospitality_status
  travel_costs_covered     boolean not null default false,                              -- Lead beim Eintragen
  travel_costs_approved_by uuid references person (id) on delete set null,              -- finale Freigabe Program Lead
  travel_costs_approved_at timestamptz,
  tech_rider               jsonb not null default '{}'::jsonb,                          -- {mic, own_laptop, video, notes}
  assistant_person_id      uuid references person (id) on delete set null,
  internal_notes           text,                                                        -- nur Team/Manager
  invited_at               timestamptz,
  created_by               uuid references person (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (person_id, edition_id)
);
create index if not exists speaker_profile_edition_idx   on speaker_profile (edition_id, pipeline_status);
create index if not exists speaker_profile_owner_idx     on speaker_profile (owner_person_id);
create index if not exists speaker_profile_assistant_idx on speaker_profile (assistant_person_id);
comment on table speaker_profile is 'Speaker je Edition: Pipeline, Staff-Flags (Reception, Lounge, Pass, Hospitality, Reisekosten), Tech-Rider, Assistenz. Schreiben nur per RPC.';

drop trigger if exists trg_speaker_profile_updated on speaker_profile;
create trigger trg_speaker_profile_updated before update on speaker_profile for each row execute function set_updated_at();

create or replace function speaker_profile_check() returns trigger
language plpgsql as $$
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
  return new;
end $$;
drop trigger if exists trg_speaker_profile_check on speaker_profile;
create trigger trg_speaker_profile_check before insert or update on speaker_profile for each row execute function speaker_profile_check();

-- === Rechte ==================================================================
-- Team im Sinne der Speaker-Betreuung: Admin, Program Lead, Programm-Team
create or replace function is_speaker_team(p_edition_id uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select has_role('admin') or has_role('area_lead_speaker') or has_role('programme_team')
$$;

-- Manager im Scope: Team · eigener Speaker (owner/created_by) · Edition-Scope ·
-- Speaker sitzt auf einer Session in einem Slot des Scopes (Bühne, Bühne×Tag, Slot)
create or replace function can_manage_speaker(p_profile_id uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from speaker_profile sp
    where sp.id = p_profile_id
      and (
        is_speaker_team(sp.edition_id)
        or sp.owner_person_id = current_person_id()
        or sp.created_by = current_person_id()
        or has_role('speaker_manager', 'edition', null, sp.edition_id)
        or exists (
          select 1
          from session_speaker ss
          join session se on se.id = ss.session_id
          join slot sl on sl.id = se.slot_id
          left join stage_day sd on sd.stage_id = sl.stage_id and sd.event_day_id = sl.event_day_id
          where ss.person_id = sp.person_id
            and (has_role('speaker_manager', 'stage', sl.stage_id)
                 or has_role('speaker_manager', 'slot', sl.id)
                 or (sd.id is not null and has_role('speaker_manager', 'stage_day', sd.id)))
        )
      )
  )
$$;

alter table speaker_profile enable row level security;
drop policy if exists sp_manage_sel on speaker_profile;
create policy sp_manage_sel on speaker_profile for select to authenticated using (can_manage_speaker(id));
revoke all on speaker_profile from anon;
revoke insert, update, delete on speaker_profile from authenticated;   -- Schreiben nur per RPC
grant select on speaker_profile to authenticated;
grant all on speaker_profile to service_role;

-- === Nächste Schritte (Onboarding-Karten, Lead-Übersicht) =====================
create or replace function speaker_next_steps(p_profile_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_sp speaker_profile%rowtype; v_p person%rowtype; v_me uuid := current_person_id();
  v_profile boolean; v_photo boolean; v_consents boolean; v_session boolean; v_ticket boolean; v_open text[] := '{}';
begin
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not (v_sp.person_id = v_me or v_sp.assistant_person_id = v_me or can_manage_speaker(p_profile_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_p from person where id = v_sp.person_id;
  v_profile  := coalesce(nullif(btrim(v_p.first_name), ''), '') <> '' and coalesce(nullif(btrim(v_p.last_name), ''), '') <> ''
                and coalesce(nullif(btrim(v_sp.job_title), ''), '') <> '' and coalesce(nullif(btrim(v_sp.bio_short_en), ''), '') <> '';
  v_photo    := v_p.photo_url is not null;
  v_consents := coalesce((select c.granted from consent_current c where c.person_id = v_p.id and c.consent_type = 'speaker_release'), false)
                and coalesce((select c.granted from consent_current c where c.person_id = v_p.id and c.consent_type = 'photo_video'), false);
  v_session  := exists (select 1 from session_speaker ss join session se on se.id = ss.session_id join event e on e.id = se.event_id
                        where ss.person_id = v_p.id and (e.edition_id = v_sp.edition_id or e.id = v_sp.edition_id));
  v_ticket   := exists (select 1 from ticket t join event e on e.id = t.event_id
                        where t.person_id = v_p.id and (e.edition_id = v_sp.edition_id or e.id = v_sp.edition_id) and t.status in ('valid', 'requested'));
  if not v_profile  then v_open := v_open || 'profile'; end if;
  if not v_photo    then v_open := v_open || 'photo'; end if;
  if not v_consents then v_open := v_open || 'consents'; end if;
  if not v_session  then v_open := v_open || 'session'; end if;
  if not v_ticket   then v_open := v_open || 'ticket'; end if;
  return jsonb_build_object(
    'profile', v_profile, 'photo', v_photo, 'consents', v_consents, 'session', v_session,
    'session_content', null, 'presentation', null,        -- A3/A4
    'ticket', v_ticket,
    'hospitality', v_sp.hospitality_status,
    'open', to_jsonb(v_open)
  );
end $$;

-- === Speaker/Assistenz: eigenes Profil lesen ==================================
create or replace function my_speaker_profile(p_edition_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_sp speaker_profile%rowtype; v_p person%rowtype;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile sp
   where (sp.person_id = v_me or sp.assistant_person_id = v_me)
     and (p_edition_id is null or sp.edition_id = p_edition_id)
   order by (sp.person_id = v_me) desc, sp.created_at desc
   limit 1;
  if not found then return null; end if;
  select * into v_p from person where id = v_sp.person_id;
  return jsonb_build_object(
    'id', v_sp.id, 'edition_id', v_sp.edition_id, 'is_assistant', (v_sp.person_id <> v_me),
    'edition_name', (select e.name from event e where e.id = v_sp.edition_id),
    'speaker_type', v_sp.speaker_type, 'pipeline_status', v_sp.pipeline_status,
    'job_title', v_sp.job_title, 'organization_name', v_sp.organization_name,
    'bio_short_en', v_sp.bio_short_en, 'bio_short_de', v_sp.bio_short_de,
    'bio_long_en', v_sp.bio_long_en, 'bio_long_de', v_sp.bio_long_de,
    'socials', v_sp.socials, 'tech_rider', v_sp.tech_rider,
    'reception_eligible', v_sp.reception_eligible, 'lounge_access', v_sp.lounge_access,
    'pass_type', v_sp.pass_type, 'hotel_tier', v_sp.hotel_tier, 'hospitality_status', v_sp.hospitality_status,
    'travel_costs_covered', v_sp.travel_costs_covered, 'travel_costs_approved', (v_sp.travel_costs_approved_at is not null),
    'invited_at', v_sp.invited_at,
    'assistant', case when v_sp.assistant_person_id is null then null else (
       select jsonb_build_object('person_id', a.id, 'first_name', a.first_name, 'last_name', a.last_name,
                                 'email', (select pe.email::text from person_email pe where pe.person_id = a.id and pe.is_primary))
       from person a where a.id = v_sp.assistant_person_id) end,
    'person', jsonb_build_object(
       'id', v_p.id, 'first_name', v_p.first_name, 'last_name', v_p.last_name, 'title', v_p.title,
       'pronouns', v_p.pronouns, 'photo_url', v_p.photo_url, 'linkedin_url', v_p.linkedin_url,
       'preferred_language', v_p.preferred_language, 'phone_e164', v_p.phone_e164,
       'email', (select pe.email::text from person_email pe where pe.person_id = v_p.id and pe.is_primary)),
    'consents', (select coalesce(jsonb_object_agg(c.consent_type, c.granted), '{}'::jsonb) from consent_current c
                 where c.person_id = v_p.id and c.consent_type in ('photo_video', 'speaker_release', 'slides_publication', 'hospitality_data')),
    'next_steps', speaker_next_steps(v_sp.id)
  );
end $$;

-- === Speaker/Assistenz: eigenes Profil schreiben (Whitelist) ==================
create or replace function update_my_speaker_profile(p_data jsonb) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_sp speaker_profile%rowtype; v_id uuid := nullif(p_data->>'id', '')::uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile sp
   where (v_id is null or sp.id = v_id) and (sp.person_id = v_me or sp.assistant_person_id = v_me)
   order by (sp.person_id = v_me) desc, sp.created_at desc limit 1 for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;

  update speaker_profile set
    job_title         = case when p_data ? 'job_title'         then nullif(btrim(p_data->>'job_title'), '')         else job_title end,
    organization_name = case when p_data ? 'organization_name' then nullif(btrim(p_data->>'organization_name'), '') else organization_name end,
    bio_short_en      = case when p_data ? 'bio_short_en'      then nullif(btrim(p_data->>'bio_short_en'), '')      else bio_short_en end,
    bio_short_de      = case when p_data ? 'bio_short_de'      then nullif(btrim(p_data->>'bio_short_de'), '')      else bio_short_de end,
    bio_long_en       = case when p_data ? 'bio_long_en'       then nullif(btrim(p_data->>'bio_long_en'), '')       else bio_long_en end,
    bio_long_de       = case when p_data ? 'bio_long_de'       then nullif(btrim(p_data->>'bio_long_de'), '')       else bio_long_de end,
    socials           = case when p_data ? 'socials'    and jsonb_typeof(p_data->'socials') = 'object'    then p_data->'socials'    else socials end,
    tech_rider        = case when p_data ? 'tech_rider' and jsonb_typeof(p_data->'tech_rider') = 'object' then p_data->'tech_rider' else tech_rider end
  where id = v_sp.id;

  update person set
    first_name         = case when p_data ? 'first_name'         then nullif(btrim(p_data->>'first_name'), '')         else first_name end,
    last_name          = case when p_data ? 'last_name'          then nullif(btrim(p_data->>'last_name'), '')          else last_name end,
    title              = case when p_data ? 'title'              then nullif(btrim(p_data->>'title'), '')              else title end,
    pronouns           = case when p_data ? 'pronouns'           then nullif(btrim(p_data->>'pronouns'), '')           else pronouns end,
    linkedin_url       = case when p_data ? 'linkedin_url'       then nullif(btrim(p_data->>'linkedin_url'), '')       else linkedin_url end,
    phone_e164         = case when p_data ? 'phone_e164'         then nullif(btrim(p_data->>'phone_e164'), '')         else phone_e164 end,
    preferred_language = case when p_data ? 'preferred_language' and p_data->>'preferred_language' in ('de', 'en') then p_data->>'preferred_language' else preferred_language end
  where id = v_sp.person_id;

  if v_sp.person_id <> v_me then
    perform log_audit('speaker.assistant_update', 'speaker_profile', v_sp.id::text, null, p_data - 'id');
  end if;
  return v_sp.id;
end $$;

-- === Team/Manager: Speaker anlegen (A2) =======================================
create or replace function upsert_speaker(p_data jsonb) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_actor uuid := current_person_id();
  v_edition uuid := nullif(p_data->>'edition_id', '')::uuid;
  v_pid uuid := nullif(p_data->>'person_id', '')::uuid;
  v_email citext := nullif(btrim(p_data->>'email'), '')::citext;
  v_type text := coalesce(nullif(p_data->>'speaker_type', ''), 'other');
  v_team boolean; v_id uuid; v_existing uuid;
begin
  if v_actor is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if v_edition is null or not exists (select 1 from event where id = v_edition and is_edition) then
    raise exception 'edition_required' using errcode = '22023';
  end if;
  v_team := is_speaker_team(v_edition);
  if not (v_team or has_role('speaker_manager')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not v_team and (p_data ?| array['lounge_access', 'pass_type', 'hotel_tier', 'hospitality_status', 'org_id', 'owner_person_id']) then
    raise exception 'team_only_fields' using errcode = '42501';
  end if;

  if v_pid is null then
    if v_email is null then raise exception 'email_or_person_required' using errcode = '22023'; end if;
    if is_suppressed(v_email::text) then raise exception 'suppressed' using errcode = 'P0001'; end if;
    select pe.person_id into v_pid from person_email pe join person p on p.id = pe.person_id
     where pe.email = v_email and p.deleted_at is null limit 1;
    if v_pid is null then
      insert into person (first_name, last_name, title, preferred_language, source_first, tier)
      values (nullif(btrim(p_data->>'first_name'), ''), nullif(btrim(p_data->>'last_name'), ''), nullif(btrim(p_data->>'title'), ''),
              case when p_data->>'preferred_language' in ('de', 'en') then p_data->>'preferred_language' else 'en' end, 'speaker_leads', 'lead')
      returning id into v_pid;
      insert into person_email (person_id, email, is_primary, verified) values (v_pid, v_email, true, false);
    end if;
  elsif not exists (select 1 from person where id = v_pid and deleted_at is null) then
    raise exception 'person_not_found' using errcode = 'P0002';
  end if;

  select id into v_existing from speaker_profile where person_id = v_pid and edition_id = v_edition;

  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, owner_person_id, job_title, organization_name, org_id,
                               internal_notes, reception_eligible, travel_costs_covered, pass_type, lounge_access, hotel_tier, hospitality_status, created_by)
  values (v_pid, v_edition, v_type, coalesce(nullif(p_data->>'pipeline_status', ''), 'lead'),
          coalesce(nullif(p_data->>'owner_person_id', '')::uuid, v_actor),
          nullif(btrim(p_data->>'job_title'), ''), nullif(btrim(p_data->>'organization_name'), ''), nullif(p_data->>'org_id', '')::uuid,
          nullif(btrim(p_data->>'internal_notes'), ''),
          coalesce((p_data->>'reception_eligible')::boolean, false), coalesce((p_data->>'travel_costs_covered')::boolean, false),
          coalesce(nullif(p_data->>'pass_type', ''), case when v_type = 'masterclass_host' then 'professional' else 'speaker' end),
          coalesce((p_data->>'lounge_access')::boolean, v_type <> 'masterclass_host'),
          coalesce(nullif(p_data->>'hotel_tier', ''), 'standard'),
          coalesce(nullif(p_data->>'hospitality_status', ''), 'none'),
          v_actor)
  on conflict (person_id, edition_id) do update set
    speaker_type         = case when p_data ? 'speaker_type'         then v_type else speaker_profile.speaker_type end,
    pipeline_status      = coalesce(nullif(p_data->>'pipeline_status', ''), speaker_profile.pipeline_status),
    job_title            = case when p_data ? 'job_title'            then nullif(btrim(p_data->>'job_title'), '') else speaker_profile.job_title end,
    organization_name    = case when p_data ? 'organization_name'    then nullif(btrim(p_data->>'organization_name'), '') else speaker_profile.organization_name end,
    internal_notes       = case when p_data ? 'internal_notes'       then nullif(btrim(p_data->>'internal_notes'), '') else speaker_profile.internal_notes end,
    reception_eligible   = coalesce((p_data->>'reception_eligible')::boolean, speaker_profile.reception_eligible),
    travel_costs_covered = coalesce((p_data->>'travel_costs_covered')::boolean, speaker_profile.travel_costs_covered),
    owner_person_id      = coalesce(nullif(p_data->>'owner_person_id', '')::uuid, speaker_profile.owner_person_id),
    org_id               = case when p_data ? 'org_id' then nullif(p_data->>'org_id', '')::uuid else speaker_profile.org_id end,
    pass_type            = coalesce(nullif(p_data->>'pass_type', ''), speaker_profile.pass_type),
    lounge_access        = coalesce((p_data->>'lounge_access')::boolean, speaker_profile.lounge_access),
    hotel_tier           = coalesce(nullif(p_data->>'hotel_tier', ''), speaker_profile.hotel_tier),
    hospitality_status   = coalesce(nullif(p_data->>'hospitality_status', ''), speaker_profile.hospitality_status)
  returning id into v_id;

  -- Rolle speaker (Edition) sicherstellen, ggf. reaktivieren
  insert into role_assignment (person_id, role, scope_type, edition_id, granted_by, note)
  values (v_pid, 'speaker', 'edition', v_edition, v_actor, 'speaker_profile')
  on conflict (person_id, role, scope_type,
               coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(edition_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(portal, ''))
  do update set valid_to = null, granted_by = v_actor;

  perform log_audit(case when v_existing is null then 'speaker.create' else 'speaker.update' end, 'speaker_profile', v_id::text, null, (p_data - 'email') || jsonb_build_object('person_id', v_pid));
  return v_id;
end $$;

-- === Team/Manager: Speaker ändern (Whitelist je Rolle) ========================
create or replace function update_speaker(p_profile_id uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_sp speaker_profile%rowtype; v_team boolean; v_before jsonb;
begin
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not can_manage_speaker(p_profile_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_team := is_speaker_team(v_sp.edition_id);
  if not v_team and (p_data ?| array['lounge_access', 'pass_type', 'hotel_tier', 'hospitality_status', 'org_id', 'travel_costs_approved']) then
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

create or replace function set_speaker_pipeline(p_profile_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_old text;
begin
  if not can_manage_speaker(p_profile_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if not is_vocab_key('speaker_pipeline', p_status) then raise exception 'invalid pipeline_status' using errcode = '22023', detail = p_status; end if;
  select pipeline_status into v_old from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  update speaker_profile set pipeline_status = p_status where id = p_profile_id;
  perform log_audit('speaker.pipeline', 'speaker_profile', p_profile_id::text, jsonb_build_object('status', v_old), jsonb_build_object('status', p_status));
end $$;

-- Finale Reisekosten-Freigabe: Program Lead (area_lead_speaker) oder Admin
create or replace function approve_travel_costs(p_profile_id uuid, p_approved boolean default true) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not (has_role('admin') or has_role('area_lead_speaker')) then raise exception 'not allowed' using errcode = '42501'; end if;
  update speaker_profile
     set travel_costs_covered     = case when p_approved then true else travel_costs_covered end,
         travel_costs_approved_by = case when p_approved then current_person_id() else null end,
         travel_costs_approved_at = case when p_approved then now() else null end
   where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  perform log_audit('speaker.travel_costs', 'speaker_profile', p_profile_id::text, null, jsonb_build_object('approved', p_approved));
end $$;

-- === Einladen (A2) ===========================================================
create or replace function invite_speaker(p_profile_id uuid) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare v_sp speaker_profile%rowtype; v_mail bigint; v_actor uuid := current_person_id();
begin
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not can_manage_speaker(p_profile_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_sp.pipeline_status not in ('confirmed', 'onboarded', 'ready', 'published') then
    raise exception 'not_confirmed' using errcode = 'P0001', detail = v_sp.pipeline_status;
  end if;
  insert into role_assignment (person_id, role, scope_type, edition_id, granted_by, note)
  values (v_sp.person_id, 'speaker', 'edition', v_sp.edition_id, v_actor, 'speaker_profile')
  on conflict (person_id, role, scope_type,
               coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(edition_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(portal, ''))
  do update set valid_to = null;
  v_mail := queue_mail('speaker_invite', v_sp.person_id,
    jsonb_build_object('edition_name', (select e.name from event e where e.id = v_sp.edition_id),
                       'inviter_name', coalesce((select p.first_name from person p where p.id = v_actor), 'ChefTreff')),
    'speaker_profile', v_sp.id);
  update speaker_profile set invited_at = now() where id = p_profile_id;
  perform log_audit('speaker.invite', 'speaker_profile', p_profile_id::text, null, jsonb_build_object('mail_log_id', v_mail));
  return v_mail;
end $$;

create or replace function invite_assistant(p_profile_id uuid, p_email text, p_first_name text default null, p_last_name text default null) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_email citext := nullif(btrim(p_email), '')::citext; v_aid uuid; v_old uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not (v_sp.person_id = v_me or can_manage_speaker(p_profile_id)) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_email is null then raise exception 'email_required' using errcode = '22023'; end if;
  if is_suppressed(v_email::text) then raise exception 'suppressed' using errcode = 'P0001'; end if;

  select pe.person_id into v_aid from person_email pe join person p on p.id = pe.person_id where pe.email = v_email and p.deleted_at is null limit 1;
  if v_aid is null then
    insert into person (first_name, last_name, preferred_language, source_first, tier)
    values (nullif(btrim(p_first_name), ''), nullif(btrim(p_last_name), ''), 'en', 'speaker_portal', 'lead') returning id into v_aid;
    insert into person_email (person_id, email, is_primary, verified) values (v_aid, v_email, true, false);
  end if;
  if v_aid = v_sp.person_id then raise exception 'assistant_is_speaker' using errcode = '23514'; end if;

  v_old := v_sp.assistant_person_id;
  update speaker_profile set assistant_person_id = v_aid where id = p_profile_id;
  if v_old is not null and v_old <> v_aid and not exists (select 1 from speaker_profile s where s.assistant_person_id = v_old and s.edition_id = v_sp.edition_id) then
    update role_assignment set valid_to = greatest(now(), valid_from + interval '1 second')
     where person_id = v_old and role = 'speaker_assistant' and scope_type = 'edition' and edition_id = v_sp.edition_id and (valid_to is null or valid_to > now());
  end if;
  insert into role_assignment (person_id, role, scope_type, edition_id, granted_by, note)
  values (v_aid, 'speaker_assistant', 'edition', v_sp.edition_id, v_me, 'assistant of ' || v_sp.id::text)
  on conflict (person_id, role, scope_type,
               coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(edition_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(portal, ''))
  do update set valid_to = null, granted_by = v_me;

  perform queue_mail('assistant_invite', v_aid,
    jsonb_build_object('speaker_name', (select btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) from person p where p.id = v_sp.person_id),
                       'edition_name', (select e.name from event e where e.id = v_sp.edition_id)),
    'speaker_profile', v_sp.id);
  perform log_audit('speaker.assistant_invite', 'speaker_profile', p_profile_id::text, jsonb_build_object('assistant', v_old), jsonb_build_object('assistant', v_aid));
  return v_aid;
end $$;

create or replace function remove_assistant(p_profile_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id();
begin
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not (v_sp.person_id = v_me or can_manage_speaker(p_profile_id)) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_sp.assistant_person_id is null then return; end if;
  update speaker_profile set assistant_person_id = null where id = p_profile_id;
  if not exists (select 1 from speaker_profile s where s.assistant_person_id = v_sp.assistant_person_id and s.edition_id = v_sp.edition_id) then
    update role_assignment set valid_to = greatest(now(), valid_from + interval '1 second')
     where person_id = v_sp.assistant_person_id and role = 'speaker_assistant' and scope_type = 'edition' and edition_id = v_sp.edition_id and (valid_to is null or valid_to > now());
  end if;
  perform log_audit('speaker.assistant_remove', 'speaker_profile', p_profile_id::text, jsonb_build_object('assistant', v_sp.assistant_person_id), null);
end $$;

-- === Lead-Portal: Liste im Scope ============================================
create or replace function manager_speakers(p_edition_id uuid default null)
returns table (
  id uuid, person_id uuid, first_name text, last_name text, title text, email text,
  job_title text, organization_name text, speaker_type text, pipeline_status text,
  owner_person_id uuid, owner_name text, reception_eligible boolean, travel_costs_covered boolean, travel_costs_approved boolean,
  hospitality_status text, hotel_tier text, pass_type text, lounge_access boolean, invited_at timestamptz,
  assistant_name text, sessions jsonb, next_open jsonb, updated_at timestamptz
)
language plpgsql stable security definer set search_path = public, extensions as $$
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
           (select btrim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')) from person a where a.id = sp.assistant_person_id),
           coalesce((select jsonb_agg(jsonb_build_object('session_id', se.id, 'title_de', se.title_de, 'title_en', se.title_en,
                                                          'publish_status', se.publish_status, 'start_at', sl.start_at, 'stage_name', st.name)
                                       order by sl.start_at nulls last)
                     from session_speaker ss join session se on se.id = ss.session_id join event e on e.id = se.event_id
                     left join slot sl on sl.id = se.slot_id left join stage st on st.id = sl.stage_id
                     where ss.person_id = sp.person_id and (e.edition_id = sp.edition_id or e.id = sp.edition_id)), '[]'::jsonb),
           speaker_next_steps(sp.id)->'open',
           sp.updated_at
    from speaker_profile sp
    join person p on p.id = sp.person_id
    left join vocab_term v on v.vocabulary = 'speaker_pipeline' and v.key = sp.pipeline_status
    where (p_edition_id is null or sp.edition_id = p_edition_id)
      and p.deleted_at is null
      and can_manage_speaker(sp.id)
    order by v.sort_order nulls last, p.last_name nulls last, p.first_name nulls last;
end $$;

-- === Mail-Vorlagen ===========================================================
insert into mail_template (key, locale, version, subject, body_md, description, active)
select v.key, v.locale, v.version, v.subject, v.body_md, v.description, v.active from (values
  ('speaker_invite', 'en', 1, 'Welcome to the {{edition_name}} speaker portal',
   E'Hi {{first_name}},\n\nwe are delighted to have you as a speaker at **{{edition_name}}**. Your speaker portal is ready: profile, session details, presentation upload, travel and tickets in one place.\n\nSign in with this email address – no password needed, you will receive a login link: [Open speaker portal]({{portal_url}}/login)\n\nQuestions? Just reply to speaker@chef-treff.de.\n\nBest,\n{{inviter_name}} and the ChefTreff team',
   'Speaker invitation to the portal', true),
  ('speaker_invite', 'de', 1, 'Willkommen im Speaker-Portal für {{edition_name}}',
   E'Hallo {{first_name}},\n\nwir freuen uns, dich als Speaker bei **{{edition_name}}** zu haben. Dein Speaker-Portal ist bereit: Profil, Session-Details, Präsentations-Upload, Anreise und Tickets an einem Ort.\n\nMelde dich mit dieser E-Mail-Adresse an – ohne Passwort, du bekommst einen Login-Link: [Speaker-Portal öffnen]({{portal_url}}/login)\n\nFragen? Antworte einfach an speaker@chef-treff.de.\n\nViele Grüße\n{{inviter_name}} und das ChefTreff-Team',
   'Speaker-Einladung ins Portal', true),
  ('assistant_invite', 'en', 1, '{{speaker_name}} added you as assistant for {{edition_name}}',
   E'Hi {{first_name}},\n\n**{{speaker_name}}** has added you as assistant for **{{edition_name}}**. You can maintain the speaker profile, session details, presentation and travel on their behalf – consents and bank details stay with the speaker.\n\nSign in with this email address – no password needed: [Open speaker portal]({{portal_url}}/login)\n\nBest,\nChefTreff',
   'Assistant invitation', true),
  ('assistant_invite', 'de', 1, '{{speaker_name}} hat dich als Assistenz für {{edition_name}} eingetragen',
   E'Hallo {{first_name}},\n\n**{{speaker_name}}** hat dich als Assistenz für **{{edition_name}}** eingetragen. Du kannst Profil, Session-Details, Präsentation und Anreise stellvertretend pflegen – Einwilligungen und Bankdaten bleiben beim Speaker.\n\nMelde dich mit dieser E-Mail-Adresse an – ohne Passwort: [Speaker-Portal öffnen]({{portal_url}}/login)\n\nViele Grüße\nChefTreff',
   'Assistenz-Einladung', true)
) as v(key, locale, version, subject, body_md, description, active)
where not exists (select 1 from mail_template t where t.key = v.key and t.locale = v.locale);

-- Schreibende RPCs nicht für anon (Härtung nimmt anon ohnehin EXECUTE); authenticated bleibt, Prüfung liegt innen.
select harden_definer_functions();
