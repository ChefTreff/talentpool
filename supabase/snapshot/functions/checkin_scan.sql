create or replace function checkin_scan(p_barcode text, p_device text DEFAULT NULL::text)
 RETURNS TABLE(status text, holder_name text, pass_type text, checked_in_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
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
