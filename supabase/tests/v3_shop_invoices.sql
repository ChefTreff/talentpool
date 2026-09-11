-- Smoke-Test 0052: SevDesk-Kandidaten je Org (nur completed, ohne Referenz), Positionen über Bestellungen hinweg zusammengefasst, Summen, nur Team;
-- record_shop_invoice schreibt je Bestellung eine Referenz (zweiter Lauf legt nichts doppelt an, Kandidat verschwindet), pending-Bestellung wird abgelehnt,
-- Kontakt-ID an der Org, Referenzliste, Grants auf external_ref.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org_a uuid; v_org_b uuid; v_oe_a uuid; v_oe_b uuid; v_o1 uuid; v_o2 uuid; v_o3 uuid; v_o4 uuid; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid; -- Testperson ohne Vorrechte (Rollback stellt alles wieder her)
  select id into v_ed from event where is_edition and slug = 'fls27';
  insert into organization (legal_name, communication_name, type, address_street, address_zip, address_city, address_country) values ('Rechnung A GmbH', 'RechA', 'corporate', 'Weg 1', '20095', 'Hamburg', 'DE') returning id into v_org_a;
  insert into organization (legal_name, communication_name, type) values ('Rechnung B GmbH', 'RechB', 'corporate') returning id into v_org_b;
  insert into org_edition (org_id, edition_id, onboarding_status, invoice_email, vat_id, po_number) values (v_org_a, v_ed, 'filled', 'buchhaltung@recha.example', 'DE123', 'PO-77') returning id into v_oe_a;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org_b, v_ed, 'invited') returning id into v_oe_b;
  -- Bestellungen: A zwei completed (Phase 1 + 2) + eine pending, B eine completed
  insert into shop_order (org_edition_id, order_no, phase, status, completed_at) values (v_oe_a, 'MS-TEST-0001', 1, 'completed', now()) returning id into v_o1;
  insert into shop_order (org_edition_id, order_no, phase, status, completed_at) values (v_oe_a, 'MS-TEST-0002', 2, 'completed', now()) returning id into v_o2;
  insert into shop_order (org_edition_id, order_no, phase, status) values (v_oe_a, 'MS-TEST-0003', 3, 'pending') returning id into v_o3;
  insert into shop_order (org_edition_id, order_no, phase, status, completed_at) values (v_oe_b, 'MS-TEST-0004', 1, 'completed', now()) returning id into v_o4;
  insert into shop_order_line (order_id, product_sku, name_de, unit, vat_rate, price_net_cents, qty) values
    (v_o1, 'I-11329', 'Gitterbox', 'piece', 7, 31500, 2), (v_o1, 'I-79520', 'Lunchpaket', 'piece', 7, 3500, 3),
    (v_o2, 'I-11329', 'Gitterbox', 'piece', 7, 31500, 1), (v_o3, 'I-79520', 'Lunchpaket', 'piece', 7, 3500, 9),
    (v_o4, 'I-79520', 'Lunchpaket', 'piece', 7, 3500, 2);
  -- Partner ohne Team-Rolle sieht keine Kandidaten
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin
    perform shop_invoice_candidates(v_ed);
    insert into t_res values ('01_user_candidates', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('01_user_candidates', 'rejected ' || sqlstate); end;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into t_res values ('02_candidates', (select count(*)::text || ' orgs=' || string_agg(communication_name, ',' order by communication_name) from shop_invoice_candidates(v_ed) where org_id in (v_org_a, v_org_b)));
  insert into t_res values ('03_candidate_a', (select 'orders=' || array_length(order_ids, 1)::text || ' nos=' || array_to_string(order_nos, ',') || ' positions=' || jsonb_array_length(positions)::text
                                                      || ' gitterbox_qty=' || (select p->>'qty' from jsonb_array_elements(positions) p where p->>'sku' = 'I-11329')
                                                      || ' net=' || net_cents::text || ' vat=' || vat_cents::text || ' gross=' || gross_cents::text
                                                      || ' invoice=' || coalesce(invoice_email, '-') || ' po=' || coalesce(po_number, '-') || ' contact=' || coalesce(sevdesk_contact_id, '-')
                                               from shop_invoice_candidates(v_ed) where org_id = v_org_a));
  -- Referenzen für A: zweiter Lauf legt nichts doppelt an, A verschwindet aus den Kandidaten
  v_n := record_shop_invoice(v_org_a, array[v_o1, v_o2], 'SD-INV-1', 'SD-CONTACT-9', '{"source": "test"}'::jsonb);
  insert into t_res values ('04_recorded', 'n=' || v_n::text || ' refs=' || (select count(*)::text from external_ref where system = 'sevdesk' and object_type = 'shop_order' and object_id in (v_o1, v_o2))
                                            || ' ext_ids=' || (select string_agg(external_id, ',' order by external_id) from external_ref where object_id in (v_o1, v_o2))
                                            || ' org_contact=' || (select coalesce(sevdesk_contact_id, '-') from organization where id = v_org_a));
  v_n := record_shop_invoice(v_org_a, array[v_o1, v_o2], 'SD-INV-1', 'SD-CONTACT-OTHER');
  insert into t_res values ('05_idempotent', 'n=' || v_n::text || ' refs=' || (select count(*)::text from external_ref where object_id in (v_o1, v_o2))
                                              || ' contact_kept=' || (select (sevdesk_contact_id = 'SD-CONTACT-9')::text from organization where id = v_org_a)
                                              || ' candidates_left=' || (select string_agg(communication_name, ',') from shop_invoice_candidates(v_ed) where org_id in (v_org_a, v_org_b)));
  begin
    perform record_shop_invoice(v_org_a, array[v_o3], 'SD-INV-2');
    insert into t_res values ('06_pending_rejected', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('06_pending_rejected', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  begin
    perform record_shop_invoice(v_org_b, array[v_o1], 'SD-INV-3');
    insert into t_res values ('07_foreign_order', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('07_foreign_order', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  perform set_org_sevdesk_contact(v_org_b, 'SD-CONTACT-B');
  insert into t_res values ('08_refs', (select count(*)::text || ' invoice=' || max(sevdesk_invoice_id) || ' contact=' || max(sevdesk_contact_id) || ' nos=' || string_agg(order_no, ',' order by order_no) from shop_invoice_refs(v_ed) where org_id = v_org_a)
                                        || ' org_b_contact=' || (select sevdesk_contact_id from organization where id = v_org_b));
  insert into t_res values ('09_grants', 'ext_ref_select=' || has_table_privilege('authenticated', 'public.external_ref', 'select')::text || ' ext_ref_insert=' || has_table_privilege('authenticated', 'public.external_ref', 'insert')::text
                                          || ' anon=' || has_table_privilege('anon', 'public.external_ref', 'select')::text);
  insert into t_res values ('10_audit', (select string_agg(action || '=' || n::text, ', ' order by action) from (select action, count(*) n from audit_log where (action like 'shop.invoice%' or action like 'org.sevdesk%') and created_at >= now() group by action) s));
end $$;
select * from t_res order by step;
rollback;
