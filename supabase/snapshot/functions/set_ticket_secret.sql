create or replace function set_ticket_secret(p_ticket_id uuid, p_secret text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_secret, '')), '') is null then return; end if;
  insert into ticket_secret (ticket_id, secret) values (p_ticket_id, btrim(p_secret))
  on conflict (ticket_id) do update set secret = excluded.secret, updated_at = now();
end $$;
