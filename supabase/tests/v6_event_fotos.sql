-- Test „Event-Fotos“ (TAL-010, 20261002091014_v6_event_fotos.sql). Belegt:
--   01 Bucket event-photos privat, Tabellen ohne Grants, keine Schreib-Policy, Abschnitt photos;
--   02 register_event_photo: ohne Abschnitt 42501; mit marketing_team: eintragen, falscher Pfad 22023;
--   03 Lese-Policy (als authenticated): Eingecheckte sieht das veröffentlichte Foto, nicht das
--      unveröffentlichte; No-Show (Ticket ohne Check-in) sieht nichts; Verwalter sieht alles;
--   04 Community-Event: Anmeldung „attended“ gibt Zugriff, „confirmed“ nicht;
--   05 my_photo_events / event_photos: Eingecheckte sieht das Event mit 1 Foto; No-Show 42501 not_attended;
--   06 Löschwunsch: Eingecheckte darf, No-Show 42501; Admin-Liste zeigt ihn; erledigen; Audit ohne Notiz;
--   07 delete_event_photo liefert den Pfad, Zeile weg; anon ohne EXECUTE.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_in uuid; v_in_uid uuid; v_no uuid; v_no_uid uuid; v_staff uuid; v_staff_uid uuid;
  v_ed uuid; v_ce uuid; v_p1 text; v_p2 text; v_p3 text; v_f1 uuid; v_f2 uuid; v_f3 uuid; v_req uuid;
  v_s text; v_n integer; v_n1 integer; v_n2 integer;
