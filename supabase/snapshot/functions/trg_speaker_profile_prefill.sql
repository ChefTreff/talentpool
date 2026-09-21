create or replace function trg_speaker_profile_prefill()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if new.organization_name is null then
    select nullif(btrim(p.employer_name), '') into new.organization_name from person p where p.id = new.person_id;
  end if;
  return new;
end $$;
