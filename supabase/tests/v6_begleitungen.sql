-- Smoke-Test ADM-060 (Begleitungen loeschen). Belegt:
--   01 wer nur `companyTours` hat, loescht eine Begleitung;
--   02 **und sonst nichts**: ein Speaker-Buddy bleibt unberuehrt (42501);
--   03 die Zuordnung an der Tour loest sich dabei von selbst
--      (`on delete set null`) — und die Zahl der betroffenen Touren steht im
--      Audit-Log, damit nicht erst auffaellt, dass eine Tour ohne Begleitung
--      dasteht, wenn jemand sie aufmacht;
--   04 `company_tour_options` nennt je Begleitung, an wie vielen Touren sie haengt;
--   05 ein unbekannter Schluessel: `contact_not_found` statt stiller Erfolg;
--   06 `area_lead_partner` darf unveraendert alles.
-- Der Test legt Kontakte und eine Tour an und rollt zurueck.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_lead uuid; v_fremd uuid; v_tour uuid;
  v_n integer; v_txt text; v_opt jsonb;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select id into v_ed from event where is_edition and slug = 'fls27';

  perform set_config('request.jwt.claims', '', true);
  insert into edition_contact (edition_id, type, display_name, email, phone)
  values (v_ed, 'tour_lead', 'ZZTEST Begleitung', 'zztest-lead@chef-treff.de', '+49 40 1'),
         (v_ed, 'speaker_buddy', 'ZZTEST Buddy', 'zztest-buddy@chef-treff.de', '+49 40 2');
  select id into v_lead from edition_contact where display_name = 'ZZTEST Begleitung';
  select id into v_fremd from edition_contact where display_name = 'ZZTEST Buddy';
  insert into company_tour (edition_id, name, lead_contact_id)
  values (v_ed, 'ZZTEST Tour fuer Begleitung', v_lead) returning id into v_tour;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'production_team', 'global');
  insert into t_res values ('00_ausgangslage',
    'companyTours=' || has_admin_section('companyTours')::text
    || ', edition_contacts=' || can_edit_edition_contacts()::text);

  -- 04 zuerst: die Liste nennt die Zahl der Touren
  v_opt := company_tour_options(v_ed);
  select coalesce(l->>'tours', '-') into v_txt
    from jsonb_array_elements(v_opt->'leads') l where (l->>'id')::uuid = v_lead;
  insert into t_res values ('04_touren_in_der_liste', coalesce(v_txt, 'FEHLT (BUG)') || ' Tour(en)');

  -- 02 fremder Typ bleibt unberuehrt
  begin
    perform delete_edition_contact(v_fremd);
    insert into t_res values ('02_fremder_typ', 'GELOESCHT (BUG)');
  exception when others then insert into t_res values ('02_fremder_typ', 'abgewiesen ' || sqlstate); end;
  select count(*) into v_n from edition_contact where id = v_fremd;
  insert into t_res values ('02b_noch_da', v_n::text || ' Zeile');

  -- 05 unbekannt
  begin
    perform delete_edition_contact(gen_random_uuid());
    insert into t_res values ('05_unbekannt', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('05_unbekannt', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 01 Begleitung loeschen
  begin
    perform delete_edition_contact(v_lead);
    insert into t_res values ('01_loeschen', 'ok');
  exception when others then insert into t_res values ('01_loeschen', 'ABGEWIESEN ' || sqlstate || ' ' || sqlerrm); end;
  select count(*) into v_n from edition_contact where id = v_lead;
  insert into t_res values ('01b_weg', v_n::text || ' Zeile');

  -- 03 Tour ohne Begleitung, Zahl im Audit
  select case when ct.lead_contact_id is null then 'geloest' else 'HAENGT NOCH (BUG)' end
    into v_txt from company_tour ct where ct.id = v_tour;
  insert into t_res values ('03a_zuordnung', v_txt);
  select coalesce(a.after->>'touren_ohne_begleitung', 'FEHLT (BUG)') into v_txt
    from audit_log a where a.object_type = 'edition_contact' and a.object_id = v_lead::text
    order by a.id desc limit 1;
  insert into t_res values ('03b_audit', v_txt || ' Tour(en) im Audit');

  -- 06 die bisherigen Rechte
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  begin
    perform delete_edition_contact(v_fremd);
    insert into t_res values ('06_area_lead', 'darf weiterhin');
  exception when others then insert into t_res values ('06_area_lead', 'ABGEWIESEN ' || sqlstate); end;
end $$;

select * from t_res order by step;
rollback;

-- Lauf 25.09.2026 gegen jqmqvgaiyjudkvtncijw (Probelauf, zurueckgerollt): 10/10 gruen.
--   00 companyTours=true, edition_contacts=false (die Ausgangslage);
--   01 loeschen ok, 01b 0 Zeilen; 02 fremder Typ abgewiesen 42501, 02b noch da;
--   03a Zuordnung an der Tour geloest, 03b '1 Tour(en) im Audit';
--   04 die Liste nennt '1 Tour(en)'; 05 unbekannt abgewiesen P0002 contact_not_found;
--   06 area_lead_partner darf weiterhin.
