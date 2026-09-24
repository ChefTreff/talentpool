-- Beleg zu LEAD-016: was ein **reines Editor-Konto** auf fremden Bühnen darf.
--
-- Konrad am 24.09.: er konnte auf jeder Bühne Slots anlegen und verschieben
-- („Super-GAU"). Die Architektur-Session hat geprüft, dass die Datenbank dicht
-- ist — er sah alles, **weil er admin ist**. Dieser Test hält das fest, damit
-- die Aussage nicht auf einem Gedächtnisprotokoll steht:
--   01 `can_edit_stage` sagt zur eigenen Bühne ja;
--   02 und zu einer fremden nein;
--   03 `programme_board` gibt fremde Zeilen mit `can_edit = false` heraus —
--      sichtbar, aber nicht ziehbar;
--   04 `create_slot` auf einer fremden Bühne wird abgewiesen (42501);
--   05 `move_slot` auf eine fremde Bühne ebenso.
--
-- Kein Migrationstest: hier ändert sich nichts an der Datenbank. Der Test
-- belegt den Zustand, auf dem die **Sichtregel** in `Board.tsx` aufsetzt —
-- die Oberfläche verengt, sie ersetzt diese Prüfungen nicht.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_org uuid; v_eigene uuid; v_fremde uuid;
  v_slot uuid; v_n integer; v_start timestamptz;
begin
  -- Ein Konto leihen und zu einem **reinen** Bühnen-Editor machen: alle
  -- anderen Rollen weg, sonst belegt der Test die stärkste statt der gemeinten.
  select p.id, p.auth_user_id into v_pid, v_uid
    from person p where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;

  -- Zwei Bühnen derselben Veranstaltung: eine mit Partner-Org, eine ohne.
  select st.id, st.event_id into v_eigene, v_org
    from stage st order by st.created_at limit 1;
  select st.id into v_fremde from stage st
   where st.id <> v_eigene and st.event_id = (select event_id from stage where id = v_eigene)
   limit 1;
  if v_fremde is null then
    insert into stage (event_id, name) select event_id, 'Testbühne 016' from stage where id = v_eigene
      returning id into v_fremde;
  end if;

  -- Die eigene Bühne einer Organisation zuordnen und die Person zum Editor
  -- **dieser** Organisation machen — mehr nicht.
  select o.id into v_org from organization o limit 1;
  -- `can_edit_stage` lässt den org-weiten Editor nur an **Standbühnen**
  -- (`type = 'partner_booth'`) — die Art gehört also zur Vorbedingung.
  update stage set partner_org_id = v_org, type = 'partner_booth' where id = v_eigene;
  update stage set partner_org_id = null where id = v_fremde;
  insert into role_assignment (person_id, role, scope_type, scope_id)
  values (v_pid, 'standbuehne_editor', 'org', v_org);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  insert into t_res values ('01_eigene_buehne',
    case when coalesce(can_edit_stage(v_eigene), false) then 'ok, darf' else 'FEHLER: darf nicht' end);
  insert into t_res values ('02_fremde_buehne',
    case when coalesce(can_edit_stage(v_fremde), false) then 'FEHLER: darf (BUG)' else 'ok, darf nicht' end);

  -- 03 · sichtbar, aber nicht ziehbar
  select count(*) into v_n from programme_board b
   where b.stage_id = v_fremde and coalesce(b.can_edit, false);
  insert into t_res values ('03_fremde_zeilen_nicht_editierbar',
    case when v_n = 0 then 'ok, can_edit false' else 'FEHLER: ' || v_n::text || ' editierbare Fremdzeilen' end);

  v_start := (select coalesce(min(ed.day_date), current_date) + time '10:00'
                from event_day ed join stage st on st.event_id = ed.event_id where st.id = v_fremde)
             at time zone 'Europe/Berlin';

  -- 04 · anlegen auf fremder Bühne
  begin
    perform create_slot(v_fremde, v_start, v_start + interval '30 minutes');
    insert into t_res values ('04_create_slot_fremd', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('04_create_slot_fremd', 'abgewiesen ' || sqlstate);
  end;

  -- 05 · auf die fremde Bühne verschieben. Vorbedingung: ein Slot auf der
  -- eigenen Bühne, den die Person wirklich verschieben dürfte — sonst belegte
  -- ein Fehlschlag nur, dass es den Slot nicht gibt.
  v_slot := create_slot(v_eigene, v_start, v_start + interval '30 minutes');
  insert into t_res values ('05a_eigener_slot',
    case when v_slot is not null then 'ok, angelegt' else 'FEHLER' end);
  begin
    perform move_slot(v_slot, v_fremde, v_start, v_start + interval '30 minutes');
    insert into t_res values ('05b_move_slot_fremd', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('05b_move_slot_fremd', 'abgewiesen ' || sqlstate);
  end;
end $$;
select * from t_res order by step;
rollback;
