-- Smoke-Test 0127 (Kontakt ohne Portalzugang am Speaker-Profil). Belegt:
--   01 ein Kontakt ohne Einwilligung wird abgewiesen (22023
--      speaker_contact_consent_required) — die Daten gehoeren einem Dritten;
--   02 mit Einwilligung geht er durch und steht am Profil;
--   03 eine erfundene Kontaktart ⇒ 22023 invalid_contact_kind;
--   04 eine reine Namenskorrektur **ohne** erneutes Mitschicken der
--      Einwilligung geht durch (die Lehre aus 0114: erst ausrechnen, was
--      dastuende, dann pruefen);
--   05 wer alle Felder leert, nimmt auch das Einwilligungsdatum und die
--      Kontaktart zurueck — kein Beleg ohne Gegenstand;
--   06 `my_speaker_profile` liefert den Kontakt, ohne Kontakt steht dort null;
--   07 das Team sieht ihn in `speaker_detail`;
--   08 die Assistenz darf ihn pflegen (sie pflegt das Profil ohnehin);
--   09 der CHECK greift auch an der Funktion vorbei (23514);
--   10 `anonymize_person` leert alle sechs Felder;
--   11 und traegt die Kontaktadresse **nicht** in die Sperrliste ein — sie
--      stand nie in einem Verteiler, das Portal kann an sie nicht senden.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_profile uuid;
  v_ass_uid uuid; v_ass_mail text; v_ass_pid uuid;
  v_n integer; v_detail text; v_json jsonb; v_sp speaker_profile%rowtype;
  v_kontaktmail text := 'office@beispiel-agentur.invalid';
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';

  select sp.id into v_profile from speaker_profile sp
   where sp.person_id = v_pid and sp.edition_id = v_ed limit 1;
  if v_profile is null then
    insert into speaker_profile (person_id, edition_id) values (v_pid, v_ed) returning id into v_profile;
  end if;
  update speaker_profile set contact_first_name = null, contact_last_name = null,
         contact_email = null, contact_phone = null, contact_kind = null, contact_consent_at = null
   where id = v_profile;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 · ohne Einwilligung
  begin
    perform update_my_speaker_profile(jsonb_build_object(
      'contact_first_name', 'Mia', 'contact_last_name', 'Office',
      'contact_email', v_kontaktmail));
    insert into t_res values ('01_ohne_einwilligung', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('01_ohne_einwilligung',
      'abgewiesen ' || sqlstate || ' / ' || coalesce(v_detail, '-'));
  end;

  -- 02 · mit Einwilligung
  perform update_my_speaker_profile(jsonb_build_object(
    'contact_first_name', 'Mia', 'contact_last_name', 'Office',
    'contact_email', v_kontaktmail, 'contact_phone', '+49 40 123456',
    'contact_kind', 'agency', 'contact_consent_at', '2026-09-21'));
  select * into v_sp from speaker_profile where id = v_profile;
  insert into t_res values ('02_mit_einwilligung',
    case when v_sp.contact_email::text = v_kontaktmail and v_sp.contact_kind = 'agency'
              and v_sp.contact_consent_at = date '2026-09-21'
         then 'ok' else 'FEHLER ' || coalesce(v_sp.contact_email::text, 'null') end);

  -- 03 · erfundene Kontaktart
  begin
    perform update_my_speaker_profile(jsonb_build_object('contact_kind', 'brieftaube'));
    insert into t_res values ('03_kontaktart', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('03_kontaktart', 'abgewiesen ' || sqlstate || ' / ' || coalesce(v_detail, '-'));
  end;

  -- 04 · Namenskorrektur ohne erneute Einwilligung
  begin
    perform update_my_speaker_profile(jsonb_build_object('contact_last_name', 'Office GmbH'));
    select * into v_sp from speaker_profile where id = v_profile;
    insert into t_res values ('04_namenskorrektur',
      case when v_sp.contact_last_name = 'Office GmbH' and v_sp.contact_consent_at is not null
           then 'ok, Einwilligung bleibt' else 'FEHLER' end);
  exception when others then
    insert into t_res values ('04_namenskorrektur', 'ABGEWIESEN (BUG) ' || sqlstate);
  end;

  -- 05 · alles leeren nimmt den Beleg mit
  perform update_my_speaker_profile(jsonb_build_object(
    'contact_first_name', '', 'contact_last_name', '', 'contact_email', '', 'contact_phone', ''));
  select * into v_sp from speaker_profile where id = v_profile;
  insert into t_res values ('05_leeren',
    case when v_sp.contact_consent_at is null and v_sp.contact_kind is null
              and v_sp.contact_email is null
         then 'ok, nichts bleibt stehen'
         else 'FEHLER consent=' || coalesce(v_sp.contact_consent_at::text, 'null') end);

  -- 06 · eigene Sicht
  v_json := my_speaker_profile();
  insert into t_res values ('06a_ohne_kontakt_null',
    case when v_json->'contact' = 'null'::jsonb or v_json->>'contact' is null
         then 'ok' else 'FEHLER ' || coalesce(v_json->>'contact', '-') end);
  perform update_my_speaker_profile(jsonb_build_object(
    'contact_first_name', 'Mia', 'contact_email', v_kontaktmail,
    'contact_kind', 'office', 'contact_consent_at', '2026-09-21'));
  v_json := my_speaker_profile();
  insert into t_res values ('06b_mit_kontakt',
    case when v_json->'contact'->>'email' = v_kontaktmail
         then 'ok' else 'FEHLER ' || coalesce((v_json->'contact')::text, 'null') end);

  -- 07 · Team-Sicht
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_speaker', 'global');
  v_json := speaker_detail(v_profile);
  insert into t_res values ('07_team_sicht',
    case when v_json->'contact'->>'email' = v_kontaktmail
         then 'ok' else 'FEHLER ' || coalesce((v_json->'contact')::text, 'null') end);
  delete from role_assignment where person_id = v_pid;

  -- 08 · die Assistenz darf pflegen
  select p.id, p.auth_user_id, pe.email::text into v_ass_pid, v_ass_uid, v_ass_mail
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.id <> v_pid limit 1;
  if v_ass_uid is not null then
    update speaker_profile set assistant_person_id = v_ass_pid where id = v_profile;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_ass_uid, 'role', 'authenticated', 'email', v_ass_mail)::text, true);
    begin
      perform update_my_speaker_profile(jsonb_build_object('contact_phone', '+49 40 999'));
      insert into t_res values ('08_assistenz', 'ok, darf pflegen');
    exception when others then
      insert into t_res values ('08_assistenz', 'ABGEWIESEN (BUG) ' || sqlstate);
    end;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  else
    insert into t_res values ('08_assistenz', 'uebersprungen: kein zweites Konto im Bestand');
  end if;

  -- 09 · der CHECK greift auch an der Funktion vorbei
  begin
    update speaker_profile set contact_first_name = 'Direkt', contact_consent_at = null
     where id = v_profile;
    insert into t_res values ('09_check', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('09_check', 'abgewiesen ' || sqlstate);
  end;

  -- 10 · Loeschweg leert die Felder
  perform anonymize_person(v_pid);
  select * into v_sp from speaker_profile where id = v_profile;
  insert into t_res values ('10_geloescht',
    case when v_sp.contact_first_name is null and v_sp.contact_last_name is null
              and v_sp.contact_email is null and v_sp.contact_phone is null
              and v_sp.contact_kind is null and v_sp.contact_consent_at is null
         then 'ok, alle sechs leer'
         else 'FEHLER ' || coalesce(v_sp.contact_email::text, v_sp.contact_first_name, '?') end);

  -- 11 · **kein** Eintrag in der Sperrliste fuer die Kontaktadresse
  select count(*)::integer into v_n from suppression
   where email_hash = email_hash(v_kontaktmail);
  insert into t_res values ('11_keine_sperrliste',
    case when v_n = 0 then 'ok, kein Hash eines Dritten'
         else 'FEHLER: Adresse eines Dritten in der Sperrliste' end);
end $$;
select * from t_res order by step;
rollback;
