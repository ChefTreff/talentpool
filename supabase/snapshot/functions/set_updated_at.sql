create or replace function set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $$
begin
  new.updated_at = now();
  return new;
end $$;
