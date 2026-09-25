create or replace function upsert_speaker(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_actor uuid := current_person_id();
  v_edition uuid := nullif(p_data->>'edition_id', '')::uuid;
  v_pid uuid := nullif(p_data->>'person_id', '')::uuid;
  v_email citext := nullif(btrim(p_data->>'email'), '')::citext;
  v_type text := coalesce(nullif(p_data->>'speaker_type', ''), 'other');
  v_team boolean; v_id uuid; v_existing uuid; v_guest boolean;
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
  returning id, stage_guest into v_id, v_guest;

  -- PART-081: ein Gastprofil bekommt keinen Speaker-Zugang (die Leistungen verhindert der CHECK).
  if not v_guest then
    insert into role_assignment (person_id, role, scope_type, edition_id, granted_by, note)
    values (v_pid, 'speaker', 'edition', v_edition, v_actor, 'speaker_profile')
    on conflict (person_id, role, scope_type,
                 coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 coalesce(edition_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 coalesce(portal, ''))
    do update set valid_to = null, granted_by = v_actor;
  end if;

  perform log_audit(case when v_existing is null then 'speaker.create' else 'speaker.update' end, 'speaker_profile', v_id::text, null, (p_data - 'email') || jsonb_build_object('person_id', v_pid));
  return v_id;
end $$;
