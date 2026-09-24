-- Smoke-Test 0148 (Assistenz und Agentur zu einem Kontakt, SPK-040). Belegt in
-- **beiden** Zusammenhaengen — Speaker-Seite und Team-Seite:
--   01 der Bestand ist umgezogen: jede hinterlegte Assistenz steht als Kontakt
--      mit Zugang, jeder Kontakt aus 0127 als Kontakt ohne Zugang;
--   02 ohne Einwilligung wird nicht gespeichert (22023);
--   03 mit Einwilligung geht es;
--   04 eine erfundene Art faellt durch (22023 invalid_contact_kind);
--   05 mit Zugang entsteht die Person, die Rolle steht und die Einladung
--      liegt in der Mailschlange;
--   06 diese Person gilt danach als Assistenz — `is_speaker_assistant` sagt
--      ja, und sie kommt ueber `my_speaker_profile_id` an das Profil;
--   07 die Assistenz darf selbst **keine** Kontakte anlegen (42501);
--   08 Zugang zuruecknehmen beendet die Rolle (`valid_to` gesetzt; auf
--      `valid_to > now()` zu pruefen belegt nichts, weil `now()` in der
--      Transaktion stillsteht und die Rolle eine Sekunde spaeter endet);
--   09 die Speakerin selbst als Kontakt mit Zugang wird abgewiesen (23514);
--   10 Entfernen nimmt Zeile und Rolle mit;
--   11 ein Fremder sieht die Kontakte nicht (42501).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_profile uuid;
  v_c uuid; v_assi uuid; v_n integer; v_fremd uuid; v_uid2 uuid;
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
  delete from speaker_contact where profile_id = v_profile;

  -- 01 · Bestand: eine Zeile je vorhandener Assistenz und je Kontakt aus 0127
  select count(*) into v_n
    from speaker_profile sp
   where sp.assistant_person_id is not null
     and not exists (select 1 from speaker_contact c
                      where c.profile_id = sp.id and c.person_id = sp.assistant_person_id
                        and c.has_access);
  insert into t_res values ('01a_bestand_assistenz',
    case when v_n = 0 then 'ok, alle Assistenzen umgezogen'
         else 'FEHLER: ' || v_n::text || ' ohne Kontaktzeile' end);
  select count(*) into v_n
    from speaker_profile sp
   where coalesce(sp.contact_first_name, sp.contact_last_name,
                  sp.contact_email::text, sp.contact_phone) is not null
     and sp.id <> v_profile
     and not exists (select 1 from speaker_contact c
                      where c.profile_id = sp.id and c.person_id is null);
  insert into t_res values ('01b_bestand_kontakt',
    case when v_n = 0 then 'ok, alle Kontakte umgezogen'
         else 'FEHLER: ' || v_n::text || ' ohne Kontaktzeile' end);

  -- 11 · ein Fremder sieht die Kontakte nicht. Das Konto wird **geliehen**,
  -- nicht erfunden: `person.auth_user_id` zeigt auf `auth.users`.
  select p.id, p.auth_user_id into v_fremd, v_uid2
    from person p where p.auth_user_id is not null and p.id <> v_pid limit 1;
  delete from role_assignment where person_id = v_fremd;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid2, 'role', 'authenticated')::text, true);
  begin
    perform my_speaker_contacts(v_profile);
    insert into t_res values ('11_fremder_sieht_nichts', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('11_fremder_sieht_nichts', 'abgewiesen ' || sqlstate);
  end;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 02 · ohne Einwilligung
  begin
    perform upsert_speaker_contact(jsonb_build_object(
      'profile_id', v_profile, 'kind', 'agency', 'first_name', 'Aenne', 'last_name', 'Agentur'));
    insert into t_res values ('02_ohne_einwilligung', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('02_ohne_einwilligung', 'abgewiesen ' || sqlstate);
  end;

  -- 03 · mit Einwilligung
  v_c := upsert_speaker_contact(jsonb_build_object(
    'profile_id', v_profile, 'kind', 'agency', 'first_name', 'Aenne', 'last_name', 'Agentur',
    'email', 'aenne.test.0148@example.org', 'consent_at', current_date::text));
  select count(*) into v_n from speaker_contact where id = v_c and not has_access;
  insert into t_res values ('03_mit_einwilligung',
    case when v_n = 1 then 'ok, ohne Zugang gespeichert' else 'FEHLER' end);

  -- 04 · erfundene Art
  begin
    perform upsert_speaker_contact(jsonb_build_object(
      'profile_id', v_profile, 'kind', 'kumpel', 'first_name', 'X',
      'consent_at', current_date::text));
    insert into t_res values ('04_erfundene_art', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('04_erfundene_art', 'abgewiesen ' || sqlstate);
  end;

  -- 05 · mit Zugang
  perform upsert_speaker_contact(jsonb_build_object(
    'id', v_c::text, 'profile_id', v_profile, 'kind', 'agency', 'has_access', true));
  select person_id into v_assi from speaker_contact where id = v_c;
  select count(*) into v_n from role_assignment
   where person_id = v_assi and role = 'speaker_assistant' and edition_id = v_ed
     and valid_to is null;
  insert into t_res values ('05a_zugang_rolle',
    case when v_assi is not null and v_n = 1 then 'ok, Person und Rolle da'
         else 'FEHLER ' || coalesce(v_n::text, 'null') end);
  select count(*) into v_n from mail_log
   where person_id = v_assi and template_key = 'assistant_invite';
  insert into t_res values ('05b_einladung',
    case when v_n = 1 then 'ok, eine Einladung' else 'FEHLER ' || v_n::text end);

  -- 06 · gilt als Assistenz. Das geliehene Konto zieht um: erst weg bei der
  -- fremden Person, dann hin zur Assistenz — `auth_user_id` ist eindeutig.
  update person set auth_user_id = null where id = v_fremd;
  update person set auth_user_id = v_uid2 where id = v_assi;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid2, 'role', 'authenticated')::text, true);
  insert into t_res values ('06a_is_speaker_assistant',
    case when is_speaker_assistant(v_profile, v_assi) then 'ok' else 'FEHLER' end);
  insert into t_res values ('06b_kommt_ans_profil',
    case when my_speaker_profile_id(null) = v_profile then 'ok, findet das Profil'
         else 'FEHLER' end);

  -- 07 · die Assistenz darf keine Kontakte anlegen
  begin
    perform upsert_speaker_contact(jsonb_build_object(
      'profile_id', v_profile, 'kind', 'office', 'first_name', 'Noch', 'last_name', 'Einer',
      'consent_at', current_date::text));
    insert into t_res values ('07_assistenz_darf_nicht', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('07_assistenz_darf_nicht', 'abgewiesen ' || sqlstate);
  end;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 09 · die Speakerin selbst als Kontakt mit Zugang
  begin
    perform upsert_speaker_contact(jsonb_build_object(
      'profile_id', v_profile, 'kind', 'office', 'email', v_email, 'has_access', true,
      'consent_at', current_date::text));
    insert into t_res values ('09_selbst_als_kontakt', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('09_selbst_als_kontakt', 'abgewiesen ' || sqlstate);
  end;

  -- 08 · Zugang zurücknehmen
  perform upsert_speaker_contact(jsonb_build_object(
    'id', v_c::text, 'profile_id', v_profile, 'kind', 'agency', 'has_access', false));
  select count(*) into v_n from role_assignment
   where person_id = v_assi and role = 'speaker_assistant' and edition_id = v_ed
     and valid_to is null;
  insert into t_res values ('08_zugang_zurueck',
    case when v_n = 0 then 'ok, Rolle beendet' else 'FEHLER: Rolle steht noch' end);

  -- 10 · entfernen
  perform upsert_speaker_contact(jsonb_build_object(
    'id', v_c::text, 'profile_id', v_profile, 'kind', 'agency', 'has_access', true));
  perform remove_speaker_contact(v_c);
  select count(*) into v_n from speaker_contact where id = v_c;
  insert into t_res values ('10a_entfernt',
    case when v_n = 0 then 'ok' else 'FEHLER' end);
  select count(*) into v_n from role_assignment
   where person_id = v_assi and role = 'speaker_assistant' and edition_id = v_ed
     and valid_to is null;
  insert into t_res values ('10b_rolle_mit_weg',
    case when v_n = 0 then 'ok, Rolle beendet' else 'FEHLER: Rolle steht noch' end);
end $$;
select * from t_res order by step;
rollback;
