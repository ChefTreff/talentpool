-- Smoke-Test (Standbühne: Fenster = Öffnungszeiten, PART-090, ersetzt PART-079). Nummer offen.
-- Wegwerf-Veranstaltung mit drei Tagen (Programm 13:00–20:30 an Tag 1 und 2, ohne Zeiten an
-- Tag 3), Wegwerf-Organisation mit Standbühne und Interview Table; alles zurückgerollt. Belegt:
--   01 Öffnungszeiten 12:00–20:00 (Tag 1): ein Partner legt direkt zur Öffnung an (12:00–12:20)
--      und bis zum Schluss (19:40–20:00) — beides war mit PART-079 gesperrt (13:30 bzw. 19:00);
--   02 vor der Öffnung und über den Schluss hinaus nicht: P0001 `outside_partner_window`, detail
--      `12:00–20:00`;
--   03 `move_slot` hält dasselbe Fenster: bis 20:00 geht, darüber nicht;
--   04 ohne `stage_day`-Zeile (Tag 2) gilt der Tagesrahmen der Veranstaltung 13:00–20:30;
--   05 eine Zeile nur mit Kontingent fällt je Grenze auf den Tag zurück (Fenster 13:00–20:30);
--   06 nur ein Beginn und kein Tagesrahmen (Tag 3): Ende 24:00, die Meldung trägt ein detail —
--      kein 22004 aus einem NULL im `raise` der Aufrufer; ganz ohne Rahmen keine Grenze;
--   07 Admin bindet weiterhin nicht (Vorbedingung für den Fall Konrad);
--   08 das Fenster gilt nur auf `partner_booth`: Interview Table ohne Zeile und nicht gebunden;
--   09 Funktion bleibt SECURITY DEFINER mit festem search_path, intern (kein EXECUTE für
--      `authenticated` und `anon`).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_vorlage uuid;
  v_ev uuid; v_tz text; v_tag1 uuid; v_tag2 uuid; v_tag3 uuid;
  d1 date := date '2027-04-16'; d2 date := date '2027-04-17'; d3 date := date '2027-04-18';
  v_org uuid; v_buehne uuid; v_tisch uuid; v_slot uuid;
  v_txt text; v_b boolean; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  if v_pid is null then raise exception 'VORBEDINGUNG: keine Person mit Konto'; end if;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_vorlage from event e where e.edition_id = v_ed and not e.is_edition limit 1;
  if v_ed is null or v_vorlage is null then raise exception 'VORBEDINGUNG: Edition fls27 oder Veranstaltung fehlt'; end if;

  insert into event (name, format_tag, edition_id, timezone, slug, start_date, end_date)
    select 'ZZ Öffnungszeiten', e.format_tag, v_ed, 'Europe/Berlin', 'zz-oeffnungszeiten-test', d1, d3
      from event e where e.id = v_vorlage
    returning id, timezone into v_ev, v_tz;
  insert into event_day (event_id, day_date, programme_start, programme_end, sort_order)
    values (v_ev, d1, time '13:00', time '20:30', 1) returning id into v_tag1;
  insert into event_day (event_id, day_date, programme_start, programme_end, sort_order)
    values (v_ev, d2, time '13:00', time '20:30', 2) returning id into v_tag2;
  insert into event_day (event_id, day_date, sort_order)
    values (v_ev, d3, 3) returning id into v_tag3;

  insert into organization (legal_name) values ('ZZ Öffnungszeiten GmbH') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited');
  insert into stage (event_id, name, type, partner_org_id, active)
    values (v_ev, 'ZZ Standbühne Öffnungszeiten', 'partner_booth', v_org, true) returning id into v_buehne;
  insert into stage (event_id, name, type, partner_org_id, active)
    values (v_ev, 'ZZ Tisch Öffnungszeiten', 'interview_table', v_org, true) returning id into v_tisch;
  insert into stage_day (stage_id, event_day_id, open_from, open_to) values (v_buehne, v_tag1, time '12:00', time '20:00');

  -- Der Partner bearbeitet seine Standbühne mit der Rolle aus der Buchung (0058).
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'standbuehne_editor', 'org', v_org);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  if not partner_window_binds(v_buehne) then raise exception 'VORBEDINGUNG: Fenster bindet den Partner nicht'; end if;

  -- 01 Zur Öffnung und bis zum Schluss
  begin
    perform create_slot(v_buehne, (d1 + time '12:00') at time zone v_tz, (d1 + time '12:20') at time zone v_tz);
    v_slot := create_slot(v_buehne, (d1 + time '19:40') at time zone v_tz, (d1 + time '20:00') at time zone v_tz);
    insert into t_res values ('01_oeffnungszeiten', '12:00–12:20 und 19:40–20:00 angelegt (richtig)');
  exception when others then
    insert into t_res values ('01_oeffnungszeiten', 'BUG: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 02 Davor und danach nicht
  begin
    perform create_slot(v_buehne, (d1 + time '11:45') at time zone v_tz, (d1 + time '12:05') at time zone v_tz);
    insert into t_res values ('02a_vor_oeffnung', 'ALLOWED (BUG): Slot vor 12:00');
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_txt = pg_exception_detail;
      insert into t_res values ('02a_vor_oeffnung',
        case when sqlerrm = 'outside_partner_window' and v_txt = '12:00–20:00'
             then 'outside_partner_window, 12:00–20:00 (richtig)' else 'P0001 ' || sqlerrm || ' / ' || coalesce(v_txt, '') end);
    when others then insert into t_res values ('02a_vor_oeffnung', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform create_slot(v_buehne, (d1 + time '19:50') at time zone v_tz, (d1 + time '20:10') at time zone v_tz);
    insert into t_res values ('02b_nach_schluss', 'ALLOWED (BUG): Slot endet nach 20:00');
  exception
    when sqlstate 'P0001' then insert into t_res values ('02b_nach_schluss',
      case when sqlerrm = 'outside_partner_window' then 'outside_partner_window (richtig)' else 'P0001 ' || sqlerrm end);
    when others then insert into t_res values ('02b_nach_schluss', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 03 Verschieben
  begin
    perform move_slot(v_slot, v_buehne, (d1 + time '19:30') at time zone v_tz, (d1 + time '20:00') at time zone v_tz);
    insert into t_res values ('03a_verschieben_innen', 'bis 20:00 verschoben (richtig)');
  exception when others then
    insert into t_res values ('03a_verschieben_innen', 'BUG: ' || sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform move_slot(v_slot, v_buehne, (d1 + time '19:45') at time zone v_tz, (d1 + time '20:15') at time zone v_tz);
    insert into t_res values ('03b_verschieben_raus', 'ALLOWED (BUG): über 20:00 verschoben');
  exception
    when sqlstate 'P0001' then insert into t_res values ('03b_verschieben_raus',
      case when sqlerrm = 'outside_partner_window' then 'outside_partner_window (richtig)' else 'P0001 ' || sqlerrm end);
    when others then insert into t_res values ('03b_verschieben_raus', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 04 Ohne Zeile: Tagesrahmen der Veranstaltung
  begin
    perform create_slot(v_buehne, (d2 + time '12:30') at time zone v_tz, (d2 + time '12:50') at time zone v_tz);
    insert into t_res values ('04a_tagesrahmen_vorher', 'ALLOWED (BUG): vor Programmbeginn 13:00');
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_txt = pg_exception_detail;
      insert into t_res values ('04a_tagesrahmen_vorher',
        case when sqlerrm = 'outside_partner_window' and v_txt = '13:00–20:30'
             then 'outside_partner_window, 13:00–20:30 (richtig)' else 'P0001 ' || sqlerrm || ' / ' || coalesce(v_txt, '') end);
    when others then insert into t_res values ('04a_tagesrahmen_vorher', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform create_slot(v_buehne, (d2 + time '20:00') at time zone v_tz, (d2 + time '20:30') at time zone v_tz);
    insert into t_res values ('04b_tagesrahmen_ende', '20:00–20:30 angelegt (richtig)');
  exception when others then
    insert into t_res values ('04b_tagesrahmen_ende', 'BUG: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 05 Zeile nur mit Kontingent: je Grenze der Tag
  insert into stage_day (stage_id, event_day_id, slot_quota) values (v_buehne, v_tag2, 6);
  select coalesce(to_char(von, 'HH24:MI'), 'null') || '–' || coalesce(to_char(bis, 'HH24:MI'), 'null') into v_txt
    from partner_booth_window(v_buehne, v_tag2);
  insert into t_res values ('05_nur_kontingent',
    case when v_txt = '13:00–20:30' then 'fällt auf den Tag zurück, 13:00–20:30 (richtig)' else 'unerwartet: ' || coalesce(v_txt, 'keine Zeile') end);

  -- 06 Nur ein Beginn, kein Tagesrahmen: Ende 24:00, detail nie NULL; ganz ohne Rahmen keine Grenze
  begin
    perform create_slot(v_buehne, (d3 + time '06:00') at time zone v_tz, (d3 + time '06:20') at time zone v_tz);
    insert into t_res values ('06a_ohne_rahmen', '06:00 ohne jeden Rahmen angelegt (richtig)');
  exception when others then
    insert into t_res values ('06a_ohne_rahmen', 'BUG: ' || sqlstate || ' ' || sqlerrm);
  end;
  insert into stage_day (stage_id, event_day_id, open_from) values (v_buehne, v_tag3, time '10:00');
  begin
    perform create_slot(v_buehne, (d3 + time '09:00') at time zone v_tz, (d3 + time '09:20') at time zone v_tz);
    insert into t_res values ('06b_nur_beginn', 'ALLOWED (BUG): vor 10:00');
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_txt = pg_exception_detail;
      insert into t_res values ('06b_nur_beginn',
        case when sqlerrm = 'outside_partner_window' and v_txt = '10:00–24:00'
             then 'outside_partner_window, 10:00–24:00 (richtig)' else 'P0001 ' || sqlerrm || ' / ' || coalesce(v_txt, '') end);
    when others then insert into t_res values ('06b_nur_beginn', 'BUG (22004?): ' || sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform create_slot(v_buehne, (d3 + time '22:00') at time zone v_tz, (d3 + time '23:30') at time zone v_tz);
    insert into t_res values ('06c_spaet_ohne_ende', '22:00–23:30 ohne Schluss angelegt (richtig)');
  exception when others then
    insert into t_res values ('06c_spaet_ohne_ende', 'BUG: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 07 Admin bindet nicht
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  begin
    perform create_slot(v_buehne, (d1 + time '08:00') at time zone v_tz, (d1 + time '08:30') at time zone v_tz);
    insert into t_res values ('07_admin', 'Admin legt 08:00 an (richtig)');
  exception when others then
    insert into t_res values ('07_admin', 'BUG: Admin gesperrt — ' || sqlstate || ' ' || sqlerrm);
  end;
  delete from role_assignment where person_id = v_pid and role = 'admin';

  -- 08 Nur auf partner_booth
  select partner_window_binds(v_tisch) into v_b;
  select count(*)::integer into v_n from partner_booth_window(v_tisch, v_tag1);
  insert into t_res values ('08_nur_standbuehne',
    case when not v_b and v_n = 0 then 'Interview Table nicht gebunden, keine Zeile (richtig)'
         else 'unerwartet: bindet ' || coalesce(v_b::text, 'null') || ', Zeilen ' || v_n end);
end $$;

insert into t_res
select '09_definer_intern',
       case when not p.prosecdef then 'BUG: nicht SECURITY DEFINER'
            when not coalesce(p.proconfig::text like '%search_path=public, extensions%', false) then 'BUG: search_path nicht fest: ' || coalesce(p.proconfig::text, 'null')
            when has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute')
              then 'ALLOWED (BUG): Helfer öffentlich'
            else 'SECURITY DEFINER, search_path fest, intern (richtig)' end
  from pg_proc p
 where p.oid = 'partner_booth_window(uuid, uuid)'::regprocedure;

select * from t_res order by step;
rollback;
