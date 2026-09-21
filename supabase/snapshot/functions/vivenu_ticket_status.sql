create or replace function vivenu_ticket_status(p_status text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select case upper(btrim(coalesce(p_status, '')))
    when 'VALID' then 'valid'
    when 'DETAILSREQUIRED' then 'valid'        -- gültig, nur noch nicht personalisiert
    when 'INVALID' then 'cancelled'            -- Ergebnis von /tickets/{id}/invalidate
    when 'RESERVED' then 'requested'           -- Warenkorb offen, noch kein Ticket
    when 'BLANK' then 'requested'
    when 'CANCELLED' then 'cancelled'
    when 'CANCELED' then 'cancelled'
    when 'REFUNDED' then 'refunded'
    when 'CHECKEDIN' then 'checked_in'
    when 'CHECKED_IN' then 'checked_in'
    when 'BLOCKED' then 'blocked'
    else null end
$$;
