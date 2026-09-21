create or replace function my_speaker_profile(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
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
    -- Kontakt ohne Portalzugang (0127): Agentur oder Office, das die
    -- Speakerin angeschrieben haben moechte. Steht am Profil, nicht als
    -- eigene Person — sonst waechst die Personentabelle um Karteileichen.
    'contact', case when v_sp.contact_first_name is null and v_sp.contact_last_name is null
                     and v_sp.contact_email is null and v_sp.contact_phone is null
                    then null
                    else jsonb_build_object(
                      'first_name', v_sp.contact_first_name, 'last_name', v_sp.contact_last_name,
                      'email', v_sp.contact_email, 'phone', v_sp.contact_phone,
                      'kind', v_sp.contact_kind, 'consent_at', v_sp.contact_consent_at) end,
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
       'pronouns', v_p.pronouns, 'linkedin_url', v_p.linkedin_url,
       'preferred_language', v_p.preferred_language, 'phone_e164', v_p.phone_e164,
       'email', (select pe.email::text from person_email pe where pe.person_id = v_p.id and pe.is_primary)),
    'photo_asset_id', v_sp.photo_asset_id,
    'consents', (select coalesce(jsonb_object_agg(c.consent_type, c.granted), '{}'::jsonb) from consent_current c
                 where c.person_id = v_p.id and c.consent_type in ('photo_video', 'speaker_release', 'slides_publication', 'hospitality_data')),
    'next_steps', speaker_next_steps(v_sp.id)
  );
end $$;
