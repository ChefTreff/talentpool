-- Test „Pronomen und cv_url gestrichen“ (SPK-066, TAL-013 B3; vorschlag/v6_pronomen_cv_url.sql). Belegt:
--   01 die Spalten person.pronouns und person.cv_url gibt es nicht mehr;
--   02 my_speaker_profile liefert das Personenobjekt ohne Schlüssel `pronouns`, mit `linkedin_url`;
--   03 update_my_speaker_profile nimmt ein Feld `pronouns` im Payload stumm hin und schreibt `title` weiter;
--   04 anonymize_person läuft im Serverkontext fehlerfrei (first_name leer, deleted_at gesetzt);
--   05 Grants: anon ohne EXECUTE auf allen drei Funktionen, authenticated ohne EXECUTE auf anonymize_person,
--      mit EXECUTE auf my_speaker_profile.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_sp uuid; v_json jsonb; v_s text; v_n integer; v_weg uuid;
begin
  -- 01 Spalten
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'person' and column_name in ('pronouns', 'cv_url');
  insert into t_res values ('01_spalten_weg', case when v_n = 0 then 'ok' else 'noch ' || v_n end);

  -- Speaker mit Konto
  select sp.id, sp.person_id, p.auth_user_id into v_sp, v_pid, v_uid
    from speaker_profile sp join person p on p.id = sp.person_id
   where p.auth_user_id is not null and p.deleted_at is null
   order by sp.created_at desc limit 1;
  if v_sp is null then
    insert into t_res values ('02_profil_ohne_pronomen', 'übersprungen: kein Speaker mit Konto');
    insert into t_res values ('03_update_ignoriert_pronomen', 'übersprungen');
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    -- 02
    v_json := my_speaker_profile();
    insert into t_res values ('02_profil_ohne_pronomen',
      case when v_json is not null and not (v_json->'person' ? 'pronouns') and (v_json->'person' ? 'linkedin_url') then 'ok'
           else coalesce((v_json->'person')::text, 'leer') end);
    -- 03
    perform update_my_speaker_profile(jsonb_build_object('id', v_sp, 'title', 'Dr. Testfall', 'pronouns', 'sie/ihr'));
    select title into v_s from person where id = v_pid;
    insert into t_res values ('03_update_ignoriert_pronomen', case when v_s = 'Dr. Testfall' then 'ok' else coalesce(v_s, 'leer') end);
    perform set_config('request.jwt.claims', null, true);
  end if;

  -- 04 anonymize_person im Serverkontext an einer Wegwerf-Person
  perform set_config('request.jwt.claims', null, true);
  insert into person (first_name, last_name) values ('Wegwerf', 'Testperson') returning id into v_weg;
  perform anonymize_person(v_weg);
  insert into t_res values ('04_anonymize_laeuft',
    case when (select first_name is null and deleted_at is not null from person where id = v_weg) then 'ok' else 'FEHLER' end);

  -- 05 Grants
  insert into t_res values ('05_grants',
    case when not has_function_privilege('anon', 'my_speaker_profile(uuid)', 'execute')
          and not has_function_privilege('anon', 'update_my_speaker_profile(jsonb)', 'execute')
          and not has_function_privilege('anon', 'anonymize_person(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'anonymize_person(uuid)', 'execute')
          and has_function_privilege('authenticated', 'my_speaker_profile(uuid)', 'execute')
         then 'ok' else 'FEHLER' end);
end $$;
select * from t_res order by step;
rollback;
