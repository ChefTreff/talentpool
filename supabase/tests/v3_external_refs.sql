-- Smoke-Test 0062: set_external_ref als Upsert (eine Zeile je System×Typ×Objekt, Meta ersetzt), list_external_refs liefert sie; unbekanntes System 22023,
-- ungültiger Typ 22023, leere ID 22023; Partner ohne Team-Rolle 42501 auf beiden.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_oe uuid;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid;
  select id into v_ed from event where is_edition and slug = 'fls27';
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into organization (legal_name, communication_name, type) values ('Ref GmbH', 'Ref', 'corporate') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}');
  perform set_external_ref('sanity', 'partner_logo', v_oe, 'portalPartnerLogo.x', '{"svg_path": "a"}'::jsonb);
  perform set_external_ref('sanity', 'partner_logo', v_oe, 'portalPartnerLogo.x', '{"svg_path": "b"}'::jsonb);
  insert into t_res values ('01_upsert', (select count(*)::text || ' meta=' || max(meta->>'svg_path') from list_external_refs('sanity', 'partner_logo') where object_id = v_oe));
  begin perform set_external_ref('hubspot', 'partner_logo', v_oe, 'x'); insert into t_res values ('02_system', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('02_system', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  begin perform set_external_ref('sanity', 'Partner Logo', v_oe, 'x'); insert into t_res values ('03_type', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('03_type', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  begin perform set_external_ref('sanity', 'partner_logo', v_oe, '  '); insert into t_res values ('04_empty', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('04_empty', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  begin perform set_external_ref('sanity', 'partner_logo', v_oe, 'y'); insert into t_res values ('05_partner_set', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('05_partner_set', 'rejected ' || sqlstate); end;
  begin perform list_external_refs('sanity', 'partner_logo'); insert into t_res values ('06_partner_list', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('06_partner_list', 'rejected ' || sqlstate); end;
end $$;
select * from t_res order by step;
rollback;
