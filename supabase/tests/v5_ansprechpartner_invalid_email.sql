-- Smoke-Test 0102 (Ansprechpartner · fremde Mail-Domain als Schlüssel). Belegt:
--   01 fremde Domain beim Anlegen ⇒ 22023 `invalid_email` (vorher nacktes 23514 aus dem CHECK);
--   02 dienstliche Domain in Grossbuchstaben wird angenommen;
--   03 fremde Domain beim Ändern ⇒ 22023 `invalid_email`;
--   04 Ändern ohne Mail lässt die Adresse stehen;
--   05 Pflichtfelder weiterhin 22023 `fields_required`.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_id uuid; v_txt text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, valid_from)
  values (v_pid, 'admin', 'global', null, null, now() - interval '1 hour');

  begin
    perform upsert_edition_contact(jsonb_build_object('edition_id', v_ed, 'type', 'partner_lead',
      'display_name', 'ZZTEST Privat', 'email', 'jemand@gmail.com', 'phone', '+49 40 1'));
    insert into t_res values ('01_fremde_domain_anlegen', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('01_fremde_domain_anlegen', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  v_id := upsert_edition_contact(jsonb_build_object('edition_id', v_ed, 'type', 'partner_lead',
    'display_name', 'ZZTEST Gross', 'email', 'ZZTEST.Mail@Chef-Treff.DE', 'phone', '+49 40 2'));
  insert into t_res values ('02_domain_gross', case when v_id is not null then 'angenommen (richtig)' else 'FEHLT' end);

  begin
    perform upsert_edition_contact(jsonb_build_object('id', v_id::text, 'email', 'privat@web.de'));
    insert into t_res values ('03_fremde_domain_aendern', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('03_fremde_domain_aendern', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  perform upsert_edition_contact(jsonb_build_object('id', v_id::text, 'phone', '+49 40 3'));
  select email::text || '|' || phone into v_txt from edition_contact where id = v_id;
  insert into t_res values ('04_teilupdate', case when v_txt = 'ZZTEST.Mail@Chef-Treff.DE|+49 40 3' then 'Mail bleibt (richtig)' else 'unerwartet ' || v_txt end);

  begin
    perform upsert_edition_contact(jsonb_build_object('edition_id', v_ed, 'type', 'partner_lead', 'display_name', 'ZZTEST Ohne', 'phone', '+49 40 4'));
    insert into t_res values ('05_pflichtfeld', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('05_pflichtfeld', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
end $$;
select * from t_res order by step;
rollback;
-- Lauf am 15.09. nach dem Anwenden (20260915115807): 5/5 gruen.