begin
  select p.id, p.auth_user_id into v_in, v_in_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 0 limit 1;
  select p.id, p.auth_user_id into v_no, v_no_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 1 limit 1;
  select p.id, p.auth_user_id into v_staff, v_staff_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 2 limit 1;
  delete from role_assignment where person_id in (v_in, v_no, v_staff);
  insert into event (name, slug, format_tag, start_date, end_date, is_edition) values ('ZZ Foto-Summit', 'zz-foto-summit', 'summit', current_date - 10, current_date - 9, true) returning id into v_ed;
  insert into event (name, slug, format_tag, start_date, end_date, is_edition) values ('ZZ Foto-Community', 'zz-foto-community', 'community', current_date - 5, current_date - 5, false) returning id into v_ce;
  insert into ticket (event_id, person_id, status, source, checked_in_at, addons) values (v_ed, v_in, 'valid', 'vivenu', now() - interval '9 days', '[]');
  insert into ticket (event_id, person_id, status, source, addons) values (v_ed, v_no, 'valid', 'vivenu', '[]');
  insert into registration (person_id, event_id, status) values (v_in, v_ce, 'attended'), (v_no, v_ce, 'confirmed');
  v_p1 := v_ed::text || '/zztest-1.jpg'; v_p2 := v_ed::text || '/zztest-2.jpg'; v_p3 := v_ce::text || '/zztest-3.jpg';
  insert into storage.objects (bucket_id, name) values ('event-photos', v_p1), ('event-photos', v_p2), ('event-photos', v_p3);

  -- 01
  insert into t_res values ('01_bucket_grants',
    case when (select public = false and file_size_limit = 15728640 from storage.buckets where id = 'event-photos')
          and not has_table_privilege('authenticated', 'event_photo', 'select')
          and not has_table_privilege('authenticated', 'event_photo_removal_request', 'insert')
          and not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                           and cmd <> 'SELECT' and coalesce(qual, '') || coalesce(with_check, '') like '%event-photos%')
          and (select count(*) from admin_section_role where section = 'photos') = 4
         then 'ok' else 'FEHLER' end);

  -- 02
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff_uid, 'role', 'authenticated')::text, true);
  begin perform register_event_photo(v_ed, v_p1, '1.jpg'); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  insert into role_assignment (person_id, role, scope_type) values (v_staff, 'marketing_team', 'global');
  v_f1 := register_event_photo(v_ed, v_p1, '1.jpg', 'Foto: Test');
  v_f2 := register_event_photo(v_ed, v_p2, '2.jpg');
  v_f3 := register_event_photo(v_ce, v_p3, '3.jpg');
  begin perform register_event_photo(v_ed, v_ce::text || '/x.jpg', 'x.jpg'); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '22023' then '/ok' else '/' || sqlstate end; end;
  perform set_event_photo(v_f1, true, 'Foto: Test');
  perform set_event_photo(v_f3, true);
  insert into t_res values ('02_eintragen', case when v_s = 'ok/ok' then 'ok' else v_s end);

  -- 03 Policy
  perform set_config('request.jwt.claims', json_build_object('sub', v_in_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) filter (where name = v_p1), count(*) filter (where name = v_p2) into v_n1, v_n2
    from storage.objects where bucket_id = 'event-photos' and name in (v_p1, v_p2);
  execute 'reset role';
  v_s := format('in=%s/%s', v_n1, v_n2);
  perform set_config('request.jwt.claims', json_build_object('sub', v_no_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from storage.objects where bucket_id = 'event-photos' and name in (v_p1, v_p2, v_p3);
  execute 'reset role';
  v_s := v_s || format(' noshow=%s', v_n);
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from storage.objects where bucket_id = 'event-photos' and name in (v_p1, v_p2, v_p3);
  execute 'reset role';
  v_s := v_s || format(' staff=%s', v_n);
  insert into t_res values ('03_policy', case when v_s = 'in=1/0 noshow=0 staff=3' then 'ok' else v_s end);

  -- 04 Community-Event
  perform set_config('request.jwt.claims', json_build_object('sub', v_in_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n1 from storage.objects where bucket_id = 'event-photos' and name = v_p3;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_no_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n2 from storage.objects where bucket_id = 'event-photos' and name = v_p3;
  execute 'reset role';
  insert into t_res values ('04_community', case when v_n1 = 1 and v_n2 = 0 then 'ok' else format('attended=%s confirmed=%s', v_n1, v_n2) end);

  -- 05
  perform set_config('request.jwt.claims', json_build_object('sub', v_in_uid, 'role', 'authenticated')::text, true);
  select photos into v_n from my_photo_events() where event_id = v_ed;
  select count(*) into v_n1 from event_photos(v_ed);
  perform set_config('request.jwt.claims', json_build_object('sub', v_no_uid, 'role', 'authenticated')::text, true);
  begin perform * from event_photos(v_ed); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlerrm = 'not_attended' then 'ok' else sqlstate end; end;
  insert into t_res values ('05_teilnehmende', case when v_n = 1 and v_n1 = 1 and v_s = 'ok' then 'ok' else format('%s %s %s', v_n, v_n1, v_s) end);

  -- 06 Löschwunsch
  begin perform request_photo_removal(v_f1, 'bitte weg'); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_in_uid, 'role', 'authenticated')::text, true);
  v_req := request_photo_removal(v_f1, 'Ich bin darauf, bitte entfernen');
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff_uid, 'role', 'authenticated')::text, true);
  select count(*) into v_n from photo_removal_requests_admin() r where r.request_id = v_req and r.status = 'open';
  perform handle_photo_removal(v_req, 'done');
  insert into t_res values ('06_loeschwunsch',
    case when v_s = 'ok' and v_n = 1 and (select status from event_photo_removal_request where id = v_req) = 'done'
          and not exists (select 1 from audit_log a where a.action = 'photo.removal_requested' and a.after::text like '%entfernen%')
         then 'ok' else v_s || ' n=' || v_n end);

  -- 07
  v_s := coalesce(delete_event_photo(v_f2), 'null');
  insert into t_res values ('07_loeschen_anon',
    case when v_s = v_p2 and not exists (select 1 from event_photo where id = v_f2)
          and not has_function_privilege('anon', 'event_photos(uuid)', 'execute')
          and not has_function_privilege('anon', 'event_photo_path_allowed(text)', 'execute')
          and not has_function_privilege('anon', 'register_event_photo(uuid,text,text,text)', 'execute')
         then 'ok' else format('pfad=%s zeile=%s anon_photos=%s anon_path=%s anon_reg=%s', v_s = v_p2,
              exists (select 1 from event_photo where id = v_f2),
              has_function_privilege('anon', 'event_photos(uuid)', 'execute'),
              has_function_privilege('anon', 'event_photo_path_allowed(text)', 'execute'),
              has_function_privilege('anon', 'register_event_photo(uuid,text,text,text)', 'execute')) end);
end $$;
select * from t_res order by step;
rollback;
