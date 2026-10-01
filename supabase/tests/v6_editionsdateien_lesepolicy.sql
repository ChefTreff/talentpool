-- Test „Editionsdateien-Lesepolicy“ (0232, v6_editionsdateien_lesepolicy.sql). Echter Rollenwechsel
-- (`set local role authenticated`), Testperson = älteste Person mit Konto, Rollen im Lauf entfernt und
-- je Schritt gesetzt; vier eigene Objekte (Datei A für partner mit Vorschau, Datei B für speaker,
-- ein Objekt ohne edition_file-Zeile), nur über diese wird geurteilt; alles zurückgerollt. Belegt:
--   01 ohne Rolle (Zielgruppe nur talent): keines der vier Objekte sichtbar;
--   02 partner_contact: genau A und ihre Vorschau (2), nicht B, nicht das Waisen-Objekt;
--   03 speaker: genau B (1);
--   04 admin: alle vier;
--   05 anon: 0 Zeilen im Bucket;
--   06 Grants: anon ohne EXECUTE auf edition_file_path_allowed, authenticated mit; Policy vorhanden.
-- Probelauf der Architektur-Session am 01.10.2026 (`sh scripts/db.sh dry-run`): 6 von 6 Schritten grün; fn-diff: edition_file_path_allowed neu.
begin;
create temp table t_res (step text, result text) on commit drop;
grant insert, select on t_res to authenticated, anon;
do $$
declare v_pid uuid; v_uid uuid; v_ed uuid; v_a text; v_ap text; v_b text; v_w text;
        v_n bigint; v_na bigint; v_nap bigint; v_nb bigint; v_nw bigint;
begin
  select p.id, p.auth_user_id into v_pid, v_uid from person p
   where p.auth_user_id is not null and p.deleted_at is null order by p.created_at limit 1;
  select e.id into v_ed from event e where e.is_edition order by e.start_date desc limit 1;
  v_a  := v_ed::text || '/zztest-0232-a.pdf';
  v_ap := v_a || '.preview.webp';
  v_b  := v_ed::text || '/zztest-0232-b.pdf';
  v_w  := v_ed::text || '/zztest-0232-waise.pdf';
  insert into edition_file (edition_id, kind, storage_path, filename, mime, audience, preview_path)
  values (v_ed, 'hall_plan', v_a, 'zztest-a.pdf', 'application/pdf', array['partner'], v_ap);
  insert into edition_file (edition_id, kind, storage_path, filename, mime, audience)
  values (v_ed, 'hall_plan', v_b, 'zztest-b.pdf', 'application/pdf', array['speaker']);
  insert into storage.objects (bucket_id, name) values
    ('edition-files', v_a), ('edition-files', v_ap), ('edition-files', v_b), ('edition-files', v_w);

  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  -- 01 ohne Rolle
  execute 'set local role authenticated';
  select count(*) into v_n from storage.objects where bucket_id = 'edition-files' and name in (v_a, v_ap, v_b, v_w);
  execute 'reset role';
  insert into t_res values ('01_ohne_rolle', case when v_n = 0 then 'ok' else 'FEHLER ' || v_n end);

  -- 02 partner_contact
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'partner_contact', 'global');
  execute 'set local role authenticated';
  select count(*) filter (where name = v_a), count(*) filter (where name = v_ap),
         count(*) filter (where name = v_b), count(*) filter (where name = v_w)
    into v_na, v_nap, v_nb, v_nw
    from storage.objects where bucket_id = 'edition-files' and name in (v_a, v_ap, v_b, v_w);
  execute 'reset role';
  insert into t_res values ('02_partner_a_und_vorschau',
    case when v_na = 1 and v_nap = 1 and v_nb = 0 and v_nw = 0 then 'ok'
         else format('FEHLER a=%s ap=%s b=%s waise=%s', v_na, v_nap, v_nb, v_nw) end);
  delete from role_assignment where person_id = v_pid;

  -- 03 speaker
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'speaker', 'global');
  execute 'set local role authenticated';
  select count(*) filter (where name = v_a), count(*) filter (where name = v_ap),
         count(*) filter (where name = v_b), count(*) filter (where name = v_w)
    into v_na, v_nap, v_nb, v_nw
    from storage.objects where bucket_id = 'edition-files' and name in (v_a, v_ap, v_b, v_w);
  execute 'reset role';
  insert into t_res values ('03_speaker_nur_b',
    case when v_na = 0 and v_nap = 0 and v_nb = 1 and v_nw = 0 then 'ok'
         else format('FEHLER a=%s ap=%s b=%s waise=%s', v_na, v_nap, v_nb, v_nw) end);
  delete from role_assignment where person_id = v_pid;

  -- 04 admin
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  execute 'set local role authenticated';
  select count(*) into v_n from storage.objects where bucket_id = 'edition-files' and name in (v_a, v_ap, v_b, v_w);
  execute 'reset role';
  insert into t_res values ('04_admin_alle', case when v_n = 4 then 'ok' else 'FEHLER ' || v_n end);
  delete from role_assignment where person_id = v_pid;

  -- 05 anon
  perform set_config('request.jwt.claims', null, true);
  execute 'set local role anon';
  begin
    select count(*) into v_n from storage.objects where bucket_id = 'edition-files';
  exception when insufficient_privilege then v_n := 0;
  end;
  execute 'reset role';
  insert into t_res values ('05_anon_nichts', case when v_n = 0 then 'ok' else 'FEHLER ' || v_n end);

  -- 06 Grants und Policy
  insert into t_res values ('06_grants_policy',
    case when not has_function_privilege('anon', 'edition_file_path_allowed(text)', 'EXECUTE')
          and has_function_privilege('authenticated', 'edition_file_path_allowed(text)', 'EXECUTE')
          and exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                        and policyname = 'edition files read' and qual like '%edition_file_path_allowed%')
         then 'ok' else 'FEHLER' end);
end $$;
select * from t_res order by step;
rollback;
