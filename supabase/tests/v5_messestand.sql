-- Smoke-Test 0094 (Messestand, F10). Belegt:
--   01 die Frist heisst jetzt `booth_changes_until` und steht auf dem 02.04.2027;
--   02 die schon erzeugten Pflichten tragen das **neue** Datum — sonst stünde in
--      der Checkliste weiter der 12.03.;
--   03 die Paketübersicht liefert Fläche, Maß und die Ausstattung aus der
--      Stückliste (nicht aus Fliesstext);
--   04 die Ausstellerliste zeigt nur Stände **mit** Nummer;
--   05 sie ist nicht öffentlich: ohne passende Rolle ⇒ 42501;
--   06 Editionsdateien pflegen ohne Team-/Produktionsrolle ⇒ 42501;
--   07 eine unbekannte Art wird mit `invalid_kind` abgewiesen;
--   08 die Produktion darf Standnummern vergeben (`upsert_booth`);
--   09 keine Grants für `authenticated` auf `edition_file`.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_oe uuid;
  v_n integer; v_txt text; v_ts timestamptz; v_id uuid; v_num numeric;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  delete from staff_user where auth_user_id = v_uid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  select due_at into v_ts from deadline where edition_id = v_ed and key = 'booth_changes_until';
  insert into t_res values ('01_frist',
    case when v_ts = timestamptz '2027-04-02 23:59 Europe/Berlin' then '02.04.2027 (richtig)'
         else 'unerwartet ' || coalesce(v_ts::text, 'fehlt') end);

  select count(*) into v_n
    from deliverable d join deliverable_template t on t.id = d.template_id
   where t.due_rule->>'deadline_key' = 'booth_changes_until'
     and d.due_at <> timestamptz '2027-04-02 23:59 Europe/Berlin';
  insert into t_res values ('02_pflichten_nachgezogen',
    case when v_n = 0 then 'alle auf dem neuen Datum (richtig)' else v_n || ' MIT ALTEM DATUM (BUG)' end);

  -- Partner-Rolle, damit Lesewege offenstehen.
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into organization (legal_name, communication_name, type)
    values ('ZZ Messestand GmbH', 'ZZMesse', 'partner') returning id into v_org;
  insert into org_edition (org_id, edition_id) values (v_org, v_ed) returning id into v_oe;
  insert into org_product (org_edition_id, product_sku, qty) values (v_oe, 'I-50131', 1);

  select area_sqm, size_note, jsonb_array_length(components) into v_num, v_txt, v_n
    from booth_packages() where sku = 'I-50131';
  insert into t_res values ('03_pakete',
    case when v_num = 9.0 and v_txt = '3 m × 3 m' and v_n > 0
         then '9 qm, Maß, ' || v_n || ' Ausstattungszeilen (richtig)'
         else 'unerwartet ' || coalesce(v_num::text, '-') || '/' || coalesce(v_txt, '-') || '/' || coalesce(v_n::text, '-') end);

  -- Stand ohne Nummer: gehört nicht in die Liste.
  perform upsert_booth(v_org, jsonb_build_object('booth_type', 'All-In'), v_ed);
  select count(*) into v_n from exhibitor_list(v_ed) where org_id = v_org;
  perform upsert_booth(v_org, jsonb_build_object('booth_number', 'ZZ-99'), v_ed);
  insert into t_res values ('04_ohne_nummer',
    case when v_n = 0 then 'nicht gelistet (richtig)' else 'GELISTET (BUG)' end);
  select e.booth_number || ' · ' || coalesce(e.package_name_de, 'ohne Paket') into v_txt
    from exhibitor_list(v_ed) e where e.org_id = v_org;
  insert into t_res values ('04b_mit_nummer',
    case when v_txt like 'ZZ-99 · All-Inclusive%' then 'gelistet mit Paket (richtig)'
         else 'unerwartet ' || coalesce(v_txt, 'leer') end);

  -- Ohne Partner-/Speaker-Zielgruppe ist die Liste zu.
  delete from role_assignment where person_id = v_pid;
  begin
    perform count(*) from exhibitor_list(v_ed);
    insert into t_res values ('05_ohne_rolle', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('05_ohne_rolle', 'abgewiesen ' || sqlstate); end;

  begin
    perform set_edition_file(jsonb_build_object(
      'edition_id', v_ed::text, 'kind', 'hallenplan',
      'storage_path', v_ed || '/hallenplan/zz.pdf', 'filename', 'zz.pdf'));
    insert into t_res values ('06_datei_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('06_datei_ohne_recht', 'abgewiesen ' || sqlstate); end;

  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'production_team', 'global');
  begin
    perform set_edition_file(jsonb_build_object(
      'edition_id', v_ed::text, 'kind', 'gibtesnicht',
      'storage_path', v_ed || '/x/zz.pdf', 'filename', 'zz.pdf'));
    insert into t_res values ('07_unbekannte_art', 'ANGENOMMEN (BUG)');
  exception when others then
    insert into t_res values ('07_unbekannte_art', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  v_id := set_edition_file(jsonb_build_object(
    'edition_id', v_ed::text, 'kind', 'hallenplan',
    'storage_path', v_ed || '/hallenplan/zz.pdf', 'filename', 'Hallenplan.pdf',
    'audience', jsonb_build_array('partner')));
  -- Lesen braucht die Zielgruppe, nicht die Schreibrolle: Produktion allein
  -- öffnet `my_kb_audiences()` nicht.
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  select count(*)::integer into v_n from edition_files('partner', v_ed) where id = v_id;
  insert into t_res values ('07b_datei_lesbar',
    case when v_n = 1 then 'sichtbar (richtig)' else 'unerwartet ' || v_n end);

  perform upsert_booth(v_org, jsonb_build_object('booth_number', 'ZZ-100'), v_ed);
  select b.booth_number into v_txt from booth b where b.org_edition_id = v_oe;
  insert into t_res values ('08_produktion_darf',
    case when v_txt = 'ZZ-100' then 'Standnummer gesetzt (richtig)' else 'unerwartet ' || coalesce(v_txt, 'leer') end);

  insert into t_res values ('09_grants',
    case when has_table_privilege('authenticated', 'edition_file', 'select')
         then 'LESBAR (BUG)' else 'kein SELECT (richtig)' end);
end $$;
select * from t_res order by step;
rollback;
