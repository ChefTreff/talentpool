create or replace function speaker_profile_confirmed_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if speaker_is_confirmed(new.pipeline_status) then
    new.confirmed_at := coalesce(new.confirmed_at, now());
  end if;
  return new;
end $$;
