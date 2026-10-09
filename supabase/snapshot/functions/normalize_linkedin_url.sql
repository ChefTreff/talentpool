create or replace function normalize_linkedin_url(p_url text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $$
declare v text := lower(btrim(coalesce(p_url, ''))); m text[];
begin
  if v = '' then return null; end if;
  m := regexp_match(v, '^(?:https?://)?(?:[a-z0-9-]+\.)?linkedin\.com/(in|pub|company)/([^/?#[:space:]]+)');
  if m is null then return null; end if;
  return 'linkedin.com/' || m[1] || '/' || m[2];
end $$;
