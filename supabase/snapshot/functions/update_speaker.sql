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
