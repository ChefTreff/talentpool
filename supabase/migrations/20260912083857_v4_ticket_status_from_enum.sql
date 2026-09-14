-- 0081 · Ticket-Status: die echte Aufzählung, und was ein Kontingent verbraucht.
--
-- `/api/openapi.json` (Sandbox-Lauf 12.09.) kennt für ein Ticket genau fünf
-- Status: `VALID`, `INVALID`, `RESERVED`, `DETAILSREQUIRED`, `BLANK`. Die
-- Zuordnung aus 0073 war auf Verdacht gebaut und an zwei Stellen falsch:
--
-- 1. `INVALID` stand auf `blocked`. `POST /tickets/{id}/invalidate` ist aber der
--    **Storno** — am 12.09. an einem Freiticket durchgespielt, danach `INVALID`.
--    Als `blocked` hätte ein stornierter Platz das Partner-Kontingent weiter
--    belegt: der Partner bekäme seinen Platz nie zurück.
-- 2. `RESERVED` und `BLANK` waren gar nicht zugeordnet. Beim ersten Eingang
--    hätte der Rückfall `valid` gegriffen — ein offener Warenkorb hätte ein
--    Kontingent verbraucht und es bei Abbruch nie freigegeben. Beide sind jetzt
--    `requested`: angefragt, noch kein Ticket.
--
-- Dazu die Kehrseite: `recount_allocation_usage` zählte alles ausser
-- `cancelled`. Jetzt zählt es nur, was einen Platz wirklich belegt —
-- `valid`, `approved`, `checked_in`, `blocked`. `requested`, `cancelled` und
-- `refunded` geben ihn frei.
--
-- Die Zuordnungen ausserhalb der Aufzählung (CANCELLED, REFUNDED, CHECKEDIN)
-- bleiben stehen: sie kosten nichts und fangen es ab, falls vivenu die Liste
-- erweitert. Unbekanntes bleibt NULL, dann gilt weiter der alte Wert (0073).
--
-- Abweichungen: keine.
set search_path = public, extensions;

create or replace function vivenu_ticket_status(p_status text) returns text
language sql immutable security definer set search_path = public, extensions as $$
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

create or replace function recount_allocation_usage(p_allocation_id uuid) returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_a org_ticket_allocation; v_n integer;
begin
  select * into v_a from org_ticket_allocation where id = p_allocation_id;
  if not found then return 0; end if;
  -- Undershop + Pass-Typ ist der verlässliche Schlüssel; der Coupon bleibt als
  -- zweiter Weg, falls ein Ticket ohne Undershop kommt (Freitickets, POS).
  select count(*)::integer into v_n from ticket t
   where t.status in ('valid', 'approved', 'checked_in', 'blocked')
     and t.event_id = v_a.event_id
     and ((v_a.vivenu_undershop_id is not null
           and t.vivenu_undershop_id = v_a.vivenu_undershop_id
           and t.pass_type is not distinct from v_a.pass_type)
       or (v_a.vivenu_coupon_id is not null and t.vivenu_discount_id = v_a.vivenu_coupon_id));
  update org_ticket_allocation set used_count = v_n where id = p_allocation_id;
  return v_n;
end $$;

select harden_definer_functions();
