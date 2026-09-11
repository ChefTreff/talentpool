-- Smoke-Test 0063: anon hat keine Tabellen-Grants mehr außer select auf vocab_term; authenticated keine Schreib-Grants ohne Policy (Beispiele event, role_assignment,
-- audit_log) und keine Lese-Grants auf Tabellen ohne Lese-Policy (organization, staff_user) — behält aber, was Policies tragen (consent_record insert, person update als Spalten-Grant,
-- product-Spalten ohne Einkaufsdaten). admin_products: Partner-Team ja, sonstiger Staff (production_team) 42501.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid;
  insert into t_res values ('01_anon_tables', 'event=' || has_table_privilege('anon', 'event', 'select')::text || ' person=' || has_table_privilege('anon', 'person', 'select')::text
                                              || ' programme_public=' || has_table_privilege('anon', 'programme_public', 'select')::text || ' vocab=' || has_table_privilege('anon', 'vocab_term', 'select')::text
                                              || ' vocab_write=' || has_table_privilege('anon', 'vocab_term', 'insert')::text);
  insert into t_res values ('02_auth_dead_writes', 'event_insert=' || has_table_privilege('authenticated', 'event', 'insert')::text || ' role_assignment_update=' || has_table_privilege('authenticated', 'role_assignment', 'update')::text
                                                   || ' audit_delete=' || has_table_privilege('authenticated', 'audit_log', 'delete')::text || ' session_update=' || has_table_privilege('authenticated', 'session', 'update')::text);
  insert into t_res values ('03_auth_policy_writes_kept', 'consent_insert=' || has_table_privilege('authenticated', 'consent_record', 'insert')::text || ' person_update_cols=' || has_any_column_privilege('authenticated', 'person', 'update')::text
                                                          || ' interest_insert=' || has_table_privilege('authenticated', 'person_interest', 'insert')::text);
  insert into t_res values ('04_auth_reads', 'organization=' || has_table_privilege('authenticated', 'organization', 'select')::text || ' staff_user=' || has_table_privilege('authenticated', 'staff_user', 'select')::text
                                             || ' event=' || has_table_privilege('authenticated', 'event', 'select')::text || ' product_sku=' || has_column_privilege('authenticated', 'product', 'sku', 'select')::text
                                             || ' product_purchase=' || has_column_privilege('authenticated', 'product', 'purchase_price_cents', 'select')::text);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'production_team', 'global');
  begin
    perform count(*) from admin_products(false);
    insert into t_res values ('05_admin_products_staff', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('05_admin_products_staff', 'rejected ' || sqlstate); end;
  delete from role_assignment where person_id = v_pid and role = 'production_team';
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into t_res values ('06_admin_products_team', (select count(*)::text from admin_products(false)));
end $$;
select * from t_res order by step;
rollback;
