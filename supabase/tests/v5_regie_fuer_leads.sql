-- Smoke-Test 0101 (Regie für die Speaker-Leads). Belegt:
--   01 ohne jede Rolle bleibt die Regie zu ⇒ 42501;
--   02 ein Speaker-Lead **mit** dieser Bühne im Scope darf lesen;
--   03 und schreiben;
--   04 eine **fremde** Bühne bleibt zu — das ist der Kern der Änderung;
--   05 beim Ändern gilt die Bühne des Cues, nicht die im Aufruf: eine fremde
--      `stage_id` im Rumpf verschiebt keine Zeile;
--   06 löschen prüft dieselbe Bühne;
--   07 `my_regie_stages` bietet nur an, was auch erlaubt ist;
--   08 die Produktion darf weiterhin überall.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_day uuid;
  v_stage uuid; v_fremd uuid; v_cue uuid; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  delete from staff_user where auth_user_id = v_uid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  insert into stage (event_id, name, slug, sort_order, active)
    values (v_ed, 'ZZ Testbuehne', 'zz-test', 900, true) returning id into v_stage;
  insert into stage (event_id, name, slug, sort_order, active)
    values (v_ed, 'ZZ Fremdbuehne', 'zz-fremd', 901, true) returning id into v_fremd;
  select d.id into v_day from event_day d where d.event_id = v_ed order by d.day_date limit 1;
  if v_day is null then
    insert into event_day (event_id, day_date, sort_order) values (v_ed, current_date + 200, 1)
      returning id into v_day;
  end if;

  begin
    perform count(*) from regie_view(v_stage, v_day);
    insert into t_res values ('01_ohne_rolle', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01_ohne_rolle', 'abgewiesen ' || sqlstate); end;

  -- Speaker-Lead **dieser** Bühne.
  insert into role_assignment (person_id, role, scope_type, scope_id)
    values (v_pid, 'speaker_manager', 'stage', v_stage);

  begin
    perform count(*) from regie_view(v_stage, v_day);
    insert into t_res values ('02_lead_liest', 'darf lesen (richtig)');
  exception when others then insert into t_res values ('02_lead_liest', 'ABGEWIESEN ' || sqlstate || ' (BUG)'); end;

  v_cue := upsert_regie_cue(jsonb_build_object(
    'stage_id', v_stage::text, 'event_day_id', v_day::text,
    'cue_start', (now() + interval '200 days')::text,
    'cue_end', (now() + interval '200 days' + interval '30 min')::text,
    'action', 'Soundcheck', 'regie', 'Licht auf 80 %'));
  select count(*)::integer into v_n from regie_view(v_stage, v_day) r where r.cue_id = v_cue;
  insert into t_res values ('03_lead_schreibt',
    case when v_n = 1 then 'Cue angelegt und sichtbar (richtig)' else 'unerwartet ' || v_n end);

  begin
    perform count(*) from regie_view(v_fremd, v_day);
    insert into t_res values ('04_fremde_buehne', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('04_fremde_buehne', 'abgewiesen ' || sqlstate); end;

  -- Fremde Bühne im Rumpf: darf die Zeile nicht verschieben und nicht die
  -- Rechteprüfung aushebeln.
  perform upsert_regie_cue(jsonb_build_object(
    'id', v_cue::text, 'stage_id', v_fremd::text, 'regie', 'Licht auf 60 %'));
  select count(*)::integer into v_n from regie_cue c where c.id = v_cue and c.stage_id = v_stage;
  insert into t_res values ('05_stage_id_im_rumpf',
    case when v_n = 1 then 'Buehne unveraendert (richtig)' else 'VERSCHOBEN (BUG)' end);

  -- Ein Cue auf der fremden Bühne, den diese Person nicht löschen darf.
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'production_team', 'global');
  declare v_fremd_cue uuid;
  begin
    v_fremd_cue := upsert_regie_cue(jsonb_build_object(
      'stage_id', v_fremd::text, 'event_day_id', v_day::text,
      'cue_start', (now() + interval '200 days')::text,
      'cue_end', (now() + interval '200 days' + interval '20 min')::text,
      'action', 'Umbau'));
    insert into t_res values ('08_produktion_ueberall', 'darf auf jeder Buehne (richtig)');
    delete from role_assignment where person_id = v_pid;
    insert into role_assignment (person_id, role, scope_type, scope_id)
      values (v_pid, 'speaker_manager', 'stage', v_stage);
    begin
      perform delete_regie_cue(v_fremd_cue);
      insert into t_res values ('06_loeschen_fremd', 'ERLAUBT (BUG)');
    exception when others then insert into t_res values ('06_loeschen_fremd', 'abgewiesen ' || sqlstate); end;
  end;

  select count(*)::integer into v_n from my_regie_stages(v_ed);
  insert into t_res values ('07_auswahl',
    case when v_n = 1 then 'nur die eigene Buehne (richtig)' else 'unerwartet ' || v_n end);
end $$;
select * from t_res order by step;
rollback;
