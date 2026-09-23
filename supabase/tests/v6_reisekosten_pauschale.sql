-- Smoke-Test 0147 (Reisekosten als Pauschale oder per Beleg, SPK-042). Belegt:
--   01 Vorgabe ist `receipts`, ohne Betrag;
--   02 das Team setzt die Pauschale, der Betrag steht in Cent;
--   03 `lump_sum` ohne Betrag wird abgewiesen (22023), und der CHECK haelt
--      dieselbe Regel auch am Schreibweg vorbei;
--   04 eine erfundene Art ⇒ 22023 invalid_expense_mode;
--   05 der Speaker selbst darf die Art **nicht** setzen (42501);
--   06 `expense_eligibility` gibt Art und Betrag mit heraus;
--   07 bei Pauschale werden Positionen abgewiesen (22023
--      lump_sum_no_positions) — die Erfassung ist gesperrt;
--   08 ein Antrag **ohne** Positionen bleibt erlaubt und traegt den
--      Pauschalbetrag: sonst gaebe es keinen Ort fuer die Bankverbindung;
--   09 **bestehende Belege bleiben stehen**, wenn auf Pauschale umgestellt
--      wird (Auflage der Architektur-Session);
--   10 `speaker_detail` traegt Art und Betrag mit — sonst saehe das Team im
--      Admin nicht, was es selbst gesetzt hat.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_profile uuid;
  v_claim uuid; v_json jsonb; v_n integer; v_detail text; v_mode text; v_cents integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';

  select sp.id into v_profile from speaker_profile sp
   where sp.person_id = v_pid and sp.edition_id = v_ed limit 1;
  if v_profile is null then
    insert into speaker_profile (person_id, edition_id) values (v_pid, v_ed) returning id into v_profile;
  end if;
  update speaker_profile
     set travel_costs_covered = true, travel_costs_approved_at = now(),
         expense_mode = 'receipts', expense_lump_sum_cents = null
   where id = v_profile;
  delete from expense_claim where profile_id = v_profile;

  -- 01 · Vorgabe
  select expense_mode, expense_lump_sum_cents into v_mode, v_cents
    from speaker_profile where id = v_profile;
  insert into t_res values ('01_vorgabe',
    case when v_mode = 'receipts' and v_cents is null then 'ok' else 'FEHLER ' || v_mode end);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 05 · der Speaker selbst darf nicht
  begin
    perform set_expense_mode(v_profile, 'lump_sum', 50000);
    insert into t_res values ('05_speaker_darf_nicht', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('05_speaker_darf_nicht', 'abgewiesen ' || sqlstate);
  end;

  -- 09 · erst ein Beleg als Bestand
  v_claim := upsert_expense_claim(jsonb_build_object('positions', jsonb_build_array(
    jsonb_build_object('category', 'train', 'date', '2027-04-15', 'amount_cents', 4200,
                       'description', 'Bahn hin'))));
  select jsonb_array_length(positions) into v_n from expense_claim where id = v_claim;
  insert into t_res values ('09a_beleg_vorher',
    case when v_n = 1 then 'ok, ein Beleg erfasst' else 'FEHLER ' || coalesce(v_n::text, 'null') end);

  -- 02 · das Team stellt um
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_speaker', 'global');
  perform set_expense_mode(v_profile, 'lump_sum', 120000);
  select expense_mode, expense_lump_sum_cents into v_mode, v_cents
    from speaker_profile where id = v_profile;
  insert into t_res values ('02_pauschale_gesetzt',
    case when v_mode = 'lump_sum' and v_cents = 120000 then 'ok, 1200,00 EUR in Cent'
         else 'FEHLER ' || v_mode || '/' || coalesce(v_cents::text, 'null') end);

  -- 03 · ohne Betrag
  begin
    perform set_expense_mode(v_profile, 'lump_sum', null);
    insert into t_res values ('03a_ohne_betrag', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('03a_ohne_betrag', 'abgewiesen ' || sqlstate);
  end;
  begin
    update speaker_profile set expense_mode = 'lump_sum', expense_lump_sum_cents = null
     where id = v_profile;
    insert into t_res values ('03b_check', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('03b_check', 'abgewiesen ' || sqlstate);
  end;

  -- 04 · erfundene Art
  begin
    perform set_expense_mode(v_profile, 'handschlag', null);
    insert into t_res values ('04_erfundene_art', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('04_erfundene_art', 'abgewiesen ' || sqlstate || ' / ' || coalesce(v_detail, '-'));
  end;
  delete from role_assignment where person_id = v_pid;

  -- 09b · der Beleg steht noch
  select jsonb_array_length(positions) into v_n from expense_claim where id = v_claim;
  insert into t_res values ('09b_beleg_bleibt',
    case when v_n = 1 then 'ok, nichts geloescht' else 'FEHLER: Beleg verschwunden' end);

  -- 06 · Auskunft
  v_json := expense_eligibility(v_profile);
  insert into t_res values ('06_auskunft',
    case when v_json->>'mode' = 'lump_sum' and (v_json->>'lump_sum_cents')::integer = 120000
              and (v_json->>'eligible')::boolean
         then 'ok, Art und Betrag dabei, Anspruch bleibt'
         else 'FEHLER ' || v_json::text end);

  -- 07 · Positionen gesperrt
  begin
    perform upsert_expense_claim(jsonb_build_object('positions', jsonb_build_array(
      jsonb_build_object('category', 'taxi', 'date', '2027-04-16', 'amount_cents', 1900,
                         'description', 'Taxi'))));
    insert into t_res values ('07_positionen_gesperrt', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('07_positionen_gesperrt', 'abgewiesen ' || sqlstate);
  end;

  -- 10 · das Team sieht die Art im Detail
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_speaker', 'global');
  v_json := speaker_detail(v_profile);
  insert into t_res values ('10_detail',
    case when v_json->>'expense_mode' = 'lump_sum' and (v_json->>'expense_lump_sum_cents')::integer = 120000
         then 'ok, Art und Betrag im Detail'
         else 'FEHLER ' || coalesce(v_json->>'expense_mode', 'null') end);
  delete from role_assignment where person_id = v_pid;

  -- 08 · Antrag ohne Positionen geht und traegt die Pauschale
  v_claim := upsert_expense_claim(jsonb_build_object('positions', '[]'::jsonb));
  select amount_cents into v_n from expense_claim where id = v_claim;
  insert into t_res values ('08_antrag_ohne_positionen',
    case when v_n = 120000 then 'ok, Pauschale als Betrag'
         else 'FEHLER ' || coalesce(v_n::text, 'null') end);
end $$;
select * from t_res order by step;
rollback;
