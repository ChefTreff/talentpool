-- Smoke-Test 0082 (Produktion). Belegt:
--   01 Regie-RPCs sind für Fremde dicht (42501), auch lesend;
--   02 ein Cue ohne Slot geht (Doors open, Puffer) — genau der Fall aus der Vorlage;
--   03 Bühne und Tag aus verschiedenen Veranstaltungen ⇒ 22023 invalid_cue;
--   04 Teilupdate lässt weg, was nicht mitkommt;
--   05 `regie_open_slots` meldet nur Slots ohne Cue;
--   06 Stand-Checkliste zeigt gebuchte Positionen, Haken setzt und nimmt;
--   07 Haken auf eine nicht gebuchte Position ⇒ P0002 booth_item_not_found;
--   08 Shop-Artikel ohne Dienstleister ⇒ P0001 supplier_required, unbekannter ⇒ supplier_unknown;
--   09 Tabellen ohne Grants für authenticated;
--   10 Bestellliste je Dienstleister summiert über alle Stände;
--   11 Programm-Team ist nicht Produktion (Review 14.09.): Regie auch lesend dicht;
--   12 ein Slot einer anderen Bühne oder eines anderen Tags ⇒ 22023 invalid_cue.
-- Lauf am 13.09. gegen Frankfurt: alle zehn grün; 14.09. mit 11–12 nach dem Review.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_ev uuid; v_stage uuid; v_day uuid;
        v_fremd uuid; v_fremdtag uuid; v_cue uuid; v_slot uuid; v_oe uuid; v_sku text;
        v_n integer; v_detail text; v_txt text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  delete from staff_user where auth_user_id = v_uid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select s.id, s.event_id into v_stage, v_ev from stage s
    join event e on e.id = s.event_id where e.edition_id = v_ed limit 1;
  select d.id into v_day from event_day d where d.event_id = v_ev order by d.day_date limit 1;

  -- 01 ohne Rolle: dicht, auch lesend
  begin
    perform regie_view(v_stage, v_day);
    insert into t_res values ('01_ohne_rolle', 'ALLOWED (BUG)');
  exception when others then
    insert into t_res values ('01_ohne_rolle', 'abgewiesen ' || sqlstate);
  end;

  -- Scope `edition` verlangt scope_id = NULL und edition_id gesetzt
  -- (role_assignment_scope_chk) — die Edition steht in edition_id, nicht in scope_id.
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, valid_from)
  values (v_pid, 'production_team', 'edition', null, v_ed, now() - interval '1 day');

  -- 02 Cue ohne Slot (Doors open)
  v_cue := upsert_regie_cue(jsonb_build_object(
    'stage_id', v_stage, 'event_day_id', v_day,
    'cue_start', now(), 'cue_end', now() + interval '5 min',
    'action', 'DOORS OPEN', 'regie', 'Licht 100 %'));
  select count(*) into v_n from regie_view(v_stage, v_day) where cue_id = v_cue and slot_id is null;
  insert into t_res values ('02_cue_ohne_slot', case when v_n = 1 then 'ok' else 'FEHLT' end);

  -- 03 Bühne und Tag aus verschiedenen Veranstaltungen
  insert into event (name, slug, format_tag, is_edition, start_date)
  values ('Fremd (Test)', 'fremd-produktion-test', 'club_event', false, current_date) returning id into v_fremd;
  insert into event_day (event_id, day_date, label_de, label_en, sort_order)
  values (v_fremd, current_date, 'Fremdtag', 'Foreign day', 1) returning id into v_fremdtag;
  begin
    perform upsert_regie_cue(jsonb_build_object(
      'stage_id', v_stage, 'event_day_id', v_fremdtag,
      'cue_start', now(), 'cue_end', now(), 'action', 'Falsch'));
    insert into t_res values ('03_fremder_tag', 'ALLOWED (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('03_fremder_tag', 'abgewiesen ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 04 Teilupdate: `regie` bleibt stehen, `action` ändert sich
  perform upsert_regie_cue(jsonb_build_object('id', v_cue, 'action', 'DOORS OPEN (geändert)'));
  select action || ' | ' || coalesce(regie, '(leer)') into v_txt from regie_cue where id = v_cue;
  insert into t_res values ('04_teilupdate', v_txt);

  -- 05 offene Slots: der Cue hängt an keinem, also muss ein vorhandener Slot auftauchen
  select sl.id into v_slot from slot sl where sl.stage_id = v_stage and sl.event_day_id = v_day limit 1;
  if v_slot is not null then
    select count(*) into v_n from regie_open_slots(v_stage, v_day) where slot_id = v_slot;
    perform upsert_regie_cue(jsonb_build_object('id', v_cue, 'slot_id', v_slot));
    insert into t_res values ('05_offene_slots',
      'vorher=' || v_n || ' nachher=' ||
      (select count(*) from regie_open_slots(v_stage, v_day) where slot_id = v_slot));
  else
    insert into t_res values ('05_offene_slots', 'uebersprungen (keine Slots am Tag)');
  end if;

  -- 06 Stand-Checkliste
  select oe.id into v_oe from org_edition oe
    join org_product op on op.org_edition_id = oe.id
    join product p on p.sku = op.product_sku and p.type in ('shop_item','addon')
   where oe.edition_id = v_ed limit 1;
  if v_oe is null then
    insert into t_res values ('06_checkliste', 'uebersprungen (keine gebuchte Position)');
    insert into t_res values ('07_fremde_position', 'uebersprungen');
  else
    select product_sku into v_sku from booth_checklist(v_ed, null)
     where org_edition_id = v_oe limit 1;
    perform set_booth_service_check(v_oe, v_sku, true, 'geprüft im Test');
    select count(*) into v_n from booth_checklist(v_ed, null)
     where org_edition_id = v_oe and product_sku = v_sku and checked;
    perform set_booth_service_check(v_oe, v_sku, false);
    insert into t_res values ('06_checkliste',
      'gehakt=' || v_n || ' danach_offen=' ||
      (select count(*) from booth_checklist(v_ed, null)
        where org_edition_id = v_oe and product_sku = v_sku and not checked));

    -- 07 Haken auf eine nicht gebuchte Position
    begin
      perform set_booth_service_check(v_oe, 'GIBT-ES-NICHT', true);
      insert into t_res values ('07_fremde_position', 'ALLOWED (BUG)');
    exception when others then
      insert into t_res values ('07_fremde_position', 'abgewiesen ' || sqlstate || ' ' || sqlerrm);
    end;
  end if;

  -- 08 Dienstleister-Pflicht
  begin
    insert into product (sku, name_de, type, unit, shop_visible, active)
    values ('ZZTEST-OHNE-SUPPLIER', 'Ohne Dienstleister', 'shop_item', 'Stück', true, true);
    insert into t_res values ('08a_ohne_supplier', 'ALLOWED (BUG)');
  exception when others then
    insert into t_res values ('08a_ohne_supplier', 'abgewiesen ' || sqlstate || ' ' || sqlerrm);
  end;
  begin
    insert into product (sku, name_de, type, unit, shop_visible, active, supplier)
    values ('ZZTEST-FALSCHER-SUPPLIER', 'Falscher Dienstleister', 'shop_item', 'Stück', true, true, 'Gibt-es-nicht');
    insert into t_res values ('08b_unbekannt', 'ALLOWED (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('08b_unbekannt', 'abgewiesen ' || sqlerrm || ' — ' || coalesce(v_detail, ''));
  end;

  -- 09 keine Grants für authenticated
  select count(*) into v_n from information_schema.role_table_grants
   where table_name in ('regie_cue', 'booth_service_check') and grantee in ('anon', 'authenticated');
  insert into t_res values ('09_grants', case when v_n = 0 then 'keine' else v_n || ' (BUG)' end);

  -- 10 Bestellliste je Dienstleister
  select count(*) into v_n from supplier_order_list(v_ed, null);
  insert into t_res values ('10_bestellliste', v_n || ' Positionen');

  -- 11 Programm-Team ist nicht Produktion (Review 14.09.): auch lesend dicht
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, valid_from)
  values (v_pid, 'programme_team', 'edition', null, v_ed, now() - interval '1 day');
  begin
    perform regie_view(v_stage, v_day);
    insert into t_res values ('11_programme_team', 'ALLOWED (BUG)');
  exception when others then
    insert into t_res values ('11_programme_team', 'abgewiesen ' || sqlstate);
  end;
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, valid_from)
  values (v_pid, 'production_team', 'edition', null, v_ed, now() - interval '1 day');

  -- 12 Slot einer anderen Bühne oder eines anderen Tags ⇒ 22023 invalid_cue
  select sl.id into v_slot from slot sl
   where not (sl.stage_id = v_stage and sl.event_day_id = v_day) limit 1;
  if v_slot is null then
    insert into t_res values ('12_fremder_slot', 'uebersprungen (kein fremder Slot)');
  else
    begin
      perform upsert_regie_cue(jsonb_build_object('id', v_cue, 'slot_id', v_slot));
      insert into t_res values ('12_fremder_slot', 'ALLOWED (BUG)');
    exception when others then
      get stacked diagnostics v_detail = pg_exception_detail;
      insert into t_res values ('12_fremder_slot', 'abgewiesen ' || sqlstate || ' ' || coalesce(v_detail, ''));
    end;
  end if;
end $$;

select * from t_res order by step;
rollback;
