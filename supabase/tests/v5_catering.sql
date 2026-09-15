-- Smoke-Test 0099 (Ernährung und Catering). Belegt:
--   01 die eigene Angabe lässt sich setzen und lesen;
--   02 eine unbekannte Ernährungsform wird mit `invalid_diet` abgewiesen;
--   03 es gibt **keinen** Weg, die Angabe einer anderen Person zu setzen —
--      auch nicht als Assistenz: sie könnte sie nicht lesen und würde beim
--      Speichern eine hinterlegte Allergie löschen;
--   05 `catering_notes` hat **keine** Personenspalte — das ist der Kern des
--      Datenschutzversprechens, nicht nur eine Konvention;
--   06 der Freitext steht **nicht** im Audit-Log;
--   07 die Auswertung ist nicht für Speaker ⇒ 42501;
--   08 die Bestellgrundlage zählt nur, wer wirklich kommt (bestätigte Speaker,
--      angenommene Volunteers) — sonst bestellt man für Absagen mit;
--   09 ein sehr langer Hinweis wird gekürzt (Datensparsamkeit).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_sp uuid;
  v_fremd uuid; v_j jsonb; v_n integer; v_txt text; v_spalten text;
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

  perform set_diet('vegan', '  Nussallergie  ');
  v_j := my_diet();
  insert into t_res values ('01_eigene_angabe',
    case when v_j->>'diet' = 'vegan' and v_j->>'diet_note' = 'Nussallergie'
         then 'gesetzt und getrimmt (richtig)' else 'unerwartet ' || coalesce(v_j::text, 'leer') end);

  begin
    perform set_diet('steinzeit', null);
    insert into t_res values ('02_unbekannte_form', 'ANGENOMMEN (BUG)');
  exception when others then
    insert into t_res values ('02_unbekannte_form', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- Die Funktion nimmt gar keine fremde Person entgegen — das ist die Sperre.
  select count(*)::integer into v_n from pg_proc
   where proname = 'set_diet' and pronamespace = 'public'::regnamespace and pronargs > 2;
  insert into t_res values ('03_nur_selbst',
    case when v_n = 0 then 'kein Parameter fuer fremde Person (richtig)' else 'FREMDER SCHREIBWEG (BUG)' end);

  -- Ein zweiter Speaker, damit die Auswertung etwas zu zaehlen hat.
  insert into person (first_name, last_name) values ('ZZ', 'Fremd') returning id into v_fremd;
  update person set diet = 'vegetarisch', diet_note = 'kein Sellerie' where id = v_fremd;
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status)
    values (v_fremd, v_ed, 'panelist', 'confirmed') returning id into v_sp;

  select pg_get_function_result(oid) into v_spalten from pg_proc
   where proname = 'catering_notes' and pronamespace = 'public'::regnamespace;
  insert into t_res values ('05_keine_person_in_notes',
    case when v_spalten !~* 'person|name|profile|email' then 'ohne Personenspalte (richtig)'
         else 'PERSONENBEZUG (BUG): ' || v_spalten end);

  select count(*)::integer into v_n from audit_log
   where action = 'person.diet' and (after::text ilike '%Sellerie%' or after::text ilike '%Nussallergie%');
  insert into t_res values ('06_kein_text_im_audit',
    case when v_n = 0 then 'Freitext nicht protokolliert (richtig)' else v_n || ' MIT TEXT (BUG)' end);

  begin
    perform count(*) from catering_summary(v_ed);
    insert into t_res values ('07_auswertung_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('07_auswertung_ohne_recht', 'abgewiesen ' || sqlstate); end;

  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'production_team', 'global');
  select anzahl into v_n from catering_summary(v_ed) where audience = 'speaker' and diet = 'vegetarisch';
  -- Derselbe Speaker, aber abgesagt: darf nicht mehr mitzaehlen.
  update speaker_profile set pipeline_status = 'declined' where id = v_sp;
  select count(*)::integer into v_n from catering_summary(v_ed) c
   where c.audience = 'speaker' and c.diet = 'vegetarisch';
  insert into t_res values ('08_nur_wer_kommt',
    case when v_n = 0 then 'Absage zaehlt nicht mit (richtig)' else 'MITGEZAEHLT (BUG)' end);

  update speaker_profile set pipeline_status = 'confirmed' where id = v_sp;
  perform set_diet('vegan', repeat('a', 500));
  select length(diet_note) into v_n from person where id = v_pid;
  insert into t_res values ('09_kuerzung',
    case when v_n = 300 then 'auf 300 Zeichen gekuerzt (richtig)' else 'unerwartet ' || v_n end);
end $$;
select * from t_res order by step;
rollback;
