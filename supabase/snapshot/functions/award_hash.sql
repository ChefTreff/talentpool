create or replace function award_hash(p_edition_id uuid, p_ip_hash text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_salt bytea;
begin
  -- `p_ip_hash` ist schon sha256(ip) aus der Route; hier kommen Edition und Salz dazu.
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  insert into award_secret (edition_id) values (p_edition_id) on conflict (edition_id) do nothing;
  select s.salt into v_salt from award_secret s where s.edition_id = p_edition_id;
  return encode(extensions.digest(convert_to(p_ip_hash || '|' || p_edition_id::text, 'UTF8') || v_salt, 'sha256'), 'hex');
end $$;
