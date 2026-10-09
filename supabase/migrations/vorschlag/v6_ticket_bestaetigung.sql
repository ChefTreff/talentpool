-- 0000 · Ticket-Bestätigung und Personalisierung im Portal (TAL-019, Welle 1 B4/A2/A3)
-- Anlass: docs/vorschlag-tal019-ticket-bestaetigung.md (Go von Plan 09.10.2026). Die Seite `/tickets/bestaetigung` lädt die Tickets
-- einer vivenu-Transaktion für den angemeldeten Käufer; `personalize_ticket` (unverändert) speichert das Badge-Minimum; ein Server-Weg
-- schreibt danach nach vivenu zurück.
--   1 `ticket.vivenu_writeback_pending`: Marke „Rückschreiben nach vivenu steht aus“ (vivenu-Fehler, Schalter aus). Der nächtliche
--     Sweep holt sie nach — kein stiller Verlust. Teilindex nur auf gesetzte Zeilen.
--   2 `my_transaction_tickets(p_transaction_id)`: Lesen. Tickets mit dieser Transaktion **und** (buyer_email = Auth-E-Mail
--     oder person_id = ich). Fremde Adresse ⇒ 0 Zeilen (keine Auskunft, ob es die Transaktion gibt). Ohne Barcode, ohne Secret.
--   3 `claim_or_create_person()` aus dem Snapshot, erweitert (A3): nach dem Verknüpfen/Anlegen (und bei jedem Aufruf einer
--     bestehenden Person) werden Tickets mit leerem `person_id` der Person zugeordnet — nur bei bestätigter E-Mail-Adresse,
--     `holder_email` zuerst, `buyer_email` nur bei Tickets ohne Inhaber-Adresse, nie umhängen. Audit `ticket.claim` mit Zahl, ohne
--     Adresse.
--   4 Drei Server-Funktionen (nur ohne Nutzerkontext, wie `set_ticket_secret`): `ticket_writeback_data(ticket)` (Angaben und Secret
--     fürs Rückschreiben), `mark_ticket_writeback(ticket, pending)`, `tickets_writeback_pending(limit)`.
-- Fehlerschlüssel neu: keine. Test: supabase/tests/v6_ticket_bestaetigung.sql
set search_path = public, extensions;

alter table ticket add column if not exists vivenu_writeback_pending boolean not null default false;
comment on column ticket.vivenu_writeback_pending is
  'TAL-019: Die Badge-Angaben stehen im Portal, der Rückschreibe-Aufruf nach vivenu ist offen (Fehler oder Schalter VIVENU_WRITE_ENABLED aus). Der Sweep holt es nach und setzt die Marke zurück.';
create index if not exists ticket_writeback_pending_idx on ticket (updated_at) where vivenu_writeback_pending;

-- ---------------------------------------------------------------- 2) Tickets einer Transaktion
create or replace function my_transaction_tickets(p_transaction_id text)
 RETURNS TABLE(ticket_id uuid, pass_type text, vivenu_ticket_type_id text, status text, personalization_status text,
               holder_first_name text, holder_last_name text, holder_company text, holder_position text,
               holder_email text, for_me boolean, addons jsonb, writeback_pending boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_pid uuid := current_person_id(); v_email citext := auth.email();
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if nullif(btrim(coalesce(p_transaction_id, '')), '') is null then return; end if;
  return query
    select t.id, t.pass_type, t.vivenu_ticket_type_id, t.status, t.personalization_status,
           t.holder_first_name, t.holder_last_name, t.holder_company, t.holder_position,
           t.holder_email::text,
           (v_pid is not null and t.person_id = v_pid),
           t.addons, t.vivenu_writeback_pending
      from ticket t
     where t.vivenu_transaction_id = btrim(p_transaction_id)
       and t.status = 'valid'
       and ((v_email is not null and t.buyer_email = v_email) or (v_pid is not null and t.person_id = v_pid))
     order by t.created_at, t.id;
end $$;

-- ---------------------------------------------------------------- 3) Verknüpfung beim Login (A3)
create or replace function link_tickets_to_person(p_person_id uuid, p_email citext)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_n integer := 0; v_m integer;
begin
  if p_person_id is null or p_email is null then return 0; end if;
  update ticket set person_id = p_person_id, updated_at = now()
   where person_id is null and status in ('valid', 'checked_in') and holder_email = p_email;
  get diagnostics v_m = row_count; v_n := v_n + v_m;
  update ticket set person_id = p_person_id, updated_at = now()
   where person_id is null and status in ('valid', 'checked_in') and holder_email is null and buyer_email = p_email;
  get diagnostics v_m = row_count; v_n := v_n + v_m;
  if v_n > 0 then
    perform log_audit('ticket.claim', 'person', p_person_id::text, null, jsonb_build_object('tickets', v_n));
  end if;
  return v_n;
