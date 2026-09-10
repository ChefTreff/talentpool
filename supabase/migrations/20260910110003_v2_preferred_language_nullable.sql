-- =============================================================================
-- 0029 · Sprache: „keine Wahl" wird ein echter Zustand
--   Befund Build-Session (PR #6): person.preferred_language war NOT NULL mit Default 'de',
--   deshalb konnte der Bereichs-Fallback (Speaker-Portal EN) nie greifen.
--   Jetzt: nullable ohne Default; explizite Wahl nur über Onboarding/Profil.
--   upsert_speaker und invite_assistant setzen keine Sprache mehr.
--   queue_mail: bei NULL Englisch für Speaker/Assistenz, sonst Deutsch.
--   Bestehende Personen ohne Login (nie gewählt) → NULL; Personen mit Login behalten ihre Wahl.
-- =============================================================================
set search_path = public, extensions;

alter table person alter column preferred_language drop not null;
alter table person alter column preferred_language drop default;
update person set preferred_language = null where auth_user_id is null;

-- Mail-Sprache: Wahl der Person, sonst Zielgruppe (Speaker/Assistenz ⇒ en)
create or replace function queue_mail(
  p_template_key text, p_person_id uuid, p_vars jsonb default '{}'::jsonb,
  p_related_type text default null, p_related_id uuid default null
) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_email text; v_locale text; v_first text; v_vars jsonb; v_id bigint;
begin
  select pe.email::text,
         coalesce(case when p.preferred_language in ('de', 'en') then p.preferred_language end,
                  case when exists (select 1 from speaker_profile sp where sp.person_id = p.id or sp.assistant_person_id = p.id) then 'en' else 'de' end),
         coalesce(p.first_name, '')
    into v_email, v_locale, v_first
  from person p join person_email pe on pe.person_id = p.id and pe.is_primary
  where p.id = p_person_id and p.deleted_at is null;
  if v_email is null then return null; end if;
  if p_related_id is not null and exists (
       select 1 from mail_log where template_key = p_template_key and related_id = p_related_id and status = 'queued') then
    return null;
  end if;
  v_vars := coalesce(p_vars, '{}'::jsonb) || jsonb_build_object('first_name', v_first);
  if is_suppressed(v_email) then
    insert into mail_log (to_email, person_id, template_key, locale, provider, status, meta, related_type, related_id)
    values ('suppressed:' || email_hash(v_email), p_person_id, p_template_key, v_locale, 'resend', 'suppressed',
            jsonb_build_object('vars', v_vars), p_related_type, p_related_id)
    returning id into v_id;
    return v_id;
  end if;
  insert into mail_log (to_email, person_id, template_key, locale, provider, status, meta, related_type, related_id)
  values (v_email, p_person_id, p_template_key, v_locale, 'resend', 'queued',
          jsonb_build_object('vars', v_vars), p_related_type, p_related_id)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function queue_mail(text, uuid, jsonb, text, uuid) from public, anon, authenticated;

-- upsert_speaker: neue Personen ohne erzwungene Sprache
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
              case when p_data->>'preferred_language' in ('de', 'en') then p_data->>'preferred_language' end, 'speaker_leads', 'lead')
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

-- invite_assistant: neue Personen ohne erzwungene Sprache
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
    insert into person (first_name, last_name, source_first, tier)
    values (nullif(btrim(p_first_name), ''), nullif(btrim(p_last_name), ''), 'speaker_portal', 'lead') returning id into v_aid;
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

select harden_definer_functions();
