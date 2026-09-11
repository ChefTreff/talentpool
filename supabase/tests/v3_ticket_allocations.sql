-- Smoke-Test 0049: Ticket-Kontingente — nur aus Ticket-Produkten per Trigger, Pass-Typ der Talente-Tickets nach Org-Typ/Onboarding-Wahl, pending_vivenu ohne Code,
-- Menge folgt Buchung, Storno ⇒ disabled/gelöscht, Service-Sicht für die Route (Ticket-Typ-IDs aus ticket_type_map, Undershop der Org), Rückschreiben aus vivenu,
-- Team-Korrektur mit Audit, Anfrage „mehr Tickets" mit interner Mail, Rechte (Partner ohne Admin, authenticated ohne Schreibrechte), set_edition_vivenu nur Team.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_oe uuid; v_lead uuid; v_a_partner uuid; v_a_startup uuid; v_req uuid; v_json jsonb;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid; -- Testperson ohne Vorrechte (Rollback stellt alles wieder her)
  select id into v_ed from event where is_edition and slug = 'fls27';
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin
    perform set_edition_vivenu(v_ed, 'evt-test');
    insert into t_res values ('01_user_set_vivenu', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('01_user_set_vivenu', 'rejected ' || sqlstate); end;
  -- Team: vivenu-Event, Ticket-Typen, Startup-Org mit Hauptkontakt (Testperson)
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  perform set_edition_vivenu(v_ed, 'evt-test');
  insert into ticket_type_map (event_id, vivenu_ticket_type_id, vivenu_ticket_name, pass_type, active) values
    (v_ed, 'tt-partner', 'Partner', 'partner', true), (v_ed, 'tt-startup', 'Startup', 'startup', true), (v_ed, 'tt-talent', 'Talent', 'talent', true), (v_ed, 'tt-old', 'Alt', 'partner', false);
  insert into organization (legal_name, communication_name, type, slug) values ('Ticket Startup UG', 'TixStartup', 'startup', 'tixstartup') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}');
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  perform set_config('request.jwt.claims', '', true);
  insert into person (first_name, last_name, source_first, tier) values ('Partner', 'Lead', 'portal', 'lead') returning id into v_lead;
  insert into person_email (person_id, email, is_primary, verified) values (v_lead, 'lead.tix@example.com', true, true);
  insert into role_assignment (person_id, role, scope_type) values (v_lead, 'area_lead_partner', 'global');
  -- Buchung: 4 Partner-Tickets, 10 Talente-Tickets ⇒ Kontingente partner=4, startup=10 (Org-Typ startup, keine Wahl)
  insert into org_product (org_edition_id, product_sku, qty, unit_price_cents) values (v_oe, 'I-32776', 4, 0), (v_oe, 'I-46500', 10, 0);
  insert into t_res values ('02_allocations', (select string_agg(pass_type || '=' || quantity::text || ':' || status, ',' order by pass_type) || ' oe_set=' || bool_and(org_edition_id = v_oe)::text from org_ticket_allocation where org_id = v_org and event_id = v_ed));
  -- Partner-Sicht: kein Code solange pending, Frist ticket_codes
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into t_res values ('03_my_allocations', (select count(*)::text || ' codes=' || count(coupon_code)::text || ' due=' || to_char(max(codes_due_at) at time zone 'Europe/Berlin', 'DD.MM.YYYY') from my_ticket_allocations(v_org)));
  -- Wahl im Onboarding: talent ⇒ Kontingent wechselt (pending wird ersetzt), zurück auf startup
  perform update_partner_onboarding(v_org, '{"pass_type_choice": "talent"}'::jsonb);
  insert into t_res values ('04_choice_talent', (select string_agg(pass_type || '=' || quantity::text, ',' order by pass_type) from org_ticket_allocation where org_id = v_org and event_id = v_ed));
  perform update_partner_onboarding(v_org, '{"pass_type_choice": "startup"}'::jsonb);
  insert into t_res values ('05_choice_startup', (select string_agg(pass_type || '=' || quantity::text, ',' order by pass_type) from org_ticket_allocation where org_id = v_org and event_id = v_ed));
  perform set_config('request.jwt.claims', '', true);
  -- Menge folgt der Buchung
  update org_product set qty = 6 where org_edition_id = v_oe and product_sku = 'I-32776';
  insert into t_res values ('06_qty_follows', (select quantity::text from org_ticket_allocation where org_id = v_org and event_id = v_ed and pass_type = 'partner'));
  -- Service-Sicht der Route
  insert into t_res values ('07_pending_view', (select count(*)::text || ' event=' || max(vivenu_event_id) || ' partner_tt=' || max(case when pass_type = 'partner' then array_to_string(ticket_type_ids, '+') end)
                                                       || ' startup_tt=' || max(case when pass_type = 'startup' then array_to_string(ticket_type_ids, '+') end) || ' slug=' || max(org_slug) from ticket_allocations_pending() where org_id = v_org));
  select id into v_a_partner from org_ticket_allocation where org_id = v_org and event_id = v_ed and pass_type = 'partner';
  select id into v_a_startup from org_ticket_allocation where org_id = v_org and event_id = v_ed and pass_type = 'startup';
  perform set_ticket_allocation_vivenu(v_a_partner, 'active', 'FLS27-TIX-P-AB12', 'cp-1', 'us-1', 'https://vivenu.dev/e/evt-test/us-1');
  insert into t_res values ('08_vivenu_written', (select status || ' code=' || coalesce(coupon_code, '-') || ' synced=' || (synced_at is not null)::text from org_ticket_allocation where id = v_a_partner)
                                                   || ' pending_left=' || (select count(*)::text from ticket_allocations_pending() where org_id = v_org)
                                                   || ' org_undershop_for_startup=' || (select coalesce(org_undershop_id, '-') from ticket_allocations_pending() where id = v_a_startup));
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into t_res values ('09_partner_sees_code', (select coalesce(coupon_code, '-') || ' url=' || coalesce(undershop_url, '-') from my_ticket_allocations(v_org) where pass_type = 'partner'));
  perform set_config('request.jwt.claims', '', true);
  -- Nachbuchung auf aktivem Kontingent ⇒ Menge 8, erneut zu synchronisieren (Coupon-ID bleibt)
  update org_product set qty = 8 where org_edition_id = v_oe and product_sku = 'I-32776';
  insert into t_res values ('10_active_resync', (select quantity::text || ' ' || status || ' synced_null=' || (synced_at is null)::text || ' coupon=' || coalesce(vivenu_coupon_id, '-') from org_ticket_allocation where id = v_a_partner)
                                                  || ' in_pending=' || (select count(*)::text from ticket_allocations_pending() where id = v_a_partner));
  perform set_ticket_allocation_vivenu(v_a_partner, 'active');
  -- Storno des Ticket-Produkts ⇒ aktives Kontingent disabled (Route schaltet den Coupon ab), pending-Kontingent verschwindet; erneute Buchung ⇒ pending
  update org_product set status = 'cancelled' where org_edition_id = v_oe and product_sku in ('I-32776', 'I-46500');
  insert into t_res values ('11_cancelled', (select string_agg(pass_type || '=' || quantity::text || ':' || status, ',' order by pass_type) from org_ticket_allocation where org_id = v_org and event_id = v_ed)
                                             || ' my_visible=' || (select count(*)::text from (select set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true)) s, lateral my_ticket_allocations(v_org) m));
  perform set_config('request.jwt.claims', '', true);
  update org_product set status = 'booked' where org_edition_id = v_oe and product_sku = 'I-32776';
  insert into t_res values ('12_rebooked', (select quantity::text || ' ' || status || ' coupon_kept=' || (vivenu_coupon_id = 'cp-1')::text from org_ticket_allocation where id = v_a_partner));
  -- Fehler aus vivenu
  perform set_ticket_allocation_vivenu(v_a_partner, 'error', null, null, null, null, 'HTTP 500 coupon');
  insert into t_res values ('13_error', (select status || ' err=' || coalesce(last_error, '-') from org_ticket_allocation where id = v_a_partner));
  -- Team korrigiert manuell
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin
    perform ticket_allocations_admin(v_ed);
    insert into t_res values ('14_user_admin', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('14_user_admin', 'rejected ' || sqlstate); end;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  perform set_ticket_allocation(v_a_partner, 5, 'MANUAL-1', 'https://vivenu.com/e/x', 'active', 'manuell in vivenu angelegt');
  insert into t_res values ('15_admin_set', (select quantity::text || ' ' || status || ' code=' || coupon_code || ' notes=' || coalesce(notes, '-') || ' err=' || coalesce(last_error, '-') from org_ticket_allocation where id = v_a_partner)
                                             || ' admin_rows=' || (select count(*)::text from ticket_allocations_admin(v_ed) where org_id = v_org));
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  -- Anfrage „mehr Tickets" ⇒ shop_request + Mail an den Partner-Lead
  v_req := request_ticket_increase(v_org, 'partner', 3, 'Für unser Standteam');
  insert into t_res values ('16_request', (select status || ' sku=' || coalesce(product_sku, '-') || ' text_ok=' || (text like '3 zusätzliche Tickets (partner).%')::text from shop_request where id = v_req)
                                          || ' mail_lead=' || (select count(*)::text from mail_log where template_key = 'shop_request_received' and person_id = v_lead and related_id = v_req));
  begin
    perform request_ticket_increase(v_org, 'partner', 0);
    insert into t_res values ('17_request_zero', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('17_request_zero', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  insert into t_res values ('18_grants', 'alloc_update=' || has_table_privilege('authenticated', 'public.org_ticket_allocation', 'update')::text || ' alloc_insert=' || has_table_privilege('authenticated', 'public.org_ticket_allocation', 'insert')::text
                                          || ' ttm_insert=' || has_table_privilege('authenticated', 'public.ticket_type_map', 'insert')::text || ' vivenu_rpc_auth=' || has_function_privilege('authenticated', 'set_ticket_allocation_vivenu(uuid,text,text,text,text,text,text)', 'execute')::text
                                          || ' sync_auth=' || has_function_privilege('authenticated', 'sync_ticket_allocations(uuid)', 'execute')::text || ' event_vivenu=' || (select coalesce(vivenu_event_id, '-') from event where id = v_ed));
  insert into t_res values ('19_audit', (select string_agg(action || '=' || n::text, ', ' order by action) from (select action, count(*) n from audit_log where (action like 'ticket.%' or action like 'edition.%') and created_at >= now() group by action) s));
end $$;
select * from t_res order by step;
rollback;
