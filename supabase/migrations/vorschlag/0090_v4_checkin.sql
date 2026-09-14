-- 0090 · Welle 4 · Check-in am Einlass (A2)
--
-- Liegt unter `vorschlag/`, bis die Architektur-Session sie anwendet und auf
-- die Server-Version umbenennt — `scripts/gate-pr.sh` nimmt genau dieses
-- Verzeichnis aus (Repo-Hygiene 14.09.2026).
--
-- Die Tabelle `checkin` gibt es schon; sie ist leer und hatte bisher keinen
-- Schreibweg. Hier kommen die zwei RPCs dazu, die das Kiosk braucht, und drei
-- Dinge, die im Betrieb sonst weh tun:
--
--   * `scan_day` als eigene Spalte. „Idempotent je Ticket × Tag" (A2) lässt
--     sich nicht über `scanned_at` indizieren — `at time zone` ist STABLE,
--     nicht IMMUTABLE, und ein Ausdrucksindex darüber ist unzulässig. Der Tag
--     wird deshalb beim Schreiben festgehalten.
--   * Der eindeutige Index gilt **nur für gelungene Scans**
--     (`where result = 'ok'`). Sonst könnte ein abgewiesenes Ticket am selben
--     Tag kein zweites Mal auflaufen — und genau das passiert am Einlass:
--     jemand versucht es nochmal, und das Team will beide Versuche sehen.
--   * `edition_id` denormalisiert. Ohne sie braucht jede Statistik und jeder
--     Löschlauf den Weg `checkin → ticket → event`; das Housekeeping müsste
--     über Tickets laufen, die es dann vielleicht nicht mehr gibt.
--
-- **Die Kiosk-Rolle ist die schmalste Rolle im System** (E8): `checkin_scan`
-- und `checkin_stats`, sonst nichts. Deshalb steht in der Antwort von
-- `checkin_scan` auch nur, was am Einlass gebraucht wird — Name, Pass-Typ,
-- Uhrzeit. Keine Mailadresse, keine Firma, keine Ticket-Id, keine Personen-Id:
-- ein Tablet am Eingang ist das Gerät mit dem höchsten Verlustrisiko im
-- ganzen Aufbau.
--
-- **Unbekannte Barcodes werden nicht gespeichert.** Ein fremder Code sagt uns
-- nichts über unsere Veranstaltung, und eine Tabelle mit gescannten
-- Fremdtickets ist eine Sammlung, die niemand braucht.
--
-- **Kein Auskunftskanal über fremde Editionen:** die Funktion ermittelt erst
-- die Edition des Kiosks und sucht das Ticket nur dort. Ein gültiger Barcode
-- einer anderen Edition beantwortet sich deshalb mit `unknown`, nicht mit
-- 42501 — sonst wäre die Fehlermeldung selbst die Auskunft, dass es das
-- Ticket gibt.
--
-- Fehlerschlüssel: 28000 ohne Login · 42501 ohne Kiosk-Rolle ·
-- 22023 `invalid_barcode` (leerer Code) · P0002 `edition_not_found`.
--
-- Review Architektur-Session 14.09.2026: Scan-Tag in der Zeitzone der Edition
-- (`event.timezone`, Rückfall Europe/Berlin) statt fest verdrahtet; ein Ticket
-- im Status `checked_in` (von vivenu gestempelt) gilt am Einlass als gültig;
-- der gelungene Scan schreibt `on conflict … do nothing` gegen den eindeutigen
-- Index, damit zwei Kioske, die denselben Code im selben Augenblick lesen,
-- kein 23505 in die Oberfläche werfen; `purge_checkins()` darf auch die
-- service_role (Housekeeping-Cron), nicht nur das Team.

set search_path = public, extensions;

-- ---------------------------------------------------------------- Tabelle

alter table checkin add column if not exists edition_id uuid references event(id) on delete cascade;
alter table checkin add column if not exists scan_day date;

update checkin c set scan_day = (c.scanned_at at time zone coalesce(e.timezone, 'Europe/Berlin'))::date
  from ticket t join event e on e.id = t.event_id
 where t.id = c.ticket_id and c.scan_day is null;
update checkin c set edition_id = coalesce(e.edition_id, e.id)
  from ticket t join event e on e.id = t.event_id
 where t.id = c.ticket_id and c.edition_id is null;

do $$
begin
  if exists (select 1 from checkin where edition_id is null or scan_day is null) then
    raise exception 'checkin_backfill_offen' using errcode = 'P0001',
      detail = 'Zeilen ohne edition_id/scan_day — vor NOT NULL nachziehen';
  end if;
