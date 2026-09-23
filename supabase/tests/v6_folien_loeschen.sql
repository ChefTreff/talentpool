-- Smoke-Test „Folien loeschen" (SPK-028). Belegt:
--   01 die eigene Praesentation laesst sich entfernen und die Funktion gibt
--      den Pfad zurueck, damit der Aufrufer die Datei wegraeumen kann;
--   02 die **vorige Fassung wird wieder die aktuelle** — sonst staende der
--      Speaker ohne Praesentation da, obwohl Version 1 noch im Bucket liegt;
--   03 ein Foto laesst sich nicht loeschen (22023 kind_not_deletable);
--   04 fremde Folien laesst die Funktion nicht los (42501);
--   05 eine erfundene Id ⇒ P0002 asset_not_found;
--   06 Grants: anon hat kein EXECUTE, authenticated schon.
--
-- Probelauf der Build-Session am 22.09.2026 gegen die Live-Datenbank
-- (`sh scripts/db.sh dry-run`, alles zurueckgerollt): 7 von 7 Schritten gruen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_profile uuid;
  v_fremd uuid; v_fremd_profile uuid;
  v_a1 uuid; v_a2 uuid; v_foto uuid; v_pfad text; v_b boolean; v_detail text;
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
  delete from speaker_asset where profile_id = v_profile;

  -- Zwei Fassungen derselben Praesentation, die zweite ist die aktuelle.
  insert into speaker_asset (profile_id, kind, storage_path, filename, version, is_current, uploaded_by)
  values (v_profile, 'presentation', v_ed::text || '/' || v_profile::text || '/presentation/eins.pdf',
          'eins.pdf', 1, false, v_pid)
  returning id into v_a1;
  insert into speaker_asset (profile_id, kind, storage_path, filename, version, is_current, uploaded_by)
  values (v_profile, 'presentation', v_ed::text || '/' || v_profile::text || '/presentation/zwei.pdf',
          'zwei.pdf', 2, true, v_pid)
  returning id into v_a2;
  insert into speaker_asset (profile_id, kind, storage_path, filename, version, is_current, uploaded_by)
  values (v_profile, 'photo', v_ed::text || '/' || v_profile::text || '/photo/ich.jpg',
          'ich.jpg', 1, true, v_pid)
  returning id into v_foto;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 · loeschen
  v_pfad := delete_speaker_asset(v_a2);
  insert into t_res values ('01_geloescht',
    case when v_pfad like '%zwei.pdf' and not exists (select 1 from speaker_asset where id = v_a2)
         then 'ok, Zeile weg und Pfad zurueck' else 'FEHLER ' || coalesce(v_pfad, 'null') end);

  -- 02 · die vorige Fassung rueckt nach
  select is_current into v_b from speaker_asset where id = v_a1;
  insert into t_res values ('02_vorige_wird_aktuell',
    case when v_b then 'ok' else 'FEHLER: Speaker stuende ohne Praesentation da' end);

  -- 03 · Fotos nicht
  begin
    perform delete_speaker_asset(v_foto);
    insert into t_res values ('03_foto', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('03_foto', 'abgewiesen ' || sqlstate || ' / ' || coalesce(v_detail, '-'));
  end;

  -- 04 · fremde Folien
  select p.id into v_fremd from person p
   where p.auth_user_id is not null and p.id <> v_pid limit 1;
  if v_fremd is not null then
    select sp.id into v_fremd_profile from speaker_profile sp where sp.person_id = v_fremd limit 1;
    if v_fremd_profile is null then
      insert into speaker_profile (person_id, edition_id) values (v_fremd, v_ed) returning id into v_fremd_profile;
    end if;
    insert into speaker_asset (profile_id, kind, storage_path, filename, version, is_current, uploaded_by)
    values (v_fremd_profile, 'presentation',
            v_ed::text || '/' || v_fremd_profile::text || '/presentation/fremd.pdf', 'fremd.pdf', 1, true, v_fremd)
    returning id into v_a1;
    begin
      perform delete_speaker_asset(v_a1);
      insert into t_res values ('04_fremd', 'ERLAUBT (BUG)');
    exception when others then
      insert into t_res values ('04_fremd', 'abgewiesen ' || sqlstate);
    end;
  else
    insert into t_res values ('04_fremd', 'uebersprungen: kein zweites Konto im Bestand');
  end if;

  -- 05 · erfundene Id
  begin
    perform delete_speaker_asset('00000000-0000-4000-8000-000000000000');
    insert into t_res values ('05_unbekannt', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('05_unbekannt', 'abgewiesen ' || sqlstate);
  end;

  -- 06 · Grants
  insert into t_res values ('06_anon_gesperrt',
    case when has_function_privilege('anon', 'delete_speaker_asset(uuid)', 'execute')
         then 'ERLAUBT (BUG)' else 'gesperrt' end);
  insert into t_res values ('06_authenticated_erlaubt',
    case when has_function_privilege('authenticated', 'delete_speaker_asset(uuid)', 'execute')
         then 'ok' else 'FEHLER' end);
end $$;
select * from t_res order by step;
rollback;
