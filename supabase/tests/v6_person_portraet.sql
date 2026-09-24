-- Test „Porträt im Teilnehmer-Profil" (TAL-012, vorschlag/v6_person_portraet.sql). Belegt:
--   01 Bucket privat, 5 MB, drei Bildtypen;
--   02 Pfadregel: eigener Pfad schreibbar und lesbar;
--   03 fremder Pfad weder schreib- noch lesbar (Person ohne Team-Rolle);
--   04 Pfad mit Unterordner oder ohne Datei abgelehnt; Unsinn ist false, nicht NULL;
--   05 Team (admin) liest fremde Pfade, schreibt sie aber nicht;
--   06 set_my_photo: fremder Pfad ⇒ 22023 path_mismatch;
--   07 set_my_photo: Objekt fehlt ⇒ P0002 object_not_found;
--   08 set_my_photo setzt den Pfad; Ersetzen meldet das alte Bild in storage_purge_queue;
--   09 set_my_photo(null) entfernt und meldet ebenfalls an;
--   10 anonymize_person meldet das Porträt an und leert photo_path (Nebenspalte first_name
--      ebenfalls leer — die übrige Funktion arbeitet unverändert);
--   11 Grants: anon gesperrt, authenticated darf set_my_photo; kein Spalten-Update-Grant
--      auf photo_path.
--
-- Probelauf der Build-Session am 24.09.2026 gegen die Live-Datenbank
-- (`sh scripts/db.sh dry-run`, alles zurueckgerollt): 11 von 11 Schritten gruen;
-- `db.sh fn-diff`: anonymize_person nur um die zwei Porträt-Zeilen geändert.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_fremd uuid;
  v_eigen text; v_eigen2 text; v_fremdpfad text; v_n integer; v_s text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  select p.id into v_fremd from person p where p.id <> v_pid limit 1;
  v_eigen      := v_pid::text   || '/test-portraet-1.jpg';
  v_eigen2     := v_pid::text   || '/test-portraet-2.jpg';
  v_fremdpfad  := v_fremd::text || '/test-portraet-fremd.jpg';

  -- Objekte direkt anlegen (Test läuft als Superuser, Policies greifen hier nicht).
  insert into storage.objects (bucket_id, name) values
    ('person-photos', v_eigen), ('person-photos', v_eigen2), ('person-photos', v_fremdpfad);

  -- 01 Bucket
  select case when not b.public and b.file_size_limit = 5242880
               and b.allowed_mime_types @> array['image/png','image/jpeg','image/webp']
              then 'ok' else 'FEHLER' end into v_s
    from storage.buckets b where b.id = 'person-photos';
  insert into t_res values ('01_bucket_privat', coalesce(v_s, 'FEHLT'));

  -- Ab hier: Testperson ohne Vorrechte.
  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 02 eigener Pfad
  insert into t_res values ('02_eigen_schreiben_lesen',
    case when person_photo_path_allowed(v_eigen, true) and person_photo_path_allowed(v_eigen, false)
         then 'ok' else 'FEHLER' end);

  -- 03 fremder Pfad
  insert into t_res values ('03_fremd_gesperrt',
    case when person_photo_path_allowed(v_fremdpfad, true) is false
          and person_photo_path_allowed(v_fremdpfad, false) is false
         then 'ok' else 'ALLOWED (BUG)' end);

  -- 04 Form des Pfads
  insert into t_res values ('04_pfadform',
    case when person_photo_path_allowed(v_pid::text || '/unter/datei.jpg', true) is false
          and person_photo_path_allowed(v_pid::text || '/', true) is false
          and person_photo_path_allowed('kein-uuid/datei.jpg', false) is false
          and person_photo_path_allowed(null, false) is false
         then 'ok' else 'ALLOWED (BUG)' end);

  -- 05 Team: Rolle admin nur für diesen Schritt.
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  insert into t_res values ('05_team_liest_schreibt_nicht',
    case when person_photo_path_allowed(v_fremdpfad, false) and person_photo_path_allowed(v_fremdpfad, true) is false
         then 'ok' else 'FEHLER' end);
  delete from role_assignment where person_id = v_pid;

  -- 06 fremder Pfad über die RPC
  begin
    perform set_my_photo(v_fremdpfad);
    insert into t_res values ('06_rpc_fremder_pfad', 'ALLOWED (BUG)');
  exception when others then
    insert into t_res values ('06_rpc_fremder_pfad', case when sqlstate = '22023' and sqlerrm = 'path_mismatch' then 'ok' else sqlstate || ' ' || sqlerrm end);
  end;

  -- 07 Objekt fehlt
  begin
    perform set_my_photo(v_pid::text || '/gibt-es-nicht.jpg');
    insert into t_res values ('07_rpc_objekt_fehlt', 'ALLOWED (BUG)');
  exception when others then
    insert into t_res values ('07_rpc_objekt_fehlt', case when sqlstate = 'P0002' and sqlerrm = 'object_not_found' then 'ok' else sqlstate || ' ' || sqlerrm end);
  end;

  -- 08 setzen und ersetzen
  perform set_my_photo(v_eigen);
  perform set_my_photo(v_eigen2);
  select count(*) into v_n from storage_purge_queue q
   where q.bucket = 'person-photos' and q.path = v_eigen and q.reason = 'photo_replaced';
  insert into t_res values ('08_setzen_ersetzen',
    case when (select photo_path from person where id = v_pid) = v_eigen2 and v_n = 1 then 'ok' else 'FEHLER' end);

  -- 09 entfernen
  perform set_my_photo(null);
  select count(*) into v_n from storage_purge_queue q where q.bucket = 'person-photos' and q.path = v_eigen2;
  insert into t_res values ('09_entfernen',
    case when (select photo_path from person where id = v_pid) is null and v_n = 1 then 'ok' else 'FEHLER' end);

  -- 10 Löschen: fremde Person mit Porträt anonymisieren (Superuser-Kontext, wie der Server).
  perform set_config('request.jwt.claims', null, true);
  update person set photo_path = v_fremdpfad where id = v_fremd;
  perform anonymize_person(v_fremd);
  select count(*) into v_n from storage_purge_queue q where q.bucket = 'person-photos' and q.path = v_fremdpfad;
  insert into t_res values ('10_anonymize_raeumt_auf',
    case when v_n = 1 and (select photo_path is null and first_name is null from person where id = v_fremd)
         then 'ok' else 'FEHLER' end);

  -- 11 Grants
  insert into t_res values ('11_grants',
    case when not has_function_privilege('anon', 'set_my_photo(text)', 'execute')
          and has_function_privilege('authenticated', 'set_my_photo(text)', 'execute')
          and not has_column_privilege('authenticated', 'person', 'photo_path', 'UPDATE')
         then 'ok' else 'FEHLER' end);
end $$;
select * from t_res order by step;
rollback;
