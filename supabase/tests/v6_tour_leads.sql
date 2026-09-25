-- Smoke-Test ADM-059 (Tour-Leads im Company-Tours-Abschnitt). Belegt:
--   01 wer **nur** `companyTours` hat, legt eine Begleitung an und aendert sie;
--   02 **und sonst nichts**: ein Speaker-Buddy anlegen ist abgewiesen (42501);
--   03 **kein Umweg**: eine vorhandene Begleitung in einen Speaker-Buddy zu
--      verwandeln ist abgewiesen — sonst koennte man ueber zwei Schritte genau
--      das pflegen, was einem verwehrt ist;
--   04 ein fremder Kontakt (Speaker-Buddy) bleibt unberuehrbar;
--   05 die Einwilligungsregel gilt weiter: fremde Adresse ohne
--      `contract_consent_at` → `contact_consent_required`, mit Datum geht es;
--   06 `area_lead_partner` darf unveraendert alles (das Gate wurde erweitert,
--      nicht ersetzt);
--   07 `company_tour_options` liefert die Begleitung mit Telefon und Adresse,
--      und die Tour laesst sich ihr zuordnen.
-- Der Test vergibt Rollen und legt Kontakte an; alles wird zurueckgerollt.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_lead uuid; v_fremd uuid; v_tour uuid;
  v_opt jsonb; v_txt text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select id into v_ed from event where is_edition and slug = 'fls27';

  -- Ein fremder Kontakt, angelegt ohne Rollenpruefung (Servicekontext).
  perform set_config('request.jwt.claims', '', true);
  insert into edition_contact (edition_id, type, display_name, email, phone)
  values (v_ed, 'speaker_buddy', 'ZZTEST Buddy', 'zztest-buddy@chef-treff.de', '+49 40 000')
  returning id into v_fremd;
  select ct.id into v_tour from company_tour ct where ct.edition_id = v_ed order by ct.name limit 1;

  -- Ab hier: angemeldet, nur der Abschnitt Company Tours
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'production_team', 'global');
  insert into t_res values ('00_nur_abschnitt',
    'companyTours=' || has_admin_section('companyTours')::text
    || ', edition_contacts=' || can_edit_edition_contacts()::text);

  -- 01 Begleitung anlegen und aendern
  begin
    v_lead := upsert_edition_contact(jsonb_build_object(
      'type', 'tour_lead', 'edition_id', v_ed, 'display_name', 'ZZTEST Begleitung',
      'email', 'zztest-tourlead@chef-treff.de', 'phone', '+49 40 111'));
    insert into t_res values ('01a_anlegen', 'ok');
  exception when others then insert into t_res values ('01a_anlegen', 'ABGEWIESEN ' || sqlstate || ' ' || sqlerrm); end;
  begin
    perform upsert_edition_contact(jsonb_build_object('id', v_lead, 'phone', '+49 40 222'));
    insert into t_res values ('01b_aendern', (select phone from edition_contact where id = v_lead));
  exception when others then insert into t_res values ('01b_aendern', 'ABGEWIESEN ' || sqlstate); end;

  -- 02 nichts anderes anlegen
  begin
    perform upsert_edition_contact(jsonb_build_object(
      'type', 'speaker_buddy', 'edition_id', v_ed, 'display_name', 'ZZTEST Verboten',
      'email', 'zztest-verboten@chef-treff.de', 'phone', '+49 40 333'));
    insert into t_res values ('02_fremder_typ', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('02_fremder_typ', 'abgewiesen ' || sqlstate); end;

  -- 03 kein Umweg ueber den Typwechsel
  begin
    perform upsert_edition_contact(jsonb_build_object('id', v_lead, 'type', 'speaker_buddy'));
    insert into t_res values ('03_umweg', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('03_umweg', 'abgewiesen ' || sqlstate); end;
  insert into t_res values ('03b_typ_unveraendert', (select type from edition_contact where id = v_lead));

  -- 04 fremden Kontakt anfassen
  begin
    perform upsert_edition_contact(jsonb_build_object('id', v_fremd, 'display_name', 'ZZTEST geaendert'));
    insert into t_res values ('04_fremder_kontakt', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('04_fremder_kontakt', 'abgewiesen ' || sqlstate); end;

  -- 05 Einwilligung bei fremder Adresse
  begin
    perform upsert_edition_contact(jsonb_build_object(
      'type', 'tour_lead', 'edition_id', v_ed, 'display_name', 'ZZTEST Extern',
      'email', 'zztest-extern@example.org', 'phone', '+49 40 444'));
    insert into t_res values ('05a_ohne_einwilligung', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('05a_ohne_einwilligung', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  begin
    perform upsert_edition_contact(jsonb_build_object(
      'type', 'tour_lead', 'edition_id', v_ed, 'display_name', 'ZZTEST Extern',
      'email', 'zztest-extern@example.org', 'phone', '+49 40 444',
      'contract_consent_at', current_date::text));
    insert into t_res values ('05b_mit_einwilligung', 'ok');
  exception when others then insert into t_res values ('05b_mit_einwilligung', 'ABGEWIESEN ' || sqlstate); end;

  -- 07 Optionen und Zuordnung
  v_opt := company_tour_options(v_ed);
  select (l->>'name') || ' · ' || coalesce(l->>'phone', '-') || ' · ' || coalesce(l->>'email', '-')
    into v_txt from jsonb_array_elements(v_opt->'leads') l where (l->>'id')::uuid = v_lead;
  insert into t_res values ('07a_in_den_optionen', coalesce(v_txt, 'FEHLT (BUG)'));
  if v_tour is not null then
    perform upsert_company_tour(jsonb_build_object('id', v_tour, 'lead_contact_id', v_lead));
    insert into t_res values ('07b_tour_zugeordnet',
      (select coalesce(x.lead_name, '-') from company_tours_admin(v_ed) x where x.tour_id = v_tour));
  else
    insert into t_res values ('07b_tour_zugeordnet', '(keine Tour im Bestand)');
  end if;

  -- 06 die bisherigen Rechte unveraendert
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  begin
    perform upsert_edition_contact(jsonb_build_object('id', v_fremd, 'display_name', 'ZZTEST Buddy neu'));
    insert into t_res values ('06_area_lead', 'darf weiterhin');
  exception when others then insert into t_res values ('06_area_lead', 'ABGEWIESEN ' || sqlstate); end;
end $$;

select * from t_res order by step;
rollback;

-- Lauf 25.09.2026 gegen jqmqvgaiyjudkvtncijw (Probelauf, zurueckgerollt): 12/12 gruen.
--   00 companyTours=true, edition_contacts=false (die Ausgangslage, um die es geht);
--   01a anlegen ok, 01b aendern '+49 40 222';
--   02 fremder Typ abgewiesen 42501; 03 Umweg ueber Typwechsel abgewiesen 42501,
--   03b Typ unveraendert 'tour_lead'; 04 fremder Kontakt abgewiesen 42501;
--   05a ohne Einwilligung abgewiesen 22023 contact_consent_required, 05b mit Datum ok;
--   06 area_lead_partner darf weiterhin;
--   07a in den Optionen mit Telefon und Adresse, 07b Tour zugeordnet.
