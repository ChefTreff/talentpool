create or replace function ac_apply_unsubscribe(p_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_person uuid; v_version text;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  select pe.person_id into v_person from person_email pe join person p on p.id = pe.person_id
   where lower(pe.email::text) = lower(btrim(coalesce(p_email, ''))) and p.deleted_at is null
   order by pe.is_primary desc limit 1;
  if v_person is null then return false; end if;
  select c.version into v_version from consent_current c
   where c.person_id = v_person and c.consent_type = 'newsletter' and c.granted;
  if v_version is null then return false; end if;
  insert into consent_record (person_id, consent_type, version, granted, source, meta)
  values (v_person, 'newsletter', v_version, false, 'activecampaign', jsonb_build_object('via', 'activecampaign'));
  return true;
end $$;
