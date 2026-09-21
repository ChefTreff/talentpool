-- Smoke-Test 0116 (Branding-Frist und Maße, Welle 6 B5 / PART-043). Belegt:
--   01 die Vorlage `digital_branding` hat jetzt eine Frist (vorher `{}` — derselbe stille
--      Ausfall wie bei der Hackathon-Challenge: kein Countdown, keine Mahnung);
--   02 sie zeigt auf `booth_changes_until` (02.04.2027) — die Datei geht in die Produktion;
--   03 die Maße stehen in der Beschreibung, in beiden Sprachen;
--   04 die Dateiregeln nehmen PDF, PNG und JPG — **kein** SVG und kein ZIP mehr;
--   05 eine neu entstehende Pflicht bekommt die Frist mit;
--   06 eine schon vorhandene wurde nachgezogen;
--   07 mit Frist wird sie auch überfällig — das ist der eigentliche Gewinn.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_oe uuid;
  v_txt text; v_txt2 text; v_due timestamptz; v_soll timestamptz; v_del uuid; v_rules jsonb;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  select due_at into v_soll from deadline where edition_id = v_ed and key = 'booth_changes_until';

  -- 01/02 Frist an der Vorlage
  select due_rule->>'deadline_key' into v_txt from deliverable_template where key = 'digital_branding';
  insert into t_res values ('01_frist_vorhanden',
    case when v_txt is not null then 'Regel gesetzt (richtig)' else 'ohne Frist (FEHLER)' end);
  insert into t_res values ('02_zeigt_auf_messestandfrist',
    case when v_txt = 'booth_changes_until' then 'booth_changes_until (richtig)'
         else 'unerwartet ' || coalesce(v_txt,'leer') end);

  -- 03 Maße in beiden Sprachen
  select description_de, description_en into v_txt, v_txt2 from deliverable_template where key = 'digital_branding';
  insert into t_res values ('03_masse_zweisprachig',
    case when v_txt like '%1920%1080%' and v_txt2 like '%1920%1080%'
         then 'Maße in DE und EN (richtig)' else 'FEHLT' end);

  -- 04 Dateiregeln
  select file_rules into v_rules from deliverable_template where key = 'digital_branding';
  insert into t_res values ('04_dateiregeln',
    case when v_rules->'ext' @> '["pdf","png","jpg"]'::jsonb
              and not (v_rules->'ext' @> '["svg"]'::jsonb)
              and not (v_rules->'ext' @> '["zip"]'::jsonb)
         then 'Bilder ja, SVG und ZIP nein (richtig)'
         else 'unerwartet ' || coalesce(v_rules::text,'null') end);

  -- 05 Neue Pflicht bekommt die Frist
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into organization (legal_name, communication_name, type)
    values ('ZZ Branding GmbH', 'ZZBranding', 'corporate') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status)
    values (v_org, v_ed, 'invited') returning id into v_oe;
  insert into org_product (org_edition_id, product_sku, qty, status) values (v_oe, 'I-95690', 1, 'booked');
  select d.id, d.due_at into v_del, v_due
    from deliverable d join deliverable_template t on t.id = d.template_id
   where d.org_edition_id = v_oe and t.key = 'digital_branding';
  insert into t_res values ('05_neue_pflicht_mit_frist',
    case when v_due = v_soll then 'Frist uebernommen (richtig)'
         else 'unerwartet ' || coalesce(v_due::text,'ohne Frist') end);

  -- 06 Bestand nachgezogen
  update deliverable set due_at = null where id = v_del;
  update deliverable d set due_at = dl.due_at
    from deliverable_template t, org_edition oe, deadline dl
   where d.template_id = t.id and d.org_edition_id = oe.id
     and dl.edition_id = oe.edition_id and dl.key = 'booth_changes_until'
     and t.key = 'digital_branding' and d.due_at is distinct from dl.due_at;
  select due_at into v_due from deliverable where id = v_del;
  insert into t_res values ('06_bestand_nachgezogen',
    case when v_due = v_soll then 'Kopie wieder gefuellt (richtig)'
         else 'unerwartet ' || coalesce(v_due::text,'ohne Frist') end);

  -- 07 Wird jetzt ueberfaellig
  update deliverable set due_at = now() - interval '1 day', status = 'open' where id = v_del;
  perform mark_overdue_deliverables();
  select status into v_txt from deliverable where id = v_del;
  insert into t_res values ('07_wird_ueberfaellig',
    case when v_txt = 'overdue' then 'overdue (richtig — vorher unmoeglich)'
         else 'unerwartet ' || coalesce(v_txt,'leer') end);
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
end $$;

select * from t_res order by step;
rollback;
