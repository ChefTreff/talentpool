-- Smoke-Test 0117 (Backdrop der Challenge Area, Welle 6 B4 / PART-033, PART-052). Belegt:
--   01 die Vorlage `hackathon_backdrop` steht an der Kategorie `hackathon` — nicht an einer
--      einzelnen SKU: wer Challenge, Stand oder Impuls gebucht hat, bekommt die Fläche;
--   02 Konrads Anforderungen stehen vollständig in der Beschreibung, in beiden Sprachen
--      (Schutzrand 100 mm, PDF/X-4, CMYK ISO Coated v2, 62 dpi, Schriften, Beschnitt);
--   03 die Dateiregel prüft, was prüfbar ist: PDF ja, PNG nein;
--   04 sie hängt an der Challenge-Frist (18.03.2027) — die Folie muss produziert werden;
--   05 ein Hackathon-Partner bekommt die Pflicht, ein Partner ohne Hackathon nicht;
--   06 mit Frist wird sie überfällig, wenn sie verstreicht;
--   07 die Rückwand des **Messestands** bleibt davon unberührt (zwei verschiedene Flächen).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_oe uuid; v_org2 uuid; v_oe2 uuid;
  v_txt text; v_txt2 text; v_rules jsonb; v_due timestamptz; v_soll timestamptz; v_del uuid; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  select due_at into v_soll from deadline where edition_id = v_ed and key = 'hackathon_challenge';

  -- 01 An der Kategorie, nicht an einer SKU
  select product_sku, category into v_txt, v_txt2
    from deliverable_template where key = 'hackathon_backdrop';
  insert into t_res values ('01_an_der_kategorie',
    case when v_txt is null and v_txt2 = 'hackathon' then 'Kategorie hackathon, keine SKU (richtig)'
         else 'unerwartet ' || coalesce(v_txt,'null') || '/' || coalesce(v_txt2,'null') end);

  -- 02 Konrads Anforderungen im Text, beide Sprachen
  select description_de, description_en into v_txt, v_txt2
    from deliverable_template where key = 'hackathon_backdrop';
  insert into t_res values ('02_anforderungen_de',
    case when v_txt like '%100 mm%' and v_txt like '%PDF/X-4%' and v_txt like '%ISO Coated v2%'
              and v_txt like '%62 dpi%' and v_txt like '%Beschnitt%'
         then 'Schutzrand, Format, Farbraum, Aufloesung, Beschnitt (richtig)'
         else 'unvollstaendig' end);
  insert into t_res values ('02b_anforderungen_en',
    case when v_txt2 like '%100 mm%' and v_txt2 like '%PDF/X-4%' and v_txt2 like '%ISO Coated v2%'
              and v_txt2 like '%62 dpi%' and v_txt2 like '%bleed%'
         then 'dasselbe auf Englisch (richtig)' else 'unvollstaendig' end);

  -- 03 Dateiregel: nur das Prüfbare
  select file_rules into v_rules from deliverable_template where key = 'hackathon_backdrop';
  insert into t_res values ('03_dateiregel',
    case when v_rules->'ext' = '["pdf"]'::jsonb and not (v_rules->'ext' @> '["png"]'::jsonb)
         then 'nur PDF (richtig — alles andere sieht das Team)'
         else 'unerwartet ' || coalesce(v_rules::text,'null') end);

  -- 04 Frist
  select due_rule->>'deadline_key' into v_txt from deliverable_template where key = 'hackathon_backdrop';
  insert into t_res values ('04_frist',
    case when v_txt = 'hackathon_challenge' then 'an der Challenge-Frist (richtig)'
         else 'unerwartet ' || coalesce(v_txt,'leer') end);

  -- 05 Wer sie bekommt und wer nicht
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into organization (legal_name, communication_name, type)
    values ('ZZ Hack Partner GmbH', 'ZZHackP', 'corporate') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status)
    values (v_org, v_ed, 'invited') returning id into v_oe;
  insert into org_product (org_edition_id, product_sku, qty, status) values (v_oe, 'I-37220', 1, 'booked');
  select d.id, d.due_at into v_del, v_due
    from deliverable d join deliverable_template t on t.id = d.template_id
   where d.org_edition_id = v_oe and t.key = 'hackathon_backdrop';
  insert into t_res values ('05_hackathon_partner',
    case when v_del is not null and v_due = v_soll then 'Pflicht mit Frist (richtig)'
         else 'unerwartet ' || coalesce(v_due::text,'ohne Pflicht') end);

  insert into organization (legal_name, communication_name, type)
    values ('ZZ Nur Stand GmbH', 'ZZNurStand', 'corporate') returning id into v_org2;
  insert into org_edition (org_id, edition_id, onboarding_status)
    values (v_org2, v_ed, 'invited') returning id into v_oe2;
  insert into org_product (org_edition_id, product_sku, qty, status) values (v_oe2, 'I-50131', 1, 'booked');
  select count(*)::integer into v_n from deliverable d join deliverable_template t on t.id = d.template_id
   where d.org_edition_id = v_oe2 and t.key = 'hackathon_backdrop' and d.status <> 'not_required';
  insert into t_res values ('05b_ohne_hackathon',
    case when v_n = 0 then 'keine Pflicht (richtig)' else 'ALLOWED (BUG): ' || v_n end);

  -- 06 Wird ueberfaellig
  update deliverable set due_at = now() - interval '1 day', status = 'open' where id = v_del;
  perform mark_overdue_deliverables();
  select status into v_txt from deliverable where id = v_del;
  insert into t_res values ('06_wird_ueberfaellig',
    case when v_txt = 'overdue' then 'overdue (richtig)' else 'unerwartet ' || coalesce(v_txt,'leer') end);

  -- 07 Die Messestand-Rueckwand ist eine andere Flaeche
  select count(*)::integer into v_n from deliverable d join deliverable_template t on t.id = d.template_id
   where d.org_edition_id = v_oe2 and t.key = 'backdrop_print' and d.status <> 'not_required';
  insert into t_res values ('07_messestand_unberuehrt',
    case when v_n = 1 then 'Standrueckwand weiterhin am Standprodukt (richtig)'
         else 'unerwartet ' || v_n end);
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
end $$;

select * from t_res order by step;
rollback;
