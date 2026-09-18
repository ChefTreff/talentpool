create or replace function update_my_speaker_profile(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
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
