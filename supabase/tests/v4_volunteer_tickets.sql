-- Smoke-Test 0084 (Volunteer-Tickets). Belegt:
--   01 Coupon nur für angenommene Volunteers — `applied` taucht in der Warteliste nicht auf;
--   02 `set_volunteer_coupon` ist für Angemeldete dicht (42501), für service_role offen;
--   03 Einlösung über den Coupon (Trigger auf `ticket`);
--   04 Einlösung über Undershop + Person, wenn der Coupon fehlt (Webhook-Fall);
--   05 ein storniertes Ticket löst nichts ein;
--   06 Zusage zurückgenommen ⇒ Coupon `revoked`;
--   07 Erinnerung erst nach sieben Tagen und nur einmal;
--   08 `volunteer_tickets_admin` für Fremde 42501, offene Fälle zuerst.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_ev text; v_prof uuid; v_p2 uuid; v_prof2 uuid;
        v_n integer; v_txt text; v_ticket uuid; v_shop text := 'zztest-undershop-volunteers';
        v_map uuid; v_typ text := 'zztest-vol-typ';
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  delete from staff_user where auth_user_id = v_uid;
  select e.id, e.vivenu_event_id into v_ed, v_ev from event e where e.is_edition and e.slug = 'fls27';

  -- Wegwerf-Profil der Testperson; ein zweites für den Undershop-Weg
  delete from volunteer_profile where person_id = v_pid and edition_id = v_ed;
  insert into volunteer_profile (person_id, edition_id, status)
  values (v_pid, v_ed, 'applied') returning id into v_prof;

  insert into person (first_name, last_name) values ('Zoe', 'Zweitvolunteer') returning id into v_p2;
  insert into volunteer_profile (person_id, edition_id, status, decided_at)
  values (v_p2, v_ed, 'accepted', now()) returning id into v_prof2;

  perform set_edition_volunteer_undershop(v_ed, v_shop);

  -- 01 nur angenommene
  select count(*) into v_n from volunteer_coupons_pending() where profile_id = v_prof;
  insert into t_res values ('01_nur_angenommene',
    'beworben=' || v_n || ' angenommen=' ||
    (select count(*) from volunteer_coupons_pending() where profile_id = v_prof2));

  -- 02 Schreiben als Angemeldete
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin
    perform set_volunteer_coupon(v_prof2, 'issued', 'ZZTEST-CODE', 'zztest-coupon-1');
    insert into t_res values ('02_schreiben_als_person', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('02_schreiben_als_person', 'abgewiesen ' || sqlstate); end;
  perform set_config('request.jwt.claims', null, true);

  perform set_volunteer_coupon(v_prof2, 'issued', 'ZZTEST-CODE', 'zztest-coupon-1');
  select coupon_status || '/' || coupon_code into v_txt from volunteer_profile where id = v_prof2;
  insert into t_res values ('02b_service_role', v_txt);

  -- Tickettyp, damit der Ingest einen Pass-Typ findet
  insert into ticket_type_map (event_id, vivenu_ticket_type_id, vivenu_ticket_name, pass_type)
  values (v_ed, v_typ, 'ZZTEST Volunteer', 'crew') returning id into v_map;

  -- 03 Einlösung über den Coupon
  insert into ticket (event_id, vivenu_ticket_id, vivenu_ticket_type_id, pass_type, status,
                      barcode, vivenu_discount_id, person_id, source)
  values (v_ed, 'zztest-vt-1', v_typ, 'crew', 'valid', 'zztestvt1', 'zztest-coupon-1', v_p2, 'vivenu')
  returning id into v_ticket;
  select coupon_status || ' ticket=' || (ticket_id = v_ticket)::text into v_txt
    from volunteer_profile where id = v_prof2;
  insert into t_res values ('03_einloesung_coupon', v_txt);

  -- 04 Einlösung über Undershop + Person (ohne Coupon im Ticket)
  perform set_volunteer_coupon(v_prof2, 'issued', null, null);
  update volunteer_profile set coupon_status = 'issued', redeemed_at = null, ticket_id = null where id = v_prof2;
  insert into ticket (event_id, vivenu_ticket_id, vivenu_ticket_type_id, pass_type, status,
                      barcode, vivenu_undershop_id, person_id, source)
  values (v_ed, 'zztest-vt-2', v_typ, 'crew', 'valid', 'zztestvt2', v_shop, v_p2, 'vivenu');
  select coupon_status into v_txt from volunteer_profile where id = v_prof2;
  insert into t_res values ('04_einloesung_undershop', v_txt);

  -- 05 storniertes Ticket löst nichts ein
  update volunteer_profile set coupon_status = 'issued', redeemed_at = null, ticket_id = null where id = v_prof2;
  insert into ticket (event_id, vivenu_ticket_id, vivenu_ticket_type_id, pass_type, status,
                      barcode, vivenu_undershop_id, person_id, source)
  values (v_ed, 'zztest-vt-3', v_typ, 'crew', 'cancelled', 'zztestvt3', v_shop, v_p2, 'vivenu');
  select coupon_status into v_txt from volunteer_profile where id = v_prof2;
  insert into t_res values ('05_storno_loest_nicht_ein', v_txt);

  -- 06 Zusage zurückgenommen
  update volunteer_profile set status = 'withdrawn' where id = v_prof2;
  select coupon_status || '/' || coalesce(coupon_code, '(leer)') into v_txt
    from volunteer_profile where id = v_prof2;
  insert into t_res values ('06_zurueckgenommen', v_txt);

  -- 07 Erinnerung: erst nach sieben Tagen, dann einmal
  update volunteer_profile
     set status = 'accepted', coupon_status = 'issued', coupon_issued_at = now() - interval '2 days',
         reminded_at = null, redeemed_at = null
   where id = v_prof2;
  select remind_volunteer_tickets() into v_n;
  update volunteer_profile set coupon_issued_at = now() - interval '8 days' where id = v_prof2;
  insert into t_res values ('07_erinnerung',
    'nach_2_tagen=' || v_n || ' nach_8_tagen=' || remind_volunteer_tickets() ||
    ' nochmal=' || remind_volunteer_tickets());

  -- 08 Team-Liste
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin
    perform volunteer_tickets_admin(v_ed);
    insert into t_res values ('08_liste_fremde', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('08_liste_fremde', 'abgewiesen ' || sqlstate); end;
  insert into role_assignment (person_id, role, scope_type, edition_id, valid_from)
  values (v_pid, 'area_lead_volunteers', 'edition', v_ed, now() - interval '1 day');
  select count(*) into v_n from volunteer_tickets_admin(v_ed);
  insert into t_res values ('08b_liste_team', v_n || ' Zeilen');
end $$;

select * from t_res order by step;
rollback;
