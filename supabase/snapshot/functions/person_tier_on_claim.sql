create or replace function person_tier_on_claim()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if new.auth_user_id is not null then
    new.tier := 'talent';
  end if;
  return new;
end $$;