end $$;

alter table checkin alter column scan_day set not null;
alter table checkin alter column edition_id set not null;

comment on column checkin.scan_day is
  'Tag des Scans in der Zeitzone der Edition. Eigene Spalte, weil `at time zone` STABLE ist und ein Ausdrucksindex darüber unzulässig wäre.';
comment on column checkin.result is
  'ok = eingelassen · duplicate = zweiter Scan am selben Tag · invalid = Ticket nicht gültig · blocked = gesperrt. Unbekannte Barcodes stehen hier nicht — sie werden nicht gespeichert.';

-- Ein gelungener Check-in je Ticket und Tag. Abgewiesene Versuche bleiben
-- mehrfach erlaubt.
create unique index if not exists checkin_ticket_day_uidx
  on checkin (ticket_id, scan_day) where result = 'ok';
create index if not exists checkin_edition_day_idx on checkin (edition_id, scan_day, result);

-- ---------------------------------------------------------------- Rolle

/**
 * Die Edition, für die dieses Konto scannen darf.
 *
 * Ein Kiosk-Konto hat genau eine (E8: ein Konto je Gerät, Rolle endet mit der
 * Edition). Hat jemand mehrere — Team, das aushilft —, gewinnt die laufende,
 * sonst die zuletzt begonnene. NULL heisst: darf nicht scannen.
 */
create or replace function checkin_edition() returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select r.edition_id
    from role_assignment r
    join event e on e.id = r.edition_id and e.is_edition
   where r.person_id = current_person_id()
     and r.role = 'checkin_operator'
     and r.scope_type = 'edition'
     and r.valid_from <= now()
     and (r.valid_to is null or r.valid_to > now())
   order by (current_date between e.start_date and e.end_date) desc, e.start_date desc
   limit 1
$$;

