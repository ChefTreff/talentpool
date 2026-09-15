-- Smoke-Test 0099 (Zusage, Absage, Briefanrede). Belegt:
--   01 die Zusage setzt `confirmed_at`;
--   02 ein weiterer Wechsel **innerhalb** der Zusage verschiebt es nicht —
--      sonst wäre das Zusagedatum immer das letzte Klickdatum;
--   03 die Absage setzt Datum und Grund;
--   04 ein unbekannter Grund wird mit `invalid_decline_reason` abgewiesen;
--   05 zurück aus der Absage löscht Datum und Grund;
--   06 die Briefanrede pflegt nur das Team ⇒ 42501;
--   07 der Vorschlag baut den Normalfall und schweigt ohne Geschlechtsangabe;
--   08 das Lead-Board gibt die neuen Spalten heraus.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_sp uuid;
  v_t1 timestamptz; v_t2 timestamptz; v_txt text; v_grund text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  delete from staff_user where auth_user_id = v_uid;
  delete from speaker_profile where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_speaker', 'global');
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status)
    values (v_pid, v_ed, 'keynote', 'contacted') returning id into v_sp;

  perform set_speaker_pipeline(v_sp, 'confirmed');
  select confirmed_at into v_t1 from speaker_profile where id = v_sp;
  insert into t_res values ('01_zusagedatum',
    case when v_t1 is not null then 'gesetzt (richtig)' else 'FEHLT (BUG)' end);

  perform pg_sleep(0.01);
  perform set_speaker_pipeline(v_sp, 'ready');
  select confirmed_at into v_t2 from speaker_profile where id = v_sp;
  insert into t_res values ('02_zusage_bleibt',
    case when v_t2 = v_t1 then 'unveraendert (richtig)' else 'VERSCHOBEN (BUG)' end);

  perform set_speaker_pipeline(v_sp, 'declined', 'honorar');
  select declined_at, decline_reason into v_t2, v_grund from speaker_profile where id = v_sp;
  insert into t_res values ('03_absage',
    case when v_t2 is not null and v_grund = 'honorar' then 'Datum und Grund (richtig)'
         else 'unerwartet ' || coalesce(v_t2::text, '-') || '/' || coalesce(v_grund, '-') end);

  begin
    perform set_speaker_pipeline(v_sp, 'declined', 'weilhaltso');
    insert into t_res values ('04_unbekannter_grund', 'ANGENOMMEN (BUG)');
  exception when others then
    insert into t_res values ('04_unbekannter_grund', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  perform set_speaker_pipeline(v_sp, 'confirmed');
  select declined_at, decline_reason into v_t2, v_grund from speaker_profile where id = v_sp;
  insert into t_res values ('05_zurueck',
    case when v_t2 is null and v_grund is null then 'Absage geraeumt (richtig)'
         else 'unerwartet ' || coalesce(v_t2::text, 'null') || '/' || coalesce(v_grund, 'null') end);

  -- Ohne Team-Rolle: die Anrede ist Redaktionssache.
  delete from role_assignment where person_id = v_pid;
  begin
    perform set_person_salutation(v_pid, 'Sehr geehrte Frau Muster', 'Dear Ms Muster');
    insert into t_res values ('06_anrede_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('06_anrede_ohne_recht', 'abgewiesen ' || sqlstate); end;

  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  perform set_person_salutation(v_pid, '  Sehr geehrte Frau Dr. Muster  ', '');
  select salutation_de || '|' || coalesce(salutation_en, 'null') into v_txt from person where id = v_pid;
  insert into t_res values ('06b_anrede_gespeichert',
    case when v_txt = 'Sehr geehrte Frau Dr. Muster|null' then 'getrimmt, leer wird NULL (richtig)'
         else 'unerwartet ' || v_txt end);

  update person set gender = 'weiblich', title = 'Dr.', last_name = 'Muster' where id = v_pid;
  v_txt := suggest_salutation(v_pid, 'de');
  update person set gender = null where id = v_pid;
  insert into t_res values ('07_vorschlag',
    case when v_txt = 'Sehr geehrte Frau Dr. Muster' and suggest_salutation(v_pid, 'de') is null
         then 'baut den Normalfall, schweigt sonst (richtig)' else 'unerwartet ' || coalesce(v_txt, 'null') end);

  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_speaker', 'global');
  select m.decline_reason into v_grund from manager_speakers(v_ed) m where m.id = v_sp;
  select count(*)::text into v_txt from manager_speakers(v_ed) m where m.id = v_sp and m.confirmed_at is not null;
  insert into t_res values ('08_board',
    case when v_txt = '1' then 'Zusagedatum im Board (richtig)' else 'unerwartet ' || v_txt end);
end $$;
select * from t_res order by step;
rollback;
