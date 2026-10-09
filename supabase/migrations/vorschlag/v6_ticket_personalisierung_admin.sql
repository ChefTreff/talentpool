-- 0000 · Admin-Sicht „Teilnehmer-Tickets“: Statuszahl und Liste „nicht personalisiert“ (TAL-019, zweiter Teil)
-- Anlass: docs/vorschlag-tal019-ticket-bestaetigung.md, Abschnitt Admin-Weg. Das Team soll vor dem Summit nachfassen können,
-- wer sein Ticket noch nicht personalisiert hat. Nur Lesen, keine neuen Tabellen oder Spalten.
--   1 Kein neuer Admin-Abschnitt (Plan 09.10.): Gate ist der bestehende Abschnitt `applications` (admin, area_lead_talent, talent_team);
--     die Seite liegt unter /admin/bewerbungen/tickets.
--   2 `ticket_personalization_overview(p_edition_id)`: je Edition die Zahl gültiger vivenu-Tickets je personalization_status
--     (pending/partial/complete) und die Zahl mit offenem Rückschreiben nach vivenu. Gate: has_admin_section('applications'), sonst 42501.
--   3 `tickets_unpersonalized(p_edition_id, p_limit)`: die Liste der Tickets mit pending oder partial. Ohne Barcode und ohne Secret;
--     mit Käufer-E-Mail, weil das Team darüber nachfasst (Gate wie oben, Lesen schreibt kein Audit).
-- Zählt nur source = 'vivenu' und status = 'valid': Speaker-Freitickets und Begleittickets haben eigene Wege (ADM-076).

create or replace function ticket_personalization_overview(p_edition_id uuid default null)
 returns table(event_id uuid, event_name text, pending integer, partial integer, complete integer, writeback_open integer)
 language plpgsql
 stable security definer
 set search_path to 'public', 'extensions'
as $$
begin
  if not coalesce(has_admin_section('applications'), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select t.event_id, e.name,
           (count(*) filter (where t.personalization_status = 'pending'))::integer,
           (count(*) filter (where t.personalization_status = 'partial'))::integer,
           (count(*) filter (where t.personalization_status = 'complete'))::integer,
           (count(*) filter (where t.vivenu_writeback_pending))::integer
      from ticket t
      join event e on e.id = t.event_id
     where t.source = 'vivenu' and t.status = 'valid'
       and (p_edition_id is null or t.event_id = p_edition_id)
     group by t.event_id, e.name, e.start_date
     order by e.start_date desc nulls last, e.name;
end $$;

create or replace function tickets_unpersonalized(p_edition_id uuid default null, p_limit integer default 500)
 returns table(ticket_id uuid, event_id uuid, event_name text, pass_type text, personalization_status text, buyer_email text,
               holder_first_name text, holder_last_name text, holder_company text, purchased_at timestamptz, writeback_open boolean)
 language plpgsql
 stable security definer
 set search_path to 'public', 'extensions'
as $$
begin
  if not coalesce(has_admin_section('applications'), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select t.id, t.event_id, e.name, t.pass_type, t.personalization_status, t.buyer_email::text,
           t.holder_first_name, t.holder_last_name, t.holder_company, t.purchased_at, t.vivenu_writeback_pending
      from ticket t
      join event e on e.id = t.event_id
     where t.source = 'vivenu' and t.status = 'valid'
       and t.personalization_status in ('pending', 'partial')
       and (p_edition_id is null or t.event_id = p_edition_id)
     order by t.purchased_at nulls last, t.created_at
     limit least(greatest(coalesce(p_limit, 500), 1), 5000);
end $$;

revoke execute on function ticket_personalization_overview(uuid) from public, anon;
revoke execute on function tickets_unpersonalized(uuid, integer) from public, anon;
grant execute on function ticket_personalization_overview(uuid) to authenticated;
grant execute on function tickets_unpersonalized(uuid, integer) to authenticated;

select harden_definer_functions();