/** Wer die Zahlen der Edition sehen darf: das Kiosk selbst oder das Team. */
create or replace function can_read_checkin_stats(p_edition_id uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select is_staff() or (p_edition_id is not null and checkin_edition() = p_edition_id)
$$;

-- ---------------------------------------------------------------- Scan

/**
 * Ein Scan am Einlass.
 *
 * Antwort: `ok` eingelassen · `already` heute schon da (mit Uhrzeit) ·
 * `invalid` storniert oder gesperrt · `unknown` gehört nicht zu dieser
 * Edition. Die Uhrzeit bei `already` ist die des **ersten** Scans — das ist
 * die Zahl, nach der am Eingang gefragt wird.
 */
create or replace function checkin_scan(p_barcode text, p_device text default null)
returns table(status text, holder_name text, pass_type text, checked_in_at timestamptz)
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_ed uuid; v_code text; v_dev text; v_tag date; v_t record; v_erster timestamptz; v_tz text;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  v_ed := checkin_edition();
  if v_ed is null then raise exception 'not allowed' using errcode = '42501'; end if;

  -- Barcodes sind zeichengenau. Nur Rand-Leerzeichen fallen weg — Gross- und
  -- Kleinschreibung anzugleichen würde verschiedene Codes gleichmachen.
  v_code := nullif(btrim(coalesce(p_barcode, '')), '');
  if v_code is null then
    raise exception 'invalid_barcode' using errcode = '22023', detail = 'leerer Code';
  end if;
  v_dev := left(nullif(btrim(coalesce(p_device, '')), ''), 64);
  select coalesce(e.timezone, 'Europe/Berlin') into v_tz from event e where e.id = v_ed;
  v_tag := (now() at time zone coalesce(v_tz, 'Europe/Berlin'))::date;

  -- Nur in der eigenen Edition suchen: ein fremder Treffer darf sich nicht
  -- dadurch verraten, dass die Antwort anders ausfällt.
  select t.id as id, t.status as status, t.pass_type as pass_type,
         nullif(btrim(coalesce(t.holder_first_name, '') || ' ' || coalesce(t.holder_last_name, '')), '') as name
    into v_t
    from ticket t
    join event e on e.id = t.event_id
   where t.barcode = v_code
     and coalesce(e.edition_id, e.id) = v_ed;

  if not found then
    return query select 'unknown'::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  -- `checked_in` ist vivenus eigener Stempel — am Einlass zählt das Ticket als gültig.
  if v_t.status not in ('valid', 'checked_in') then
    insert into checkin (ticket_id, edition_id, scan_day, device_id, operator_person_id, result)
    values (v_t.id, v_ed, v_tag, v_dev, current_person_id(),
            case when v_t.status = 'blocked' then 'blocked' else 'invalid' end);
    return query select 'invalid'::text, v_t.name, v_t.pass_type, null::timestamptz;
    return;
  end if;

  select c.scanned_at into v_erster
    from checkin c
   where c.ticket_id = v_t.id and c.result = 'ok' and c.scan_day = v_tag;

  if v_erster is not null then
    insert into checkin (ticket_id, edition_id, scan_day, device_id, operator_person_id, result)
    values (v_t.id, v_ed, v_tag, v_dev, current_person_id(), 'duplicate');
    return query select 'already'::text, v_t.name, v_t.pass_type, v_erster;
    return;
  end if;

  -- Zwei Kioske, ein Code, derselbe Augenblick: der eindeutige Index entscheidet,
  -- und der Verlierer meldet `already` statt eines 23505.
  insert into checkin (ticket_id, edition_id, scan_day, device_id, operator_person_id, result)
  values (v_t.id, v_ed, v_tag, v_dev, current_person_id(), 'ok')
  on conflict (ticket_id, scan_day) where result = 'ok' do nothing
  returning scanned_at into v_erster;
  if v_erster is null then
    select c.scanned_at into v_erster from checkin c
     where c.ticket_id = v_t.id and c.result = 'ok' and c.scan_day = v_tag;
    insert into checkin (ticket_id, edition_id, scan_day, device_id, operator_person_id, result)
    values (v_t.id, v_ed, v_tag, v_dev, current_person_id(), 'duplicate');
    return query select 'already'::text, v_t.name, v_t.pass_type, v_erster;
    return;
  end if;

  -- `checked_in_at` am Ticket bleibt der **erste** Einlass über alle Tage.
  -- Tabellenalias, weil `checked_in_at` auch OUT-Parameter dieser Funktion ist
  -- und die Spalte sonst verdeckt (42702).
  update ticket t set checked_in_at = coalesce(t.checked_in_at, v_erster) where t.id = v_t.id;

  return query select 'ok'::text, v_t.name, v_t.pass_type, v_erster;
end $$;

-- ---------------------------------------------------------------- Zahlen

/**
 * Zähler für die Kiosk-Kopfzeile und das Team: je Pass-Typ, wie viele von
 * wie vielen. Ohne `p_day` der laufende Tag.
 */
create or replace function checkin_stats(p_edition_id uuid default null, p_day date default null)
returns table(pass_type text, checked_in integer, tickets integer)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid; v_day date; v_tz text;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := coalesce(p_edition_id, checkin_edition());
  if v_ed is null then raise exception 'edition_not_found' using errcode = 'P0002'; end if;
  if not can_read_checkin_stats(v_ed) then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(e.timezone, 'Europe/Berlin') into v_tz from event e where e.id = v_ed;
  v_day := coalesce(p_day, (now() at time zone coalesce(v_tz, 'Europe/Berlin'))::date);

  return query
    select coalesce(t.pass_type, 'ohne'),
           count(c.id)::integer,
           count(*)::integer
      from ticket t
      join event e on e.id = t.event_id
      left join checkin c on c.ticket_id = t.id and c.result = 'ok' and c.scan_day = v_day
     where coalesce(e.edition_id, e.id) = v_ed
       and t.status in ('valid', 'checked_in')
     group by coalesce(t.pass_type, 'ohne')
     order by coalesce(t.pass_type, 'ohne');
end $$;

-- ---------------------------------------------------------------- Aufbewahrung

/**
 * Scans 30 Tage nach Ende der Edition löschen (A2).
 *
 * Ein Check-in sagt, wann eine namentlich bekannte Person an einem bestimmten
 * Eingang stand. Nach der Veranstaltung hat das keinen Zweck mehr; wie viele
 * da waren, steht dann in der Auswertung und nicht in den Einzelzeilen.
 */
create or replace function purge_checkins() returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_n integer;
begin
  -- service_role (Housekeeping-Cron) oder Team.
  if auth.uid() is not null and not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  with weg as (
    delete from checkin c
     using event e
     where e.id = c.edition_id
       and e.end_date is not null
       and e.end_date < current_date - interval '30 days'
    returning c.id)
  select count(*)::integer into v_n from weg;
  if v_n > 0 then
    perform log_audit('checkin.purged', 'checkin', null, null, jsonb_build_object('rows', v_n));
  end if;
  return v_n;
end $$;

select harden_definer_functions();
