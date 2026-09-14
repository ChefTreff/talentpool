-- Smoke-Test 0090 (Check-in). Belegt:
--   01 ohne Kiosk-Rolle ist `checkin_scan` dicht (42501), auch für eingeloggte Leute;
--   02 gültiges Ticket ⇒ `ok`, eine Zeile in `checkin`, `ticket.checked_in_at` gesetzt;
--   03 zweiter Scan am selben Tag ⇒ `already` mit der Zeit des **ersten** Scans,
--      zweite Zeile als `duplicate`, weiterhin genau ein `ok`;
--   04 fremder Barcode ⇒ `unknown` und **keine** gespeicherte Zeile;
--   05 gültiger Barcode einer **anderen** Edition ⇒ ebenfalls `unknown`,
--      nicht 42501 — die Fehlermeldung wäre sonst selbst die Auskunft;
--   06 storniertes Ticket ⇒ `invalid`, und der zweite Versuch läuft wieder
--      durch (der eindeutige Index greift nur für `ok`);
--   07 leerer Code ⇒ 22023 invalid_barcode;
--   08 `checkin_stats` zählt richtig; Kiosk darf, Fremde nicht (42501);
--   09 das Kiosk-Konto sieht sonst nichts: fremde Tickets bleiben unsichtbar;
--   10 `purge_checkins` löscht nur, was 30 Tage nach Editionsende liegt,
--      und ist für Nicht-Team dicht (42501).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_ev uuid;
        v_ed2 uuid; v_alt uuid;
        v_tk uuid; v_tk_storno uuid; v_tk_fremd uuid; v_tk_alt uuid;
        v_n integer; v_erster timestamptz; v_r record; v_von integer; v_bis integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  delete from staff_user where auth_user_id = v_uid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_ev from event e where coalesce(e.edition_id, e.id) = v_ed
   order by (e.id = v_ed) desc limit 1;

  -- Wegwerf-Edition für 05/10: eigene Edition, eigenes Ticket.
  -- `format_tag` ist not null; 'edition' ist der Wert der laufenden Edition.
  insert into event (name, slug, format_tag, is_edition, start_date, end_date, status)
  values ('ZZTEST Edition', 'zztest-edition', 'edition', true,
          current_date - 400, current_date - 390, 'archived')
  returning id into v_ed2;

  insert into ticket (event_id, barcode, status, personalization_status, source, currency,
                      pass_type, holder_first_name, holder_last_name)
  values (v_ev, 'ZZTESTOK01', 'valid',     'complete', 'vivenu', 'EUR', 'talent',  'Zz', 'Testperson'),
         (v_ev, 'ZZTESTNO01', 'cancelled', 'complete', 'vivenu', 'EUR', 'talent',  'Zz', 'Storniert');
  select id into v_tk        from ticket where barcode = 'ZZTESTOK01';
  select id into v_tk_storno from ticket where barcode = 'ZZTESTNO01';

  insert into ticket (event_id, barcode, status, personalization_status, source, currency,
                      pass_type, holder_first_name, holder_last_name)
  values (v_ed2, 'ZZTESTFR01', 'valid', 'complete', 'vivenu', 'EUR', 'talent', 'Zz', 'Fremdedition')
  returning id into v_tk_fremd;

  -- 01 ohne Kiosk-Rolle
  begin
    perform checkin_scan('ZZTESTOK01');
    insert into t_res values ('01_ohne_rolle', 'ALLOWED (BUG)');
  exception when others then
    insert into t_res values ('01_ohne_rolle', 'abgewiesen ' || sqlstate);
  end;

  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, valid_from)
  values (v_pid, 'checkin_operator', 'edition', null, v_ed, now() - interval '1 hour');

  -- 02 gültiges Ticket
  select * into v_r from checkin_scan('ZZTESTOK01', 'kiosk-1');
  select count(*) into v_n from checkin c where c.ticket_id = v_tk and c.result = 'ok';
  insert into t_res values ('02_ok',
    case when v_r.status = 'ok' and v_n = 1 and v_r.holder_name = 'Zz Testperson'
         then 'ok, eine Zeile, Name dabei (richtig)'
         else 'unerwartet: ' || coalesce(v_r.status,'null') || '/' || v_n || '/' || coalesce(v_r.holder_name,'null') end);
  v_erster := v_r.checked_in_at;
  select count(*) into v_n from ticket t where t.id = v_tk and t.checked_in_at is not null;
  insert into t_res values ('02_ticket_gestempelt',
    case when v_n = 1 then 'checked_in_at gesetzt (richtig)' else 'NICHT GESETZT (BUG)' end);

  -- 03 zweiter Scan
  select * into v_r from checkin_scan('ZZTESTOK01', 'kiosk-1');
  select count(*) into v_n from checkin c where c.ticket_id = v_tk and c.result = 'ok';
  insert into t_res values ('03_zweiter_scan',
    case when v_r.status = 'already' and v_r.checked_in_at = v_erster and v_n = 1
         then 'already mit Zeit des ersten, weiterhin ein ok (richtig)'
         else 'unerwartet: ' || coalesce(v_r.status,'null') || ' zeit_gleich=' ||
              coalesce((v_r.checked_in_at = v_erster)::text,'null') || ' oks=' || v_n end);
  select count(*) into v_n from checkin c where c.ticket_id = v_tk and c.result = 'duplicate';
  insert into t_res values ('03_duplikat_vermerkt',
    case when v_n = 1 then 'als duplicate vermerkt (richtig)' else 'NICHT VERMERKT: ' || v_n end);

  -- 04 fremder Barcode
  select count(*) into v_von from checkin;
  select * into v_r from checkin_scan('GIBTESNICHT');
  select count(*) into v_bis from checkin;
  insert into t_res values ('04_unbekannt',
    case when v_r.status = 'unknown' and v_von = v_bis then 'unknown, nichts gespeichert (richtig)'
         else 'unerwartet: ' || coalesce(v_r.status,'null') || ' zeilen ' || v_von || '→' || v_bis end);

  -- 05 gültiger Code einer anderen Edition
  begin
    select * into v_r from checkin_scan('ZZTESTFR01');
    insert into t_res values ('05_fremde_edition',
      case when v_r.status = 'unknown' then 'unknown (richtig — keine Auskunft)'
           else 'VERRAeT: ' || coalesce(v_r.status,'null') end);
  exception when others then
    insert into t_res values ('05_fremde_edition', 'VERRAeT ueber Fehler ' || sqlstate);
  end;

  -- 06 storniertes Ticket, zweimal
  select * into v_r from checkin_scan('ZZTESTNO01');
  insert into t_res values ('06_storniert',
    case when v_r.status = 'invalid' then 'invalid (richtig)' else 'unerwartet ' || coalesce(v_r.status,'null') end);
  begin
    select * into v_r from checkin_scan('ZZTESTNO01');
    select count(*) into v_n from checkin c where c.ticket_id = v_tk_storno;
    insert into t_res values ('06_storniert_zweimal',
      case when v_r.status = 'invalid' and v_n = 2 then 'zweiter Versuch laeuft, beide vermerkt (richtig)'
           else 'unerwartet: ' || coalesce(v_r.status,'null') || '/' || v_n end);
  exception when others then
    insert into t_res values ('06_storniert_zweimal', 'INDEX BLOCKIERT (BUG) ' || sqlstate);
  end;

  -- 07 leerer Code
  begin
    perform checkin_scan('   ');
    insert into t_res values ('07_leerer_code', 'ALLOWED (BUG)');
  exception when others then
    insert into t_res values ('07_leerer_code', 'abgewiesen ' || sqlstate);
  end;

  -- 08 Zahlen
  select checked_in into v_n from checkin_stats(v_ed) where pass_type = 'talent';
  insert into t_res values ('08_stats_kiosk',
    case when v_n >= 1 then 'Kiosk sieht Zahlen, talent=' || v_n || ' (richtig)' else 'ZU WENIG: ' || coalesce(v_n::text,'null') end);
  begin
    perform checkin_stats(v_ed2);
    insert into t_res values ('08_stats_fremde_edition', 'ALLOWED (BUG)');
  exception when others then
    insert into t_res values ('08_stats_fremde_edition', 'abgewiesen ' || sqlstate);
  end;

  -- 10 Aufbewahrung
  begin
    perform purge_checkins();
    insert into t_res values ('10_purge_ohne_team', 'ALLOWED (BUG)');
  exception when others then
    insert into t_res values ('10_purge_ohne_team', 'abgewiesen ' || sqlstate);
  end;
  -- Als Team: die Wegwerf-Edition endete vor über einem Jahr, ihre Zeile muss weg,
  -- die der laufenden Edition bleibt.
  insert into checkin (ticket_id, edition_id, scan_day, result)
  values (v_tk_fremd, v_ed2, current_date - 395, 'ok');
  -- `is_staff()` erkennt `staff_user` **oder** eine Team-Rolle — hier die Rolle,
  -- damit der Test keine Spalten von `staff_user` voraussetzt.
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, valid_from)
  values (v_pid, 'admin', 'global', null, null, now() - interval '1 hour');
  select count(*) into v_von from checkin where edition_id = v_ed;
  v_n := purge_checkins();
  select count(*) into v_bis from checkin where edition_id = v_ed;
  insert into t_res values ('10_purge',
    case when v_n = 1 and v_von = v_bis then 'alte Zeile weg, laufende Edition unberuehrt (richtig)'
         else 'unerwartet: geloescht=' || v_n || ' laufend ' || v_von || '→' || v_bis end);
end $$;
-- 09 braucht einen echten Rollenwechsel: der Test läuft sonst als Superuser
-- und RLS greift nicht. Die Kiosk-Rolle gibt kein SELECT auf `ticket` — nur
-- die zwei RPCs —, das fremde Ticket muss also unsichtbar bleiben.
create temp table t_rls (sichtbar integer) on commit drop;
grant insert on t_rls to authenticated;
set local role authenticated;
insert into t_rls select count(*) from ticket where barcode = 'ZZTESTFR01';
reset role;
insert into t_res
  select '09_fremdes_ticket_sichtbar',
         case when sichtbar = 0 then 'nein (richtig)' else 'JA (BUG): ' || sichtbar end
    from t_rls;

select * from t_res order by step;
rollback;
-- Lauf am 14.09. gegen Frankfurt: alle 15 gruen. Der Test hat dabei einen
-- echten Fehler gefunden — `checked_in_at` ist auch OUT-Parameter von
-- `checkin_scan` und verdeckte die gleichnamige Spalte im UPDATE (42702).
