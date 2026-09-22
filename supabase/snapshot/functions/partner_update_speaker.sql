create or replace function partner_update_speaker(p_profile_id uuid, p_fields jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_bad text;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if v_sp.created_by_org_id is null or not partner_can_edit(v_sp.created_by_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- Das Flag ist die eigentliche Grenze. Es fällt beim ersten Login der Speakerin und bei
  -- einer bloß per Mailadresse zugeordneten Person stand es nie — in beiden Fällen sind die
  -- Angaben nicht die des Partners.
  if not v_sp.partner_editable_until_login then
    raise exception 'speaker_not_editable' using errcode = 'P0001', detail = p_profile_id::text;
  end if;

  select string_agg(k, ',') into v_bad from jsonb_object_keys(p_fields) k
   where k not in ('first_name','last_name','title','job_title','organization_name',
                   'bio_short_de','bio_short_en','bio_long_de','bio_long_en',
                   'linkedin_url','socials');
  if v_bad is not null then
    raise exception 'not_editable' using errcode = 'P0001', detail = v_bad;
  end if;

  update speaker_profile set
    job_title         = case when p_fields ? 'job_title'         then nullif(btrim(p_fields->>'job_title'), '')         else job_title end,
    organization_name = case when p_fields ? 'organization_name' then nullif(btrim(p_fields->>'organization_name'), '') else organization_name end,
    bio_short_de      = case when p_fields ? 'bio_short_de'      then nullif(btrim(p_fields->>'bio_short_de'), '')      else bio_short_de end,
    bio_short_en      = case when p_fields ? 'bio_short_en'      then nullif(btrim(p_fields->>'bio_short_en'), '')      else bio_short_en end,
    bio_long_de       = case when p_fields ? 'bio_long_de'       then nullif(btrim(p_fields->>'bio_long_de'), '')       else bio_long_de end,
    bio_long_en       = case when p_fields ? 'bio_long_en'       then nullif(btrim(p_fields->>'bio_long_en'), '')       else bio_long_en end,
    socials           = case when p_fields ? 'socials' and jsonb_typeof(p_fields->'socials') = 'object'
                             then p_fields->'socials' else socials end
  where id = v_sp.id;

  update person set
    first_name   = case when p_fields ? 'first_name'   then nullif(btrim(p_fields->>'first_name'), '')   else first_name end,
    last_name    = case when p_fields ? 'last_name'    then nullif(btrim(p_fields->>'last_name'), '')    else last_name end,
    title        = case when p_fields ? 'title'        then nullif(btrim(p_fields->>'title'), '')        else title end,
    linkedin_url = case when p_fields ? 'linkedin_url' then nullif(btrim(p_fields->>'linkedin_url'), '') else linkedin_url end
  where id = v_sp.person_id;

  -- Fremde Stammdaten, geändert von jemand anderem als der Person selbst: das gehört ins
  -- Protokoll, mit der Organisation, nicht nur mit der handelnden Person.
  perform log_audit('partner.speaker_update', 'speaker_profile', v_sp.id::text, null,
                    jsonb_build_object('org_id', v_sp.created_by_org_id,
                                       'fields', (select array_agg(k) from jsonb_object_keys(p_fields) k)));
end $$;
