-- 0170 · Eigene Tickets im Teilnehmer-Portal (TAL-015)
-- Angewendet von der Architektur-Session am 24.09.2026 als 20260924190531.
--
-- Anlass: TAL-015 (Konrad 24.09.2026, über die Architektur-Session): Ticket-Seite in der
-- Seitengruppe „Summit 2027" mit QR und Pass-Typ, nur eigene Tickets der Edition; Muster
-- `/speaker/tickets`.
--
-- Warum eine Funktion statt Spalten-Grants: 0074 hat entschieden (Konrad 11.09.): „Die Person
-- sollte eigentlich nichts von den eigenen Tickets sehen können, ausser den Code." Der
-- Spalten-Grant auf `ticket` bleibt deshalb schmal (id, event_id, person_id, status, barcode);
-- diese Funktion gibt zusätzlich genau das heraus, was ein Ticket zum Vorzeigen braucht:
-- Pass-Typ, Name auf dem Ticket, Edition, Check-in-Zeitpunkt, und ob es eine vivenu-Seite gibt
-- (für den Wallet-Link über `my_ticket_wallet_link`). Keine Preise, keine Käufer-Mail, keine
-- Team-Notiz, kein Secret.
--
-- Zeilen: `person_id` = ich (nicht Käufer- oder Inhaber-Mail — ein gekauftes Ticket für jemand
-- anderen gehört dessen Portal), nur Editionen (`coalesce(event.edition_id, event.id)` ist eine
-- Edition), Status `valid`, `checked_in` oder `requested` (noch nicht ausgestellt).
--
-- Fehlerschlüssel: 28000 ohne Person. Test: supabase/tests/v6_my_tickets.sql
set search_path = public, extensions;

create or replace function my_tickets()
returns table (ticket_id uuid, edition_id uuid, edition_name text, pass_type text, status text,
               barcode text, holder_first_name text, holder_last_name text, checked_in_at timestamptz,
               wallet_available boolean)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id();
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select t.id, ed.id, ed.name, t.pass_type, t.status,
           case when t.status in ('valid', 'checked_in') then t.barcode end,
           t.holder_first_name, t.holder_last_name, t.checked_in_at,
           (t.vivenu_ticket_id is not null and exists (select 1 from ticket_secret s where s.ticket_id = t.id))
      from ticket t
      join event te on te.id = t.event_id
      join event ed on ed.id = coalesce(te.edition_id, te.id) and ed.is_edition
     where t.person_id = v_me
       and t.status in ('valid', 'checked_in', 'requested')
     order by ed.start_date desc nulls last, t.created_at;
end $$;

comment on function my_tickets() is
  'TAL-015: eigene Tickets (person_id) der Editionen zum Vorzeigen — Pass-Typ, Name, Code, Check-in, Wallet verfügbar. Keine Preise, Mails, Notizen, Secrets.';

select harden_definer_functions();
