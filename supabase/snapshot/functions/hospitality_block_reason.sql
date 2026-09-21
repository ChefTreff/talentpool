create or replace function hospitality_block_reason(p_profile_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select case
    when sp.hospitality_status = 'declined' then 'declined'
    when sp.hospitality_status not in ('eligible', 'requested', 'booked') then 'status'
    when not coalesce((select c.granted from consent_current c where c.person_id = sp.person_id and c.consent_type = 'hospitality_data'), false) then 'consent'
    else null end
  from speaker_profile sp where sp.id = p_profile_id
$$;
