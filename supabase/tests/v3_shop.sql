-- Smoke-Test 0048: Messeshop — Katalog (Anfrage-Produkte, Bestand), Phasen aus deadline, Lebenszyklus Entwurf → bestätigt → Bearbeitung → verbindlich/storniert,
-- Bestand nur über das Lagerbuch (Reservierung, Delta bei Änderung, Freigabe bei Storno, out_of_stock), eine aktive Bestellung je Phase, Phase 3 nur late_orderable,
-- phase_closed, Finalisierung idempotent (pending ⇒ completed mit Mail, Entwurf ⇒ cancelled), Anfrage mit interner Mail, Team-Eingriffe, Report nur completed, Grants.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_oe uuid; v_p_add uuid; v_lead uuid; v_o1 uuid; v_o2 uuid; v_o3 uuid; v_json jsonb; v_req uuid; v_detail text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid; -- Testperson ohne Vorrechte (Rollback stellt alles wieder her)
  select id into v_ed from event where is_edition and slug = 'fls27';
  -- Team: Org + Kontakte; Testprodukt mit Bestandsführung (Gitterbox, 3 Stück); ein Partner-Lead für interne Mails
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into organization (legal_name, communication_name, type) values ('Shop Test GmbH', 'ShopTest', 'corporate') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}');
  v_p_add := upsert_partner_contact(v_org, 'add.shop@example.com', 'Addi', 'Tional', '{additional}');
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  perform set_config('request.jwt.claims', '', true);
  update product set track_stock = true, stock_total = 3 where sku = 'I-11329';
  insert into person (first_name, last_name, source_first, tier) values ('Partner', 'Lead', 'portal', 'lead') returning id into v_lead;
  insert into person_email (person_id, email, is_primary, verified) values (v_lead, 'lead.shop@example.com', true, true);
  insert into role_assignment (person_id, role, scope_type) values (v_lead, 'area_lead_partner', 'global');
  -- Partner-Sicht (primary_ops)
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into t_res values ('01_phase', (shop_phase_info(v_org)->>'phase') || ' late_only=' || (shop_phase_info(v_org)->>'late_only'));
  insert into t_res values ('02_catalogue', (select count(*)::text || ' gitterbox=' || max(case when sku = 'I-11329' then 'orderable=' || orderable::text || ' stock=' || coalesce(stock_available::text, '-') end)
                                                    || ' request_only=' || count(*) filter (where request_only)::text || ' request_orderable=' || count(*) filter (where request_only and orderable)::text
                                                    || ' lunch_late=' || max(case when sku = 'I-79520' then late_orderable::text end) from shop_catalogue(v_org)));
  v_o1 := shop_upsert_line(v_org, 'I-11329', 2);
  insert into t_res values ('03_draft', (select status || ' phase=' || phase::text || ' no_ok=' || (order_no ~ '^MS-[0-9]{4}-[0-9]{4}$')::text from shop_order where id = v_o1));
  begin
    perform shop_upsert_line(v_org, 'I-68918', 1);
    insert into t_res values ('04_request_only', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('04_request_only', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  begin
    perform shop_upsert_line(v_org, 'I-00000', 1);
    insert into t_res values ('05_unknown', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('05_unknown', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  perform shop_upsert_line(v_org, 'I-79520', 3);
  insert into t_res values ('06_my_orders', (select count(*)::text || ' lines=' || max(jsonb_array_length(lines))::text || ' net=' || max(net_cents)::text || ' editable=' || max(editable::text) from shop_my_orders(v_org)));
  v_json := shop_confirm(v_o1, 'Bitte an den Stand liefern');
  insert into t_res values ('07_confirmed', (select status || ' note=' || coalesce(note, '-') from shop_order where id = v_o1) || ' net=' || (v_json->>'net_cents') || ' vat=' || (v_json->>'vat_cents')
                                             || ' ledger=' || (select coalesce(sum(delta), 0)::text from stock_ledger where order_id = v_o1)
                                             || ' mails=' || (select count(*)::text from mail_log where template_key = 'shop_order_confirmed' and related_id = v_o1)
                                             || ' lines_in_mail=' || (select ((meta->'vars'->>'lines') like '%Gitterbox%')::text from mail_log where template_key = 'shop_order_confirmed' and related_id = v_o1 limit 1));
  insert into t_res values ('08_stock_after_confirm', (select coalesce(stock_available::text, '-') || ' orderable=' || orderable::text from shop_catalogue(v_org) where sku = 'I-11329'));
  begin
    perform shop_upsert_line(v_org, 'I-79520', 4);
    insert into t_res values ('09_pending_locked', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('09_pending_locked', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  perform shop_edit(v_o1);
  perform shop_upsert_line(v_org, 'I-11329', 4);
  begin
    v_json := shop_confirm(v_o1);
    insert into t_res values ('10_out_of_stock', 'ALLOWED (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('10_out_of_stock', 'rejected ' || sqlstate || ' ' || sqlerrm || ' detail=' || coalesce(v_detail, '-') || ' status=' || (select status from shop_order where id = v_o1));
  end;
  perform shop_upsert_line(v_org, 'I-11329', 3);
  v_json := shop_confirm(v_o1);
  insert into t_res values ('11_reconfirmed', (select status from shop_order where id = v_o1) || ' reserved=' || (select coalesce(-sum(delta), 0)::text from stock_ledger where order_id = v_o1 and product_sku = 'I-11329')
                                               || ' ledger_rows=' || (select count(*)::text from stock_ledger where order_id = v_o1)
                                               || ' stock=' || (select coalesce(stock_available::text, '-') || ' orderable=' || orderable::text from shop_catalogue(v_org) where sku = 'I-11329'));
  perform shop_cancel(v_o1);
  insert into t_res values ('12_cancelled', (select status from shop_order where id = v_o1) || ' stock=' || (select coalesce(stock_available::text, '-') from shop_catalogue(v_org) where sku = 'I-11329')
                                             || ' ledger_sum=' || (select coalesce(sum(delta), 0)::text from stock_ledger where order_id = v_o1));
  -- Neue Bestellung Phase 1 (Lunch-Paket), bestätigt; Phase 1 endet ⇒ nicht mehr bearbeitbar, Entwurf für Phase 2 möglich
  v_o2 := shop_upsert_line(v_org, 'I-79520', 1);
  v_json := shop_confirm(v_o2);
  perform set_config('request.jwt.claims', '', true);
  update deadline set due_at = now() - interval '1 hour' where edition_id = v_ed and key = 'shop_phase_1';
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into t_res values ('13_phase2', (shop_phase_info(v_org)->>'phase') || ' o2_editable=' || (select editable::text from shop_my_orders(v_org) where id = v_o2));
  begin
    perform shop_edit(v_o2);
    insert into t_res values ('14_edit_after_phase', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('14_edit_after_phase', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  v_o3 := shop_upsert_line(v_org, 'I-11329', 1);
  insert into t_res values ('15_phase2_draft', (select phase::text || ' ' || status || ' distinct=' || (v_o3 <> v_o2)::text from shop_order where id = v_o3));
  -- Finalisierung: bestätigte Phase-1-Bestellung wird verbindlich (Mail), Phase-2-Entwurf bleibt; zweiter Lauf tut nichts
  perform set_config('request.jwt.claims', '', true);
  v_json := run_shop_finalization();
  insert into t_res values ('16_finalize', 'completed=' || (v_json->>'completed') || ' cancelled=' || (v_json->>'cancelled') || ' o2=' || (select status from shop_order where id = v_o2) || ' o3=' || (select status from shop_order where id = v_o3)
                                            || ' mails=' || (select count(*)::text from mail_log where template_key = 'shop_order_completed' and related_id = v_o2));
  v_json := run_shop_finalization();
  insert into t_res values ('17_finalize_idempotent', 'completed=' || (v_json->>'completed') || ' cancelled=' || (v_json->>'cancelled'));
  -- Phase 3: nur late_orderable; danach geschlossen
  update deadline set due_at = now() - interval '1 hour' where edition_id = v_ed and key = 'shop_phase_2';
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into t_res values ('18_phase3', (shop_phase_info(v_org)->>'phase') || ' late_only=' || (shop_phase_info(v_org)->>'late_only')
                                          || ' gitterbox_orderable=' || (select orderable::text from shop_catalogue(v_org) where sku = 'I-11329') || ' lunch_orderable=' || (select orderable::text from shop_catalogue(v_org) where sku = 'I-79520'));
  begin
    perform shop_upsert_line(v_org, 'I-11329', 1);
    insert into t_res values ('19_late_only', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('19_late_only', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  perform shop_upsert_line(v_org, 'I-79520', 2);
  insert into t_res values ('20_phase3_order', (select count(*)::text || ' status=' || max(status) from shop_order where org_edition_id = v_oe and phase = 3));
  perform set_config('request.jwt.claims', '', true);
  update deadline set due_at = now() - interval '1 hour' where edition_id = v_ed and key = 'shop_phase_3';
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin
    perform shop_upsert_line(v_org, 'I-79520', 1);
    insert into t_res values ('21_closed', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('21_closed', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  perform set_config('request.jwt.claims', '', true);
  v_json := run_shop_finalization();
  insert into t_res values ('22_finalize_drafts', 'completed=' || (v_json->>'completed') || ' cancelled=' || (v_json->>'cancelled') || ' o3=' || (select status from shop_order where id = v_o3)
                                                   || ' o3_ledger=' || (select coalesce(sum(delta), 0)::text from stock_ledger where order_id = v_o3));
  -- Anfrage-Produkt: Anfrage statt Kauf, interne Mail an den Partner-Lead
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  v_req := shop_request_product(v_org, 'Wir hätten gern eine Cocktailbar am Freitag.', 'I-68918');
  insert into t_res values ('23_request', (select status from shop_request where id = v_req) || ' mail_lead=' || (select count(*)::text from mail_log where template_key = 'shop_request_received' and person_id = v_lead)
                                          || ' product_in_vars=' || (select ((meta->'vars'->>'product') like '%Aperitif%')::text from mail_log where template_key = 'shop_request_received' and person_id = v_lead limit 1));
  -- Team: Übersicht, Support-Eingriff auf verbindlicher Bestellung, Report nur completed, Anfrage beantworten, Storno mit Freigabe
  begin
    perform shop_orders_admin(v_ed);
    insert into t_res values ('24_user_admin', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('24_user_admin', 'rejected ' || sqlstate); end;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into t_res values ('25_admin_orders', (select count(*)::text || ' statuses=' || string_agg(status, ',' order by order_no) || ' org=' || max(org_name) from shop_orders_admin(v_ed) where org_id = v_org));
  perform shop_admin_set_line(v_o2, 'I-79520', 2);
  perform shop_admin_set_line(v_o2, 'I-11329', 1);
  insert into t_res values ('26_admin_line', (select string_agg(product_sku || 'x' || qty::text, ',' order by product_sku) from shop_order_line where order_id = v_o2)
                                             || ' reserved_gb=' || (select coalesce(-sum(delta), 0)::text from stock_ledger where order_id = v_o2 and product_sku = 'I-11329'));
  insert into t_res values ('27_report', (select string_agg(sku || ':' || qty_total::text || ':' || net_total_cents::text || ':' || orders::text, ',' order by sku) from shop_report(v_ed)));
  perform shop_request_answer(v_req, 'Gern, Angebot folgt.', 'answered');
  insert into t_res values ('28_request_answered', (select status || ' answer=' || coalesce(answer, '-') from shop_request where id = v_req) || ' admin_open=' || (select count(*) filter (where status = 'open')::text from shop_requests_admin(v_ed)));
  perform shop_admin_set_status(v_o2, 'cancelled', 'Storno auf Wunsch');
  insert into t_res values ('29_admin_cancel', (select status || ' note=' || coalesce(internal_note, '-') from shop_order where id = v_o2) || ' ledger_sum=' || (select coalesce(sum(delta), 0)::text from stock_ledger where order_id = v_o2)
                                                || ' report_rows=' || (select count(*)::text from shop_report(v_ed)));
  insert into t_res values ('30_grants', 'order_insert=' || has_table_privilege('authenticated', 'public.shop_order', 'insert')::text || ' ledger_select=' || has_table_privilege('authenticated', 'public.stock_ledger', 'select')::text
                                          || ' line_select=' || has_table_privilege('authenticated', 'public.shop_order_line', 'select')::text || ' reconcile_exec=' || has_function_privilege('authenticated', 'shop_reconcile_ledger(uuid,boolean)', 'execute')::text
                                          || ' finalize_exec=' || has_function_privilege('authenticated', 'run_shop_finalization()', 'execute')::text);
  insert into t_res values ('31_audit', (select string_agg(action || '=' || n::text, ', ' order by action) from (select action, count(*) n from audit_log where action like 'shop.%' and created_at >= now() group by action) s));
end $$;
select * from t_res order by step;
rollback;
