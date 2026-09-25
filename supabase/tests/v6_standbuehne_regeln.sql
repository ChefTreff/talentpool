-- Smoke-Test (Standbühne: Zeitfenster PART-079, Partner-Status PART-080). Belegt:
-- **Fenster seit PART-090 überholt** (`v6_standbuehne_oeffnungszeiten`, Öffnungszeiten statt
-- „90 Minuten nach Öffnung, Ende 19:00“): die Schritte 01, 02, 04 und 06 prüfen die alte Regel und
-- sind danach rot; der Rest (Partner-Status, Rechte) gilt weiter.
--   01 ein Partner legt keinen Slot vor Öffnung + 90 Minuten an (Tagesrahmen 09:00–20:00 ⇒
--      Fenster 10:30–19:00), P0001 `outside_partner_window` mit dem Fenster im detail;
--   02 keinen, der nach 19:00 endet — auch wenn die Bühne länger offen ist;
--   03 innerhalb des Fensters geht es (Vorbedingung: der Partner darf auf dieser Bühne überhaupt anlegen);
--   04 `move_slot` hält dasselbe Fenster, und ein Verschieben innerhalb geht;
--   05 das Programm-Team darf abweichen (Admin legt 09:00 an);
--   06 das Fenster gilt nur auf `partner_booth`: auf einem Interview Table bindet es nicht; ohne
--      Tagesrahmen gibt es nur das Ende 19:00;
--   07 „Veröffentlichen" prüft vorher, was die Freigabe verlangt (22023 `fields_required` mit den
--      fehlenden Feldern) — danach `review`, `partner_org_id` gesetzt, die Session steht in der
--      Freigabeliste der Programmleitung; ein zweiter Aufruf ändert nichts;
--   08 zurücknehmen setzt `draft`;
--   09 eine Session auf der Standbühne einer fremden Organisation ⇒ 42501;
--   10 `anon` darf die beiden RPCs nicht, `authenticated` schon; die Helfer sind intern.
-- Probelauf der Build-Session am 24.09.2026 gegen die Live-Datenbank (`sh scripts/db.sh dry-run`,
-- alles zurückgerollt, Wegwerf-Organisationen und -Bühnen): 13 von 13 Schritten grün.
-- `create_slot` und `move_slot` nur ergänzt (fn-diff ohne entfernte Zeile).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_summit uuid; v_day uuid; v_tz text; v_datum date;
  v_org uuid; v_fremd uuid; v_buehne uuid; v_tisch uuid; v_fremde_buehne uuid;
  v_slot uuid; v_slot_team uuid; v_fremd_slot uuid; v_se uuid; v_fremd_se uuid;
  v_n integer; v_txt text; v_b boolean;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id, e.timezone into v_summit, v_tz from event e where e.edition_id = v_ed order by e.start_date limit 1;
  select ed.id, ed.day_date into v_day, v_datum from event_day ed where ed.event_id = v_summit order by ed.sort_order limit 1;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  insert into organization (legal_name) values ('ZZ Standbühne GmbH') returning id into v_org;
  insert into organization (legal_name) values ('ZZ Fremde Standbühne GmbH') returning id into v_fremd;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited');
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_fremd, v_ed, 'invited');
  insert into stage (event_id, name, type, partner_org_id, active)
    values (v_summit, 'ZZ Standbühne', 'partner_booth', v_org, true) returning id into v_buehne;
  insert into stage (event_id, name, type, partner_org_id, active)
    values (v_summit, 'ZZ Tisch', 'interview_table', v_org, true) returning id into v_tisch;
  insert into stage (event_id, name, type, partner_org_id, active)
    values (v_summit, 'ZZ Fremde Standbühne', 'partner_booth', v_fremd, true) returning id into v_fremde_buehne;
  insert into stage_day (stage_id, event_day_id, open_from, open_to) values (v_buehne, v_day, time '09:00', time '20:00');
  -- Der Partner bearbeitet seine Standbühne mit der Rolle aus der Buchung (0058).
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'standbuehne_editor', 'org', v_org);

  -- 01 Vor Öffnung + 90 Minuten
  begin
    perform create_slot(v_buehne, (v_datum + time '10:00') at time zone v_tz, (v_datum + time '10:30') at time zone v_tz);
    insert into t_res values ('01_zu_frueh', 'ALLOWED (BUG): Slot vor 10:30');
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_txt = pg_exception_detail;
      insert into t_res values ('01_zu_frueh',
        case when sqlerrm = 'outside_partner_window' and v_txt = '10:30–19:00'
             then 'outside_partner_window, Fenster 10:30–19:00 (richtig)' else 'P0001 ' || sqlerrm || ' / ' || coalesce(v_txt, '') end);
    when others then insert into t_res values ('01_zu_frueh', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 02 Nach 19:00
  begin
    perform create_slot(v_buehne, (v_datum + time '18:45') at time zone v_tz, (v_datum + time '19:15') at time zone v_tz);
    insert into t_res values ('02_zu_spaet', 'ALLOWED (BUG): Slot endet nach 19:00');
  exception
    when sqlstate 'P0001' then insert into t_res values ('02_zu_spaet',
      case when sqlerrm = 'outside_partner_window' then 'outside_partner_window (richtig)' else 'P0001 ' || sqlerrm end);
    when others then insert into t_res values ('02_zu_spaet', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 03 Innerhalb
  begin
    v_slot := create_slot(v_buehne, (v_datum + time '10:30') at time zone v_tz, (v_datum + time '11:00') at time zone v_tz);
    insert into t_res values ('03_im_fenster', 'angelegt (richtig)');
  exception when others then
    insert into t_res values ('03_im_fenster', 'VORBEDINGUNG/BUG: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 04 Verschieben: raus nein, innerhalb ja
  begin
    perform move_slot(v_slot, v_buehne, (v_datum + time '18:45') at time zone v_tz, (v_datum + time '19:30') at time zone v_tz);
    insert into t_res values ('04_verschieben_raus', 'ALLOWED (BUG): nach 19:00 verschoben');
  exception
    when sqlstate 'P0001' then insert into t_res values ('04_verschieben_raus',
      case when sqlerrm = 'outside_partner_window' then 'outside_partner_window (richtig)' else 'P0001 ' || sqlerrm end);
    when others then insert into t_res values ('04_verschieben_raus', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
  perform move_slot(v_slot, v_buehne, (v_datum + time '11:00') at time zone v_tz, (v_datum + time '11:30') at time zone v_tz);
  select (start_at at time zone v_tz)::time::text into v_txt from slot where id = v_slot;
  insert into t_res values ('04b_verschieben_innen', case when v_txt = '11:00:00' then 'verschoben (richtig)' else 'unerwartet ' || coalesce(v_txt, 'null') end);

  -- 05 Das Programm-Team darf abweichen
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  begin
    v_slot_team := create_slot(v_buehne, (v_datum + time '09:00') at time zone v_tz, (v_datum + time '09:30') at time zone v_tz);
    insert into t_res values ('05_team_darf', 'Admin legt 09:00 an (richtig)');
  exception when others then
    insert into t_res values ('05_team_darf', 'BUG: Team gesperrt — ' || sqlstate || ' ' || sqlerrm);
  end;
  delete from role_assignment where person_id = v_pid and role = 'admin';

  -- 06 Nur auf partner_booth; ohne Tagesrahmen nur das Ende
  select partner_window_binds(v_tisch) into v_b;
  select count(*)::integer into v_n from partner_booth_window(v_tisch, v_day);
  delete from stage_day where stage_id = v_buehne;
  select coalesce(von::text, 'null') || '–' || bis::text into v_txt from partner_booth_window(v_buehne, v_day);
  insert into t_res values ('06_nur_standbuehne',
    case when not v_b and v_n = 0 and v_txt = 'null–19:00:00' then 'Tisch nicht gebunden; ohne Rahmen nur 19:00 (richtig)'
         else 'unerwartet: bindet ' || coalesce(v_b::text, 'null') || ', Zeilen ' || v_n || ', Fenster ' || coalesce(v_txt, 'null') end);

  -- 07 Veröffentlichen anfragen
  insert into session (event_id, slot_id, format, title_de, host_org_id, publish_status, tags)
    values (v_summit, v_slot, 'talk', 'ZZ Standtalk', v_org, 'draft', '{}') returning id into v_se;
  begin
    perform partner_request_publish(v_se);
    insert into t_res values ('07_unvollstaendig', 'ALLOWED (BUG): ohne englischen Titel und Beschreibung angefragt');
  exception
    when sqlstate '22023' then
      get stacked diagnostics v_txt = pg_exception_detail;
      insert into t_res values ('07_unvollstaendig',
        case when sqlerrm = 'fields_required' and v_txt like '%title_en%' and v_txt like '%description%'
             then 'fields_required, fehlende Felder genannt (richtig)' else '22023 ' || sqlerrm || ' / ' || coalesce(v_txt, '') end);
    when others then insert into t_res values ('07_unvollstaendig', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
  update session set title_en = 'ZZ Booth talk', description_de = 'ZZ Beschreibung' where id = v_se;
  select partner_request_publish(v_se) into v_txt;
  select count(*)::integer into v_n from session where id = v_se and publish_status = 'review' and partner_org_id = v_org;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  select exists (select 1 from partner_sessions_pending(v_ed) q where q.session_id = v_se) into v_b;
  delete from role_assignment where person_id = v_pid and role = 'admin';
  insert into t_res values ('07b_angefragt',
    case when v_txt = 'review' and v_n = 1 and v_b then 'review, Partner gesetzt, in der Freigabeliste (richtig)'
         else 'unerwartet: ' || coalesce(v_txt, 'null') || ', ' || v_n || ', Liste ' || coalesce(v_b::text, 'null') end);
  select partner_request_publish(v_se) into v_txt;
  insert into t_res values ('07c_zweimal', case when v_txt = 'review' then 'zweiter Aufruf ändert nichts (richtig)' else 'unerwartet ' || coalesce(v_txt, 'null') end);

  -- 08 Zurücknehmen
  select partner_withdraw_publish(v_se) into v_txt;
  insert into t_res values ('08_zuruecknehmen',
    case when v_txt = 'draft' and (select publish_status from session where id = v_se) = 'draft' then 'wieder draft (richtig)'
         else 'unerwartet ' || coalesce(v_txt, 'null') end);

  -- 09 Fremde Standbühne
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
    values (v_fremde_buehne, v_day, (v_datum + time '12:00') at time zone v_tz, (v_datum + time '12:30') at time zone v_tz, 'content', 'requested')
    returning id into v_fremd_slot;
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, host_org_id, publish_status, tags)
    values (v_summit, v_fremd_slot, 'talk', 'ZZ Fremd', 'ZZ Foreign', 'ZZ', v_fremd, 'draft', '{}') returning id into v_fremd_se;
  begin
    perform partner_request_publish(v_fremd_se);
    insert into t_res values ('09_fremde_buehne', 'ALLOWED (BUG)');
  exception
    when sqlstate '42501' then insert into t_res values ('09_fremde_buehne', '42501 (richtig)');
    when others then insert into t_res values ('09_fremde_buehne', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
end $$;

insert into t_res
select '10_rechte',
       case when has_function_privilege('anon', 'partner_request_publish(uuid)', 'execute')
              or has_function_privilege('anon', 'partner_withdraw_publish(uuid)', 'execute')
              then 'ALLOWED (BUG): anon'
            when not has_function_privilege('authenticated', 'partner_request_publish(uuid)', 'execute')
              then 'BUG: authenticated darf nicht anfragen'
            when has_function_privilege('authenticated', 'partner_window_binds(uuid)', 'execute')
              or has_function_privilege('authenticated', 'partner_booth_window(uuid, uuid)', 'execute')
              then 'ALLOWED (BUG): Helfer öffentlich'
            else 'anon gesperrt, authenticated darf, Helfer intern (richtig)' end;

select * from t_res order by step;
rollback;