end $$;
revoke execute on function link_tickets_to_person(uuid, citext) from public, anon, authenticated;

create or replace function claim_or_create_person()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_uid      uuid   := auth.uid();
  v_email    citext := auth.email();
  v_verified boolean;
  v_pid      uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select (email_confirmed_at is not null) into v_verified
    from auth.users where id = v_uid;
  select id into v_pid from person where auth_user_id = v_uid;
  if found then
    -- TAL-019 (A3): auch eine bestehende Person bekommt Tickets, die inzwischen gekauft wurden.
    if v_email is not null and coalesce(v_verified, false) then
      perform link_tickets_to_person(v_pid, v_email);
    end if;
    return v_pid;
  end if;
  if v_email is not null and coalesce(v_verified, false) then
    select pe.person_id into v_pid
      from person_email pe
      join person p on p.id = pe.person_id
     where pe.email = v_email and p.auth_user_id is null
     limit 1;
    if found then
      update person set auth_user_id = v_uid where id = v_pid;
      update person_email set verified = true
        where person_id = v_pid and email = v_email;
      perform link_tickets_to_person(v_pid, v_email);
      return v_pid;
    end if;
  end if;
  if v_email is null then
    raise exception 'authenticated user has no email' using errcode = '23502';
  end if;
  insert into person (auth_user_id, source_first) values (v_uid, 'portal')
    returning id into v_pid;
  insert into person_email (person_id, email, is_primary, verified)
    values (v_pid, v_email, true, coalesce(v_verified, false));
  if coalesce(v_verified, false) then
    perform link_tickets_to_person(v_pid, v_email);
  end if;
  return v_pid;
end $$;

-- ---------------------------------------------------------------- 4) Server-Funktionen fürs Rückschreiben
create or replace function ticket_writeback_data(p_ticket_id uuid)
 RETURNS TABLE(vivenu_ticket_id text, secret text, vivenu_ticket_type_id text, vivenu_event_id text,
               first_name text, last_name text, company text, job_position text, holder_email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select t.vivenu_ticket_id, s.secret, t.vivenu_ticket_type_id, e.vivenu_event_id,
           t.holder_first_name, t.holder_last_name, t.holder_company, t.holder_position, t.holder_email::text
      from ticket t
      join ticket_secret s on s.ticket_id = t.id
      left join event e on e.id = t.event_id
     where t.id = p_ticket_id and t.vivenu_ticket_id is not null;
end $$;

create or replace function mark_ticket_writeback(p_ticket_id uuid, p_pending boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  update ticket set vivenu_writeback_pending = coalesce(p_pending, false), updated_at = now() where id = p_ticket_id;
end $$;

create or replace function tickets_writeback_pending(p_limit integer default 50)
 RETURNS TABLE(ticket_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select t.id from ticket t
     where t.vivenu_writeback_pending and t.status = 'valid'
     order by t.updated_at limit greatest(1, least(coalesce(p_limit, 50), 500));
end $$;

-- Nur service_role: die Wache `auth.uid() is not null` bleibt, dazu fehlt das EXECUTE für Angemeldete (das Secret verlässt die Datenbank nur hier).
revoke execute on function ticket_writeback_data(uuid) from public, anon, authenticated;
revoke execute on function mark_ticket_writeback(uuid, boolean) from public, anon, authenticated;
revoke execute on function tickets_writeback_pending(integer) from public, anon, authenticated;

select harden_definer_functions();
