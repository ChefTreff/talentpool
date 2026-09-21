-- Smoke-Test 0134 (Company Tours mit Stopps und Tour Lead, PART-046). Belegt:
--   01 `tour_lead` ist als Kontakttyp erlaubt, ein erfundener Typ weiterhin nicht;
--   01c **die Pflege-RPC kennt ihn auch** — ein neuer Typ steht an drei Stellen (Vokabular,
--      CHECK, Whitelist in `upsert_edition_contact`); ohne die dritte erlaubt die Tabelle
--      ihn und die Oberfläche weist ihn mit 22023 ab (Befund des Admin-Chats, 18.09.);
--   01d die Freelancer-Prüfung aus 20260918105038 ist dabei erhalten geblieben;
--   02 die sechs Touren 2027 stehen mit dem **CCH** als Sammelpunkt (2026 war es die
--      Handelskammer) und der gestaffelten Startzeit;
--   03 je Tour drei Stopps à 90 Minuten, zunächst ohne Partner — das Team vergibt sie;
--   04 ein Partner sieht nur **seinen** Stopp, mit Tour, Sammelpunkt und Tour Lead;
--   05 die Kontaktdaten des Tour Leads kommen mit (Konrads Serviceversprechen) …
--   06 … und ein externer Tour Lead braucht `contract_consent_at`, sonst greift der CHECK;
--   07 der Partner füllt seinen Stopp: die neun Angaben, `filled_at` wird gesetzt;
--   08 Zeiten, Reihenfolge und Zuordnung darf er **nicht** ändern (P0001 `not_editable`);
--   09 gesuchte Profile nur aus dem Vokabular;
--   10 ein fremder Stopp ist zu (42501);
--   11 derselbe Partner kann nicht zweimal auf dieselbe Tour (Unique-Index);
--   12 Tour und Stopp pflegen nur Team/Programm; ein Tour Lead vom falschen Typ wird
--      abgewiesen; die Tabellen haben keine Grants für `authenticated`.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid;
  v_org uuid; v_oe uuid; v_org2 uuid; v_oe2 uuid;
  v_tour uuid; v_stop uuid; v_stop2 uuid; v_lead uuid; v_buddy uuid;
  v_n integer; v_txt text; v_ts timestamptz; v_r record; v_via_rpc uuid;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 Kontakttyp
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  insert into edition_contact (edition_id, type, display_name, email, phone)
    values (v_ed, 'tour_lead', 'ZZ Tourbegleitung', 'zz-tour@chef-treff.de', '+49 40 000000')
    returning id into v_lead;
  insert into t_res values ('01_tour_lead_typ', 'angelegt (richtig)');
  begin
    insert into edition_contact (edition_id, type, display_name, email, phone)
      values (v_ed, 'gibt_es_nicht', 'ZZ Unfug', 'zz-unfug@chef-treff.de', '+49 40 1');
    insert into t_res values ('01b_erfundener_typ', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01b_erfundener_typ', 'abgewiesen ' || sqlstate); end;

  -- 01c Die Pflege-RPC kennt den Typ ebenfalls (sonst: Tabelle ja, Oberflaeche nein).
  begin
    v_via_rpc := upsert_edition_contact(jsonb_build_object(
      'edition_id', v_ed, 'type', 'tour_lead', 'display_name', 'ZZ Lead ueber RPC',
      'email', 'zz-rpc@chef-treff.de', 'phone', '+49 40 6'));
    insert into t_res values ('01c_rpc_kennt_typ',
      case when v_via_rpc is not null then 'ueber die Pflege angelegt (richtig)' else 'FEHLT' end);
  exception when others then
    insert into t_res values ('01c_rpc_kennt_typ', 'ABGEWIESEN (BUG) ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 01d Die Freelancer-Regel aus 20260918105038 gilt weiter: fremde Domain nur mit Einwilligung.
  begin
    perform upsert_edition_contact(jsonb_build_object(
      'edition_id', v_ed, 'type', 'tour_lead', 'display_name', 'ZZ Extern RPC',
      'email', 'zz-extern-rpc@example.org', 'phone', '+49 40 7'));
    insert into t_res values ('01d_freelancer_regel', 'ERLAUBT (BUG): Einwilligung uebergangen');
  exception when others then
    insert into t_res values ('01d_freelancer_regel', 'abgewiesen ' || sqlstate || ' (richtig)');
  end;

  -- 02 Die sechs Touren mit dem CCH
  select count(*)::integer into v_n from company_tour where edition_id = v_ed
   and name in ('Finance','Consulting','Marketing','Logistik','Engineering','Sales');
  insert into t_res values ('02_sechs_touren',
    case when v_n = 6 then 'sechs Touren (richtig)' else 'unerwartet ' || v_n end);
  select count(*)::integer into v_n from company_tour
   where edition_id = v_ed and meeting_point like 'CCH%';
  insert into t_res values ('02b_sammelpunkt_cch',
    case when v_n = 6 then 'alle am CCH (richtig — 2026 war es die Handelskammer)'
         else 'unerwartet ' || v_n end);
  select ct.id into v_tour from company_tour ct where ct.edition_id = v_ed and ct.name = 'Finance';
  select to_char(starts_at at time zone 'Europe/Berlin', 'HH24:MI') into v_txt
    from company_tour where id = v_tour;
  insert into t_res values ('02c_gestaffelter_start',
    case when v_txt = '11:15' then 'Finance startet 11:15 (richtig)' else 'unerwartet ' || coalesce(v_txt,'leer') end);

  -- 03 Drei Stopps je Tour
  select count(*)::integer into v_n from company_tour_stop where tour_id = v_tour;
  insert into t_res values ('03_drei_stopps',
    case when v_n = 3 then 'drei Stopps (richtig)' else 'unerwartet ' || v_n end);
  select count(*)::integer into v_n from company_tour_stop
   where tour_id = v_tour and departure_at - arrival_at = interval '90 minutes';
  insert into t_res values ('03b_neunzig_minuten',
    case when v_n = 3 then 'je 90 Minuten (richtig)' else 'unerwartet ' || v_n end);
  select count(*)::integer into v_n from company_tour_stop where tour_id = v_tour and host_org_id is not null;
  insert into t_res values ('03c_zunaechst_offen',
    case when v_n = 0 then 'kein Partner zugeordnet (richtig)' else 'unerwartet ' || v_n end);

  -- Zwei Partner, einer bekommt einen Stopp
  insert into organization (legal_name, communication_name, type) values ('ZZ Tour GmbH', 'ZZTour', 'corporate') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  insert into organization (legal_name, communication_name, type) values ('ZZ Andere Tour GmbH', 'ZZTour2', 'corporate') returning id into v_org2;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org2, v_ed, 'invited') returning id into v_oe2;
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}');
  select id into v_stop from company_tour_stop where tour_id = v_tour and sort_order = 1;
  select id into v_stop2 from company_tour_stop where tour_id = v_tour and sort_order = 2;
  perform upsert_company_tour_stop(jsonb_build_object('id', v_stop, 'host_org_id', v_org));
  perform upsert_company_tour(jsonb_build_object('id', v_tour, 'lead_contact_id', v_lead));
  delete from role_assignment where person_id = v_pid and role = 'admin';

  -- 04/05 Der Partner sieht seinen Stopp samt Tour Lead
  select count(*)::integer into v_n from partner_company_tour(v_org, v_ed);
  insert into t_res values ('04_nur_eigener_stopp',
    case when v_n = 1 then 'genau ein Stopp (richtig)' else 'unerwartet ' || v_n end);
  select * into v_r from partner_company_tour(v_org, v_ed) limit 1;
  insert into t_res values ('05_tour_lead_sichtbar',
    case when v_r.lead_name = 'ZZ Tourbegleitung' and v_r.lead_email is not null and v_r.lead_phone is not null
              and v_r.meeting_point like 'CCH%'
         then 'Name, Mail, Telefon und Sammelpunkt (richtig)'
         else 'unerwartet ' || coalesce(v_r.lead_name,'ohne Lead') end);

  -- 06 Externer Tour Lead braucht die Einwilligung
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  begin
    insert into edition_contact (edition_id, type, display_name, email, phone)
      values (v_ed, 'tour_lead', 'ZZ Extern', 'zz-extern@example.org', '+49 40 2');
    insert into t_res values ('06_extern_ohne_einwilligung', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('06_extern_ohne_einwilligung', 'abgewiesen ' || sqlstate); end;
  begin
    insert into edition_contact (edition_id, type, display_name, email, phone, contract_consent_at)
      values (v_ed, 'tour_lead', 'ZZ Extern mit Vertrag', 'zz-extern2@example.org', '+49 40 3', current_date);
    insert into t_res values ('06b_extern_mit_einwilligung', 'angelegt (richtig)');
  exception when others then insert into t_res values ('06b_extern_mit_einwilligung', 'ABGEWIESEN (BUG) ' || sqlstate); end;
  delete from role_assignment where person_id = v_pid and role = 'admin';

  -- 07 Der Partner fuellt seinen Stopp
  perform partner_update_tour_stop(v_stop, jsonb_build_object(
    'contact_name', 'ZZ Empfang', 'contact_email', 'empfang@example.org', 'contact_phone', '+49 40 4',
    'address', 'ZZ Firmenstrasse 1, Hamburg', 'time_note', '11:30 bis 14:00',
    'snacks', true, 'notes_public', 'Bitte Personalausweis mitbringen.',
    'photos_allowed', false,
    'target_profile', jsonb_build_object('study_field', jsonb_build_array('business'))));
  select contact_name, filled_at into v_txt, v_ts from company_tour_stop where id = v_stop;
  insert into t_res values ('07_stopp_gefuellt',
    case when v_txt = 'ZZ Empfang' and v_ts is not null then 'Angaben und filled_at (richtig)'
         else 'unerwartet ' || coalesce(v_txt,'leer') end);

  -- 08 Zeiten und Zuordnung sind tabu
  begin
    perform partner_update_tour_stop(v_stop, jsonb_build_object('arrival_at', now()));
    insert into t_res values ('08_zeiten_gesperrt', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('08_zeiten_gesperrt', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  begin
    perform partner_update_tour_stop(v_stop, jsonb_build_object('host_org_id', v_org2));
    insert into t_res values ('08b_zuordnung_gesperrt', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('08b_zuordnung_gesperrt', 'abgewiesen ' || sqlstate); end;

  -- 09 Profile nur aus dem Vokabular
  begin
    perform partner_update_tour_stop(v_stop, jsonb_build_object(
      'target_profile', jsonb_build_object('study_field', jsonb_build_array('gibt_es_nicht'))));
    insert into t_res values ('09_profil_vokabular', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('09_profil_vokabular', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 10 Fremder Stopp
  begin
    perform partner_update_tour_stop(v_stop2, jsonb_build_object('contact_name', 'ZZ Fremd'));
    insert into t_res values ('10_fremder_stopp', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('10_fremder_stopp', 'abgewiesen ' || sqlstate); end;

  -- 11 Zweimal derselbe Partner auf einer Tour
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  begin
    perform upsert_company_tour_stop(jsonb_build_object('id', v_stop2, 'host_org_id', v_org));
    insert into t_res values ('11_zweimal_selbe_tour', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('11_zweimal_selbe_tour', 'abgewiesen ' || sqlstate); end;

  -- 12 Falscher Kontakttyp als Tour Lead
  insert into edition_contact (edition_id, type, display_name, email, phone)
    values (v_ed, 'partner_buddy', 'ZZ Buddy', 'zz-buddy@chef-treff.de', '+49 40 5') returning id into v_buddy;
  begin
    perform upsert_company_tour(jsonb_build_object('id', v_tour, 'lead_contact_id', v_buddy));
    insert into t_res values ('12_falscher_kontakttyp', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('12_falscher_kontakttyp', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  delete from role_assignment where person_id = v_pid and role = 'admin';
  begin
    perform upsert_company_tour(jsonb_build_object('edition_id', v_ed, 'name', 'ZZ Ohne Rolle'));
    insert into t_res values ('12b_pflege_ohne_rolle', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('12b_pflege_ohne_rolle', 'abgewiesen ' || sqlstate); end;
end $$;

-- 12c Keine Grants auf den Tabellen
insert into t_res
select '12c_keine_grants',
       case when has_table_privilege('authenticated', 'company_tour', 'select')
              or has_table_privilege('authenticated', 'company_tour_stop', 'select')
            then 'ALLOWED (BUG)' else 'gelesen wird ueber RPC (richtig)' end;

select * from t_res order by step;
rollback;
