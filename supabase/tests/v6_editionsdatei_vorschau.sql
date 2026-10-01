-- Test zu `v6_editionsdatei_vorschau` (ADM-042). Belegt:
--   01 eine angemeldete Sitzung darf keine Vorschau setzen — auch Admin nicht;
--   02 der Server setzt sie für den festen Pfad <storage_path>.preview.webp;
--   03 ein anderer Pfad wird abgewiesen (invalid_path) — kein Eintrag auf eine
--      fremde Datei;
--   04 der Prüfsatz hält auch beim direkten Schreiben;
--   05 `edition_files` liefert Vorschau und Maße an die Portale;
--   06 ohne Vorschau bleiben die Spalten leer (PDF).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_me uuid; v_uid uuid; v_email text; v_ed uuid; v_bild uuid; v_pdf uuid; v_txt text; v_state text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  select id into v_ed from event where is_edition and slug = 'fls27';
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');
  insert into edition_file (edition_id, kind, storage_path, filename, mime, audience)
  values (v_ed, 'hallenplan', v_ed || '/hallenplan/zztest-plan.png', 'plan.png', 'image/png', '{partner,speaker}')
  returning id into v_bild;
  insert into edition_file (edition_id, kind, storage_path, filename, mime, audience)
  values (v_ed, 'aufbauplan', v_ed || '/aufbauplan/zztest.pdf', 'a.pdf', 'application/pdf', '{partner}')
  returning id into v_pdf;

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin
    perform set_edition_file_preview(v_bild, v_ed || '/hallenplan/zztest-plan.png.preview.webp', 2000, 1426);
    insert into t_res values ('01_sitzung', 'ERLAUBT (BUG)');
  exception when sqlstate '42501' then insert into t_res values ('01_sitzung', 'abgewiesen 42501');
  end;

  perform set_config('request.jwt.claims', '', true);
  perform set_edition_file_preview(v_bild, v_ed || '/hallenplan/zztest-plan.png.preview.webp', 2000, 1426);
  select (f.preview_path = f.storage_path || '.preview.webp')::text || ', ' || f.preview_width || '×' || f.preview_height
    into v_txt from edition_file f where f.id = v_bild;
  insert into t_res values ('02_server_setzt', v_txt || ' (erwartet true, 2000×1426)');

  begin
    perform set_edition_file_preview(v_bild, v_ed || '/hallenplan/fremd.png', 10, 10);
    insert into t_res values ('03_fremder_pfad', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_txt = message_text;
    insert into t_res values ('03_fremder_pfad', v_state || ' ' || v_txt);
  end;

  begin
    update edition_file set preview_path = 'irgendwo.webp', preview_width = 1, preview_height = 1 where id = v_bild;
    insert into t_res values ('04_pruefsatz', 'ERLAUBT (BUG)');
  exception when check_violation then insert into t_res values ('04_pruefsatz', 'abgewiesen (check)');
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  select coalesce(x.preview_width::text, 'null') || '×' || coalesce(x.preview_height::text, 'null')
    into v_txt from edition_files('speaker', v_ed) x where x.id = v_bild;
  insert into t_res values ('05_portal_liest', coalesce(v_txt, '(Zeile fehlt)') || ' (erwartet 2000×1426)');
  select coalesce(x.preview_path, 'null') into v_txt from edition_files('partner', v_ed) x where x.id = v_pdf;
  insert into t_res values ('06_pdf_ohne', v_txt || ' (erwartet null)');
end $$;
select * from t_res order by step;
rollback;
