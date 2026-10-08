-- Test zu ADM-104 (ohne Migration): ein archivierter Wiki-Artikel lässt sich wieder veröffentlichen.
-- Belegt gegen den Bestand (Funktionen publish_kb_article, delete_kb_article):
--   01 Artikel anlegen, veröffentlichen, archivieren (Status archived, Audit kb.archived);
--   02 publish_kb_article(id, true) auf den archivierten Artikel ⇒ Status published, published_at gesetzt, Audit kb.published;
--   03 der wiederveröffentlichte Artikel steht in kb_articles für die Zielgruppe;
--   04 ohne Recht (keine Rolle) ⇒ 42501, Status bleibt archived.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_me uuid; v_uid uuid; v_email text; v_a uuid; v_txt text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  v_a := upsert_kb_article(jsonb_build_object('slug', 'zztest-archiv', 'title', 'ZZTEST Archiv', 'audience', jsonb_build_array('partner')));
  perform publish_kb_article(v_a, true);
  perform delete_kb_article(v_a);
  select status || ' audit_archiv=' || (select count(*) from audit_log where action = 'kb.archived' and object_id = v_a::text)
    into v_txt from kb_article where id = v_a;
  insert into t_res values ('01_archiviert', v_txt || ' (erwartet archived audit_archiv=1)');

  perform publish_kb_article(v_a, true);
  select status || ' published_at=' || (published_at is not null)::text || ' audit_veroeff=' || (select count(*) from audit_log where action = 'kb.published' and object_id = v_a::text)
    into v_txt from kb_article where id = v_a;
  insert into t_res values ('02_wieder', v_txt || ' (erwartet published published_at=true audit_veroeff=2)');

  insert into t_res values ('03_sichtbar', 'in_liste=' || (select count(*) from kb_articles('partner', 'de') where slug = 'zztest-archiv') || ' (erwartet in_liste=1)');

  perform delete_kb_article(v_a);
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin perform publish_kb_article(v_a, true); v_txt := 'ERLAUBT'; exception when sqlstate '42501' then v_txt := '42501'; end;
  insert into t_res values ('04_ohne_recht', v_txt || ' status=' || (select status from kb_article where id = v_a) || ' (erwartet 42501 status=archived)');
end $$;
select * from t_res order by step;
rollback;
