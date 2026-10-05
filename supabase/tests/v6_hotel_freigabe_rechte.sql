-- Smoke-Test v6_hotel_freigabe_rechte (Vorschlag, Befund Speaker-Chat 05.10.2026, ADM-072):
-- Hotel-Freigaben für das Speaker-Team, mit echtem Rollenwechsel (vor jedem Abschnitt steht, welche Rolle gilt).
--   Ohne Rolle und als Partner-Kontakt weisen hospitality_admin_overview, confirm_hospitality und
--   decline_hospitality mit 42501 ab; Bereichslead Speaker und Programm-Team dürfen bestätigen (mit Mail an den
--   Speaker) und ablehnen; upsert_hospitality_quota bleibt admin-only (Kontingente: Kooperation mit dem Hotel);
--   cancel_hospitality (unverändert) storniert das Team weiterhin. Reisekosten: programme_team verliert den
--   Abschnitt expenses (has_admin_section false, expense_queue 42501), area_lead_speaker behält ihn; die Zeile
--   ist aus admin_section_role verschwunden, hospitality und speakerTickets bleiben beim Programm-Team.
-- Erwartete Ausgabe (Probelauf 05.10.2026): siehe Kopf der Ergebnistabelle unten — jede Zeile ohne „BUG“ ist gut.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_q uuid; v_other uuid; v_sp uuid;
  v_b1 uuid; v_b2 uuid; v_b3 uuid; v_b4 uuid; v_status text; v_by uuid; v_note text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  delete from role_assignment where person_id = v_pid;  -- Testperson ohne Vorrechte (Rollback stellt alles wieder her)
  select id into v_ed from event where is_edition order by start_date limit 1;

  -- Aufbau (als Owner, ohne Rolle der Testperson): ein Hotel-Kontingent, ein Speaker mit Profil und E-Mail,
  -- vier angefragte Buchungen — je eine zum Bestätigen (Lead), Ablehnen (Lead), Stornieren (Lead), Bestätigen (Programm-Team).
  insert into hospitality_quota (edition_id, kind, tier, label_de, label_en, capacity)
    values (v_ed, 'hotel', 'standard', 'ZZ Hotelrechte', 'ZZ Hotelrechte', 5) returning id into v_q;
  insert into person (first_name, last_name) values ('ZZ', 'Hotelspeaker') returning id into v_other;
  insert into person_email (person_id, email, is_primary) values (v_other, 'zz-hotelrechte-' || v_other::text || '@example.com', true);
  insert into speaker_profile (person_id, edition_id, speaker_type, hospitality_status, created_by)
    values (v_other, v_ed, 'panelist', 'requested', v_pid) returning id into v_sp;
  insert into hospitality_booking (quota_id, profile_id, kind, status, guests, created_by) values (v_q, v_sp, 'hotel', 'requested', 1, v_other) returning id into v_b1;
  insert into hospitality_booking (quota_id, profile_id, kind, status, guests, created_by) values (v_q, v_sp, 'hotel', 'requested', 1, v_other) returning id into v_b2;
  insert into hospitality_booking (quota_id, profile_id, kind, status, guests, created_by) values (v_q, v_sp, 'hotel', 'requested', 1, v_other) returning id into v_b3;
  insert into hospitality_booking (quota_id, profile_id, kind, status, guests, created_by) values (v_q, v_sp, 'hotel', 'requested', 1, v_other) returning id into v_b4;
  insert into organization (legal_name) values ('ZZ Hotelrechte GmbH') returning id into v_org;
  insert into t_res values ('01_aufbau', 'quota=1 buchungen=' || (select count(*) from hospitality_booking where quota_id = v_q)::text
                                          || ' offen=' || (select count(*) from hospitality_booking where quota_id = v_q and status = 'requested')::text);

  -- === Rolle: keine ===========================================================================================
  begin perform hospitality_admin_overview(v_ed); insert into t_res values ('02_overview_ohne_rolle', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('02_overview_ohne_rolle', 'rejected ' || sqlstate); end;
  begin perform confirm_hospitality(v_b1, 'ok'); insert into t_res values ('03_confirm_ohne_rolle', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('03_confirm_ohne_rolle', 'rejected ' || sqlstate); end;
  begin perform decline_hospitality(v_b2, 'nein'); insert into t_res values ('04_decline_ohne_rolle', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('04_decline_ohne_rolle', 'rejected ' || sqlstate); end;

  -- === Rolle: partner_contact (nur diese, Scope Organisation) =================================================
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'partner_contact', 'org', v_org);
  begin perform hospitality_admin_overview(v_ed); insert into t_res values ('05_overview_partner', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('05_overview_partner', 'rejected ' || sqlstate); end;
  begin perform confirm_hospitality(v_b1, 'ok'); insert into t_res values ('06_confirm_partner', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('06_confirm_partner', 'rejected ' || sqlstate); end;
  begin perform decline_hospitality(v_b2, 'nein'); insert into t_res values ('07_decline_partner', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('07_decline_partner', 'rejected ' || sqlstate); end;
  insert into t_res values ('07b_unveraendert_nach_abweisung', (select string_agg(status, ',' order by id) from hospitality_booking where quota_id = v_q and id in (v_b1, v_b2)));

  -- === Rolle: area_lead_speaker (nur diese, ohne admin) ======================================================
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_speaker', 'global');
  insert into t_res values ('08_overview_lead', 'gelesen, buchungen_in_unserem_kontingent='
                                                 || (select jsonb_array_length(o.bookings)::text from hospitality_admin_overview(v_ed) o where o.quota_id = v_q));
  perform confirm_hospitality(v_b1, 'Zimmer 101');
  select status, confirmed_by, team_note into v_status, v_by, v_note from hospitality_booking where id = v_b1;
  insert into t_res values ('09_confirm_lead', v_status || ' von_mir=' || (v_by = v_pid)::text || ' note=' || coalesce(v_note, '-')
                            || ' mail=' || (select count(*) from mail_log where template_key = 'hospitality_confirmed' and related_type = 'hospitality_booking' and related_id = v_b1)::text);
  perform decline_hospitality(v_b2, 'Kein Platz mehr');
  select status, team_note into v_status, v_note from hospitality_booking where id = v_b2;
  insert into t_res values ('10_decline_lead', v_status || ' note=' || coalesce(v_note, '-'));
  -- Die Pflicht-Anmerkung beim Ablehnen steht in der Oberfläche (HotelFreigabe), nicht in der Funktion.
  perform cancel_hospitality(v_b4);   -- unverändert: das Team storniert über can_manage_speaker
  insert into t_res values ('11_cancel_lead', (select status from hospitality_booking where id = v_b4));
  begin perform upsert_hospitality_quota(jsonb_build_object('id', v_q, 'capacity', 9)); insert into t_res values ('12_quota_lead', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('12_quota_lead', 'rejected ' || sqlstate); end;
  insert into t_res values ('12b_quota_unveraendert', (select capacity::text from hospitality_quota where id = v_q));

  -- === Rolle: programme_team (nur diese) =====================================================================
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'programme_team', 'global');
  insert into t_res values ('13_overview_programm_team', (select count(*)::text from hospitality_admin_overview(v_ed) o where o.quota_id = v_q) || ' quota gelesen');
  perform confirm_hospitality(v_b3, 'Zimmer 102');
  insert into t_res values ('14_confirm_programm_team', (select status from hospitality_booking where id = v_b3));
  begin perform upsert_hospitality_quota(jsonb_build_object('id', v_q, 'capacity', 9)); insert into t_res values ('15_quota_programm_team', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('15_quota_programm_team', 'rejected ' || sqlstate); end;
  -- Abschnitte (das Programm-Team behält Hotels und Speaker-Tickets, verliert Reisekosten)
  insert into t_res values ('16_programm_team_abschnitte', 'expenses=' || has_admin_section('expenses')::text || ' hospitality=' || has_admin_section('hospitality')::text
                                                           || ' speakerTickets=' || has_admin_section('speakerTickets')::text);
  begin perform expense_queue(); insert into t_res values ('17_expense_queue_programm_team', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('17_expense_queue_programm_team', 'rejected ' || sqlstate); end;

  -- === Rolle: area_lead_speaker (Reisekosten bleiben bei der Bereichsleitung) ================================
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_speaker', 'global');
  insert into t_res values ('18_lead_abschnitte', 'expenses=' || has_admin_section('expenses')::text || ' hospitality=' || has_admin_section('hospitality')::text);
  begin perform expense_queue(); insert into t_res values ('19_expense_queue_lead', 'ok');
  exception when others then insert into t_res values ('19_expense_queue_lead', 'rejected ' || sqlstate || ' (BUG)'); end;

  -- === Rolle: admin ==========================================================================================
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  perform upsert_hospitality_quota(jsonb_build_object('id', v_q, 'capacity', 9));
  insert into t_res values ('20_quota_admin', (select capacity::text from hospitality_quota where id = v_q));
  insert into t_res values ('21_overview_admin', (select count(*)::text from hospitality_admin_overview(v_ed) o where o.quota_id = v_q) || ' quota gelesen');
  insert into t_res values ('22_admin_abschnitte', 'expenses=' || has_admin_section('expenses')::text || ' hospitality=' || has_admin_section('hospitality')::text);

  -- === Spiegel: admin_section_role =============================================================================
  insert into t_res values ('23_spiegel_expenses', (select string_agg(role, ',' order by role) from admin_section_role where section = 'expenses'));
  insert into t_res values ('24_spiegel_hospitality_bleibt', (select string_agg(role, ',' order by role) from admin_section_role where section = 'hospitality'));
end $$;
select * from t_res order by step;
rollback;
