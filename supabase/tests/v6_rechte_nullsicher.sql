-- Smoke-Test 0118 (Rechteprüfungen NULL-sicher). Aus Sicht einer angemeldeten
-- Person ohne jede Beziehung zu einem fremden Profil **ohne Assistenz** — genau
-- der Fall, in dem `assistant_person_id = v_me` NULL wird. Belegt:
--   01 speaker_next_steps(fremd) ⇒ 42501;
--   02 expense_eligibility(fremd) ⇒ 42501;
--   03 request_companion_ticket(fremd, …) ⇒ 42501;
--   04 register_speaker_asset(fremd, …) ⇒ 42501;
--   05 speaker_asset_path_allowed auf einen fremden Pfad ⇒ false, nicht NULL;
--   06 statisch: keine Funktion im Schema trägt noch eine ungeschützte OR-Kette
--      mit assistant_person_id (deckt cancel_hospitality/cancel_companion_ticket);
--   07 Gegenprobe: der Speaker selbst liest seine nächsten Schritte weiterhin.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid;
  v_profile uuid; v_fremd uuid; v_fremd_person uuid; v_n integer; v_b boolean;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  -- Testperson ohne Vorrechte: der Zugang haengt allein an der Rolle.
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select sp.id into v_profile from speaker_profile sp
   where sp.person_id = v_pid and sp.edition_id = v_ed limit 1;
  if v_profile is null then
    insert into speaker_profile (person_id, edition_id) values (v_pid, v_ed)
      returning id into v_profile;
  end if;
  -- Fremdes Profil einer Wegwerf-Person, bewusst ohne Assistenz.
  insert into person (first_name, last_name) values ('ZZ', 'Rechte-Fremd')
    returning id into v_fremd_person;
  insert into speaker_profile (person_id, edition_id) values (v_fremd_person, v_ed)
    returning id into v_fremd;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01
  begin
    perform speaker_next_steps(v_fremd);
    insert into t_res values ('01_next_steps_fremd', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01_next_steps_fremd', 'abgewiesen ' || sqlstate); end;
  -- 02
  begin
    perform expense_eligibility(v_fremd);
    insert into t_res values ('02_expense_fremd', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('02_expense_fremd', 'abgewiesen ' || sqlstate); end;
  -- 03
  begin
    perform request_companion_ticket(v_fremd, 'zz-rechte@example.invalid', 'ZZ', 'Begleitung');
    insert into t_res values ('03_companion_fremd', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('03_companion_fremd', 'abgewiesen ' || sqlstate); end;
  -- 04
  begin
    perform register_speaker_asset(v_fremd, 'photo',
      v_ed::text || '/' || v_fremd::text || '/photo/zz.jpg', 'zz.jpg', 'image/jpeg', 1234, null);
    insert into t_res values ('04_asset_fremd', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('04_asset_fremd', 'abgewiesen ' || sqlstate); end;
  -- 05
  v_b := speaker_asset_path_allowed(v_ed::text || '/' || v_fremd::text || '/photo/zz.jpg');
  insert into t_res values ('05_pfad_fremd',
    case when v_b is false then 'false (richtig)' when v_b is null then 'NULL (BUG)' else 'true (BUG)' end);
  -- 06 statisch
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.prosrc ~* 'not\s*\([^;]*assistant_person_id\s*='
          or p.prosrc ~* 'return\s+(?!coalesce)[^;]*assistant_person_id\s*=');
  insert into t_res values ('06_muster_im_schema',
    case when v_n = 0 then 'keine ungeschuetzte Kette' else 'FEHLER ' || v_n::text || ' Funktion(en)' end);
  -- 07 Gegenprobe
  begin
    perform speaker_next_steps(v_profile);
    insert into t_res values ('07_eigenes_profil', 'ok');
  exception when others then insert into t_res values ('07_eigenes_profil', 'FEHLER ' || sqlstate); end;
end $$;
select * from t_res order by step;
rollback;
