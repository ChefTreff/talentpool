-- Smoke-Test (Belege im Dateibereich, PART-065). Nummer offen. Belegt:
--   01 ein Angebot heisst `angebot`, eine gewöhnliche Rechnung `rechnung`, eine Rechnung, auf die
--      eine Messeshop-Bestellung **dieser** Organisation verweist, `messeshop_rechnung`;
--   02 verweist die Bestellung einer **anderen** Organisation auf dieselbe SevDesk-Id, bleibt es
--      hier eine gewöhnliche Rechnung (Vorbedingung: die fremde Referenz existiert);
--   03 Uploads (hier das Logo) stehen nicht in der Belegliste;
--   04 fremde Organisation ⇒ 42501; 05 `anon` gesperrt.
-- Probelauf Bau-Chat 24.09.2026 auf main 917b39f (`sh scripts/db.sh dry-run`, fn-diff: neue Funktion):
-- **5/5 grün**, zurückgerollt.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_fremd uuid; v_oe uuid; v_oe2 uuid;
  v_ord uuid; v_ord2 uuid; v_txt text; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  insert into organization (legal_name) values ('ZZ Belege GmbH') returning id into v_org;
  insert into organization (legal_name) values ('ZZ Fremde Belege GmbH') returning id into v_fremd;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_fremd, v_ed, 'invited') returning id into v_oe2;
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}', 'Geschäftsführung');

  insert into partner_asset (org_edition_id, kind, storage_path, filename, mime)
  values (v_oe, 'offer',   v_ed || '/' || v_org || '/documents/zz1001.pdf', 'zz1001.pdf', 'application/pdf'),
         (v_oe, 'invoice', v_ed || '/' || v_org || '/documents/zz2002.pdf', 'zz2002.pdf', 'application/pdf'),
         (v_oe, 'invoice', v_ed || '/' || v_org || '/documents/zz3003.pdf', 'zz3003.pdf', 'application/pdf'),
         (v_oe, 'logo_vector', v_ed || '/' || v_org || '/logo_vector/zz-logo.svg', 'zz-logo.svg', 'image/svg+xml');
  -- Messeshop-Bestellung dieser Organisation → Rechnung zz3003
  insert into shop_order (org_edition_id, order_no, phase, status) values (v_oe, 'ZZ-BELEG-1', 1, 'completed') returning id into v_ord;
  insert into external_ref (system, object_type, object_id, external_id, meta)
  values ('sevdesk', 'shop_order', v_ord, 'zz3003#ZZ-BELEG-1', jsonb_build_object('invoice_id', 'zz3003', 'order_no', 'ZZ-BELEG-1'));
  -- Bestellung einer anderen Organisation, die auf zz2002 verweist (darf hier nichts ändern)
  insert into shop_order (org_edition_id, order_no, phase, status) values (v_oe2, 'ZZ-BELEG-2', 1, 'completed') returning id into v_ord2;
  insert into external_ref (system, object_type, object_id, external_id, meta)
  values ('sevdesk', 'shop_order', v_ord2, 'zz2002#ZZ-BELEG-2', jsonb_build_object('invoice_id', 'zz2002', 'order_no', 'ZZ-BELEG-2'));
  delete from role_assignment where person_id = v_pid and role = 'admin';

  -- 01/02 Einordnung (als Hauptkontakt)
  select string_agg(d.filename || '=' || d.beleg, ',' order by d.filename) into v_txt
    from my_partner_documents(v_org, v_ed) d;
  insert into t_res values ('01_einordnung',
    case when v_txt = 'zz1001.pdf=angebot,zz2002.pdf=rechnung,zz3003.pdf=messeshop_rechnung'
         then 'Angebot, Rechnung, Messeshop-Rechnung (richtig)' else 'unerwartet: ' || coalesce(v_txt, 'nichts') end);
  select count(*)::integer into v_n from external_ref where object_id = v_ord2 and meta->>'invoice_id' = 'zz2002';
  insert into t_res values ('02_fremde_bestellung_zaehlt_nicht',
    case when v_n <> 1 then 'VORBEDINGUNG: fremde Referenz fehlt — Schritt belegt nichts'
         when v_txt like '%zz2002.pdf=rechnung%' then 'bleibt Rechnung (richtig)'
         else 'ALLOWED (BUG): fremde Bestellung macht die Rechnung zur Messeshop-Rechnung' end);

  -- 03 Uploads nicht in der Belegliste
  select count(*)::integer into v_n from my_partner_documents(v_org, v_ed) d where d.filename = 'zz-logo.svg';
  insert into t_res values ('03_uploads_nicht_dabei', case when v_n = 0 then 'Logo nicht in den Belegen (richtig)' else 'ALLOWED (BUG): Upload als Beleg' end);

  -- 04 Fremde Organisation
  begin
    perform my_partner_documents(v_fremd, v_ed);
    insert into t_res values ('04_fremde_org', 'ALLOWED (BUG)');
  exception
    when sqlstate '42501' then insert into t_res values ('04_fremde_org', '42501 (richtig)');
    when others then insert into t_res values ('04_fremde_org', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
end $$;

insert into t_res
select '05_anon_gesperrt',
       case when has_function_privilege('anon', 'my_partner_documents(uuid, uuid)', 'execute')
            then 'ALLOWED (BUG)' else 'gesperrt (richtig)' end;

select * from t_res order by step;
rollback;
