-- Test „Hackathon-Challenge vergibt die Partner-Rolle" (HACK-005,
-- vorschlag/v6_hackathon_challenge_rolle.sql). Belegt:
--   01 I-37220 trägt grants_role = hackathon_partner; die übrigen Hackathon-Produkte keine;
--   02 Buchen der Challenge gibt dem Hauptkontakt die Rolle (org-gebunden) und
--      is_hack_judge() wird wahr (Vorbedingung: vorher falsch);
--   03 Buchen eines anderen Hackathon-Produkts (Logo) gibt keine Rolle;
--   04 Storno der Challenge entzieht die Rolle wieder.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_ed uuid; v_org uuid; v_org2 uuid; v_oe uuid; v_oe2 uuid; v_op uuid;
  v_n integer; v_before boolean; v_after boolean;
begin
  select p.id, p.auth_user_id into v_pid, v_uid from person p where p.auth_user_id is not null and p.deleted_at is null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and coalesce(e.end_date, current_date) >= current_date order by e.start_date limit 1;

  -- 01
  select count(*) into v_n from product where category = 'hackathon' and sku <> 'I-37220' and grants_role is not null;
  insert into t_res values ('01_produkte',
    case when (select grants_role from product where sku = 'I-37220') = 'hackathon_partner' and v_n = 0 then 'ok' else 'FEHLER n=' || v_n end);

  -- Wegwerf-Organisationen mit der Testperson als Hauptkontakt
  insert into organization (legal_name, communication_name, type) values ('Hack Test GmbH', 'HackTest', 'corporate') returning id into v_org;
  insert into organization (legal_name, communication_name, type) values ('Logo Test GmbH', 'LogoTest', 'corporate') returning id into v_org2;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org2, v_ed, 'invited') returning id into v_oe2;
  insert into org_membership (org_id, person_id, roles) values (v_org, v_pid, array['primary_ops']), (v_org2, v_pid, array['primary_ops']);

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  v_before := is_hack_judge();
  perform set_config('request.jwt.claims', null, true);

  -- 03 anderes Hackathon-Produkt zuerst
  insert into org_product (org_edition_id, product_sku, qty, unit_price_cents, status) values (v_oe2, 'I-72503', 1, 0, 'booked');
  select count(*) into v_n from role_assignment
   where person_id = v_pid and role = 'hackathon_partner' and (valid_to is null or valid_to > now());
  insert into t_res values ('03_logo_keine_rolle', case when v_n = 0 then 'ok' else 'ALLOWED (BUG) n=' || v_n end);

  -- 02 Challenge buchen
  insert into org_product (org_edition_id, product_sku, qty, unit_price_cents, status) values (v_oe, 'I-37220', 1, 0, 'booked') returning id into v_op;
  select count(*) into v_n from role_assignment
   where person_id = v_pid and role = 'hackathon_partner' and scope_type = 'org' and scope_id = v_org
     and (valid_to is null or valid_to > now());
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  v_after := is_hack_judge();
  perform set_config('request.jwt.claims', null, true);
  insert into t_res values ('02_challenge_gibt_rolle',
    case when v_n = 1 and not coalesce(v_before, false) and v_after then 'ok'
         else 'FEHLER n=' || v_n || ' vorher=' || coalesce(v_before::text, 'null') || ' nachher=' || coalesce(v_after::text, 'null') end);

  -- 04 Storno
  update org_product set status = 'cancelled' where id = v_op;
  select count(*) into v_n from role_assignment
   where person_id = v_pid and role = 'hackathon_partner' and scope_id = v_org and (valid_to is null or valid_to > now());
  insert into t_res values ('04_storno_entzieht', case when v_n = 0 then 'ok' else 'FEHLER n=' || v_n end);
end $$;
select * from t_res order by step;
rollback;
