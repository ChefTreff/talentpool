-- Smoke-Test v6_aufraeumen_feldmatrix (20260917183022, Aufräumen aus der Feld-Matrix). Belegt:
--   01 die Spalten sind umgezogen: organization hat description_de/en und kein
--      description mehr, org_edition keine description_de/en, person kein photo_url;
--   02 staff_user und staff_users_without_admin() sind weg;
--   03 keine der drei Speaker-Funktionen kennt photo_url noch; der HubSpot-Ingest
--      schreibt description_de an die Organisation, nichts mehr an die Edition;
--   04 das Partner-Onboarding schreibt die Beschreibung an die Organisation, und die
--      Übersicht liefert sie unter den alten Schlüsseln (edition.description_de) —
--      die Oberfläche merkt nichts;
--   05 die Aussteller-Liste der Event-App liest die Beschreibung aus der Organisation;
--   06 ein neues Speaker-Profil ohne Organisation übernimmt person.employer_name,
--      ein ausdrücklich gesetzter Wert bleibt stehen (Snapshot).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid;
  v_org uuid; v_oe uuid; v_txt text; v_txt2 text; v_n integer; v_p2 uuid; v_sp uuid; v_res jsonb;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 · Spalten.
  select string_agg(table_name || '.' || column_name, ',' order by table_name, column_name) into v_txt
    from information_schema.columns
   where table_schema = 'public'
     and ((table_name = 'organization' and column_name in ('description', 'description_de', 'description_en'))
       or (table_name = 'org_edition' and column_name in ('description_de', 'description_en'))
       or (table_name = 'person' and column_name = 'photo_url'));
  insert into t_res values ('01_spalten',
    case when v_txt = 'organization.description_de,organization.description_en'
         then 'umgezogen (richtig)' else 'unerwartet ' || coalesce(v_txt, 'null') end);

  -- 02 · staff_user.
  insert into t_res values ('02_staff_user',
    case when to_regclass('public.staff_user') is null and to_regprocedure('public.staff_users_without_admin()') is null
         then 'Tabelle und Diagnose weg (richtig)' else 'noch da (BUG)' end);

  -- 03 · Funktionsquellen.
  select count(*)::integer into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('my_speaker_profile', 'speaker_next_steps', 'delete_my_profile') and p.prosrc like '%photo_url%';
  select prosrc into v_txt from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'ingest_partner_deal';
  insert into t_res values ('03_quellen',
    case when v_n = 0 and v_txt like '%description_de, hubspot_id%' and v_txt not like '%description, hubspot_id%'
          and v_txt not like '%invited_at, description_de%'
         then 'photo_url weg, Ingest schreibt an die Organisation (richtig)'
         else 'unerwartet ' || v_n || ' Funktion(en) mit photo_url / Ingest-Text' end);

  -- 04 · Onboarding schreibt an die Organisation; Übersicht liefert alte Schlüssel.
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into organization (legal_name, communication_name, type, partner_category, active)
    values ('Aufraeum Test GmbH', 'Aufraeum Test', 'corporate', 'talent', true) returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  perform update_partner_onboarding(v_org, jsonb_build_object('description_de', 'Wir bauen Brücken.', 'description_en', 'We build bridges.'), v_ed);
  select o.description_de || ' / ' || o.description_en into v_txt from organization o where o.id = v_org;
  v_res := partner_overview(v_org, v_ed);
  insert into t_res values ('04_onboarding',
    case when v_txt = 'Wir bauen Brücken. / We build bridges.'
          and v_res->'edition'->>'description_de' = 'Wir bauen Brücken.'
          and v_res->'org'->>'description_en' = 'We build bridges.'
          and not (v_res->'org' ? 'description')
         then 'an der Organisation, Schlüssel unverändert (richtig)'
         else 'unerwartet ' || coalesce(v_txt, 'null') || ' | ' || coalesce(v_res->'edition'->>'description_de', 'null') end);

  -- 05 · Event-App-Aussteller.
  select x.description_de into v_txt2 from event_app_exhibitors(v_ed) x where x.org_id = v_org;
  insert into t_res values ('05_aussteller',
    case when v_txt2 = 'Wir bauen Brücken.' then 'aus der Organisation (richtig)' else 'unerwartet ' || coalesce(v_txt2, 'null') end);

  -- 06 · Snapshot beim Anlegen.
  insert into person (first_name, last_name, preferred_language, source_first, tier, employer_name)
    values ('Snap', 'Shot', 'de', 'test', 'lead', 'Firma Snapshot AG') returning id into v_p2;
  insert into speaker_profile (person_id, edition_id) values (v_p2, v_ed) returning id, organization_name into v_sp, v_txt;
  insert into t_res values ('06a_vorbelegt',
    case when v_txt = 'Firma Snapshot AG' then 'Arbeitgeber uebernommen (richtig)' else 'unerwartet ' || coalesce(v_txt, 'null') end);
  update person set employer_name = 'Neue Firma GmbH' where id = v_p2;
  select organization_name into v_txt from speaker_profile where id = v_sp;
  insert into t_res values ('06b_snapshot',
    case when v_txt = 'Firma Snapshot AG' then 'Profil bleibt beim Stand der Edition (richtig)' else 'mitgezogen (BUG) ' || coalesce(v_txt, 'null') end);
  delete from speaker_profile where id = v_sp;
  insert into speaker_profile (person_id, edition_id, organization_name) values (v_p2, v_ed, 'Ausdruecklich GmbH') returning organization_name into v_txt;
  insert into t_res values ('06c_ausdruecklich',
    case when v_txt = 'Ausdruecklich GmbH' then 'Eingabe bleibt stehen (richtig)' else 'ueberschrieben (BUG) ' || coalesce(v_txt, 'null') end);
end $$;
select * from t_res order by step;
rollback;
