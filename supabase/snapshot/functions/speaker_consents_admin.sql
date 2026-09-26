create or replace function speaker_consents_admin(p_profile_id uuid)
 RETURNS TABLE(consent_type text, granted boolean, version text, granted_at timestamp with time zone, source text, by_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype;
begin
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce(is_speaker_team(v_sp.edition_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select x.consent_type, x.granted, x.version, x.granted_at, x.source,
           case when x.source = 'stellvertretend' then
             (select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
                from person p where p.id = (x.meta->>'by_person_id')::uuid) end
      from (select distinct on (cr.consent_type) cr.*
              from consent_record cr
             where cr.person_id = v_sp.person_id
               and cr.consent_type in ('photo_video', 'speaker_release', 'slides_publication', 'hospitality_data')
             order by cr.consent_type, cr.granted_at desc, cr.created_at desc, cr.id desc) x
     order by x.consent_type;
end $$;
