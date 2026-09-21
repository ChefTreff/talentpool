-- Smoke-Test 0132 (Schema „Eure Formate", Welle 6 A1 Teil 1). Belegt:
--   01 `interview_table` steht im Vokabular `session_format`; die vier anderen Formate
--      waren schon da (deshalb prüft der Test sie mit, nicht nur das neue);
--   02 `stage.type` nimmt die zwei neuen Typen an …
--   03 … und weist einen erfundenen weiterhin ab (der CHECK ist die harte Grenze);
--   04 `session.partner_org_id` und `format_details` existieren, Vorgabe `{}`;
--   05 host_org_id und partner_org_id dürfen nicht auf verschiedene Organisationen zeigen;
--   06 der Bestand wurde übernommen: wo ein Gastgeber stand, steht jetzt auch der Partner;
--   07 **Menü:** eine Tisch-Bühne blendet „Standbühne" NICHT ein, eine echte Standbühne schon
--      — ohne die Typ-Bedingung bekäme der Partner einen Punkt, den er nicht gebucht hat;
--   08 **Rechte:** `standbuehne_editor` (Scope org) darf seine Standbühne bearbeiten, aber
--      nicht die Tisch-Bühne derselben Organisation — sonst käme über `can_edit_regie`
--      die Regie dazu;
--   12 der Artikel der Interview Tables (I-66084, Konrad 21.09.) ist angelegt, aktiv, in
--      `stage_products`, mit `format_key` und **ohne** erfundenen Preis — vorher war
--      `interview_table` das einzige Vokabular ohne Produkt, die Seite oeffnete bei niemandem;
--   09 `question_catalog.partner_selectable` mit Vorgabe falsch, `session_question` nimmt
--      `requested_by` und `purpose`;
--   10 das Talk-Flag fällt beim ersten Login des Speakers (Trigger), und zwar nur dann;
--   11 die Hilfsfunktion des Triggers ist für `authenticated` gesperrt.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_summit uuid; v_day uuid;
  v_org uuid; v_org2 uuid; v_oe uuid; v_stage_booth uuid; v_stage_table uuid;
  v_sess uuid; v_n integer; v_txt text; v_j jsonb; v_person uuid; v_prof uuid; v_flag boolean;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_summit from event e where e.edition_id = v_ed and e.slug = 'summit-27';
  select id into v_day from event_day where event_id = v_summit order by sort_order limit 1;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 Vokabular: das neue und die vier, die es schon gab
  select count(*)::integer into v_n from vocab_term
   where vocabulary = 'session_format' and active
     and key in ('interview_table', 'side_event', 'masterclass', 'company_tour', 'keynote');
  insert into t_res values ('01_session_format',
    case when v_n = 5 then 'alle fuenf Formate da (richtig)' else 'unerwartet ' || v_n end);

  -- 02/03 Bühnentypen
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  insert into organization (legal_name, communication_name, type) values ('ZZ Formate GmbH', 'ZZFormate', 'corporate') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  insert into stage (event_id, name, type, partner_org_id, active)
    values (v_summit, 'ZZ Standbuehne', 'partner_booth', v_org, true) returning id into v_stage_booth;
  insert into stage (event_id, name, type, partner_org_id, active)
    values (v_summit, 'ZZ Tisch 1', 'interview_table', v_org, true) returning id into v_stage_table;
  insert into t_res values ('02_neue_buehnentypen', 'interview_table und partner_booth angelegt (richtig)');
  begin
    insert into stage (event_id, name, type, active) values (v_summit, 'ZZ Unfug', 'gibt_es_nicht', true);
    insert into t_res values ('03_erfundener_typ', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('03_erfundener_typ', 'abgewiesen ' || sqlstate); end;

  -- 04 Neue Spalten an der Session
  insert into session (event_id, format, title_de, partner_org_id)
    values (v_summit, 'interview_table', 'ZZ Tischgespraech', v_org) returning id into v_sess;
  select format_details into v_j from session where id = v_sess;
  insert into t_res values ('04_session_spalten',
    case when v_j = '{}'::jsonb then 'format_details leer als Vorgabe (richtig)'
         else 'unerwartet ' || coalesce(v_j::text, 'null') end);

  -- 05 Zwei verschiedene Organisationen an einer Session
  insert into organization (legal_name, communication_name, type) values ('ZZ Andere GmbH', 'ZZAndere', 'corporate') returning id into v_org2;
  begin
    update session set host_org_id = v_org2 where id = v_sess;   -- partner_org_id ist v_org
    insert into t_res values ('05_zwei_orgs', 'ERLAUBT (BUG): host und partner verschieden');
  exception when others then insert into t_res values ('05_zwei_orgs', 'abgewiesen ' || sqlstate); end;

  -- 06 Bestand übernommen: Gastgeber ⇒ auch buchender Partner
  select count(*)::integer into v_n from session
   where host_org_id is not null and partner_org_id is distinct from host_org_id;
  insert into t_res values ('06_bestand_uebernommen',
    case when v_n = 0 then 'keine Session ohne passenden Partner (richtig)' else 'offen: ' || v_n end);

  -- 07 Menü: Tisch-Bühne blendet „Standbühne" nicht ein
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}');
  update stage set active = false where id = v_stage_booth;     -- nur der Tisch bleibt
  delete from role_assignment where person_id = v_pid and role = 'admin';
  v_j := partner_overview(v_org, v_ed);
  insert into t_res values ('07_menue_nur_tisch',
    case when (v_j->>'has_stage')::boolean = false then 'keine Standbuehne im Menue (richtig)'
         else 'ALLOWED (BUG): Tisch blendet die Standbuehne ein' end);
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  update stage set active = true where id = v_stage_booth;
  delete from role_assignment where person_id = v_pid and role = 'admin';
  v_j := partner_overview(v_org, v_ed);
  insert into t_res values ('07b_menue_mit_buehne',
    case when (v_j->>'has_stage')::boolean then 'echte Standbuehne zaehlt (richtig)' else 'FEHLT' end);

  -- 08 Rechte: Standbühne ja, Tisch nein
  insert into role_assignment (person_id, role, scope_type, scope_id)
    values (v_pid, 'standbuehne_editor', 'org', v_org);
  insert into t_res values ('08_rechte_standbuehne',
    case when can_edit_stage(v_stage_booth) then 'darf (richtig)' else 'FEHLT' end);
  insert into t_res values ('08b_rechte_tisch',
    case when can_edit_stage(v_stage_table) then 'ALLOWED (BUG): Tisch ueber die Standbuehnen-Rolle'
         else 'darf nicht (richtig)' end);
  delete from role_assignment where person_id = v_pid and role = 'standbuehne_editor';

  -- 09 Fragen auf Antrag
  select partner_selectable into v_flag from question_catalog limit 1;
  insert into t_res values ('09_partner_selectable',
    case when v_flag = false then 'Vorgabe nein (richtig)' else 'unerwartet ' || coalesce(v_flag::text,'null') end);
  insert into session_question (session_id, label_de, type, requested_by, purpose)
    values (v_sess, 'ZZ Beispielfrage', 'text', v_pid, 'ZZ Zweck der Frage');
  select count(*)::integer into v_n from session_question
   where session_id = v_sess and requested_by = v_pid and purpose is not null and approved_at is null;
  insert into t_res values ('09b_antrag_ohne_freigabe',
    case when v_n = 1 then 'beantragt, nicht freigegeben (richtig)' else 'unerwartet ' || v_n end);

  -- 10 Talk-Flag faellt beim ersten Login
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  insert into person (first_name, last_name) values ('ZZ', 'Speaker') returning id into v_person;
  insert into speaker_profile (person_id, edition_id, created_by_org_id, partner_editable_until_login)
    values (v_person, v_ed, v_org, true) returning id into v_prof;
  -- Eine Änderung, die **nicht** das Anmelden ist, lässt das Flag stehen.
  update person set city = 'ZZ Stadt' where id = v_person;
  select partner_editable_until_login into v_flag from speaker_profile where id = v_prof;
  insert into t_res values ('10_flag_bleibt_ohne_login',
    case when v_flag then 'bleibt gesetzt (richtig)' else 'ALLOWED (BUG): zu frueh gefallen' end);
  -- Das Anmelden lässt es fallen.
  update person set auth_user_id = gen_random_uuid() where id = v_person;
  select partner_editable_until_login into v_flag from speaker_profile where id = v_prof;
  insert into t_res values ('10b_flag_faellt_bei_login',
    case when v_flag = false then 'gefallen (richtig)' else 'ALLOWED (BUG): steht noch' end);
  delete from role_assignment where person_id = v_pid and role = 'admin';
end $$;

-- 12 Der Artikel der Interview Tables (Konrad 21.09.: I-66084) ist angelegt, traegt
--    `format_key = 'interview_table'`, geht an den HubSpot-Abgleich und hat **keinen**
--    erfundenen Preis; ein zweiter Lauf ueberschreibt einen gepflegten Namen nicht.
do $$
declare v_p record; v_n integer;
begin
  select * into v_p from product where sku = 'I-66084';
  if not found then
    -- Ohne Artikel sind die folgenden Schritte aussagelos; ein Test, der dann trotzdem
    -- drei gruene Zeilen schreibt, verdeckt genau den Fehler, den er finden soll.
    insert into t_res values ('12_interview_table_artikel', 'FEHLT — die Seite oeffnet bei niemandem');
    return;
  end if;
  insert into t_res values ('12_interview_table_artikel',
    case when v_p.format_key is distinct from 'interview_table' then 'falscher format_key: ' || coalesce(v_p.format_key, 'null')
         when v_p.category <> 'stage_products' then 'falsche Kategorie: ' || v_p.category
         when not v_p.active then 'inaktiv — der Ingest wiese den Deal mit inactive_sku ab'
         else 'angelegt, aktiv, stage_products (richtig)' end);
  insert into t_res values ('12b_preis_offen',
    case when v_p.net_price_cents is null then 'kein erfundener Preis (richtig — Liste kommt im Oktober)'
         else 'ALLOWED (BUG): Preis ' || v_p.net_price_cents || ' steht drin' end);

  -- Der Abgleich traegt ihn hinaus. products_for_sync prueft is_partner_team(), deshalb
  -- hier die Bedingung der Funktion statt der Funktion selbst.
  insert into t_res values ('12c_geht_an_hubspot',
    case when v_p.source_hubspot and v_p.sku not like 'INI-%'
         then 'source_hubspot (richtig)' else 'bleibt liegen' end);

  -- Zweiter Lauf: gepflegter Name bleibt stehen.
  update product set name_de = 'Von Konrad umbenannt' where sku = 'I-66084';
  insert into product (sku, name_de, name_en, type, category, unit, vat_rate, source_hubspot, active, format_key)
  values ('I-66084', 'Interview Tables', 'Interview tables', 'package', 'stage_products', 'piece', 7, true, true, 'interview_table')
  on conflict (sku) do update set
    format_key = excluded.format_key,
    name_de = coalesce(nullif(product.name_de, ''), excluded.name_de),
    active = true;
  select count(*)::integer into v_n from product where sku = 'I-66084' and name_de = 'Von Konrad umbenannt';
  insert into t_res values ('12d_pflege_gewinnt',
    case when v_n = 1 then 'Konrads Name bleibt (richtig)' else 'ALLOWED (BUG): ueberschrieben' end);
end $$;

-- 11 Trigger-Funktion nicht für die API
insert into t_res
select '11_trigger_gesperrt',
       case when has_function_privilege('authenticated', 'drop_partner_edit_on_login()', 'execute')
            then 'ALLOWED (BUG)' else 'gesperrt (richtig)' end;

select * from t_res order by step;
rollback;
