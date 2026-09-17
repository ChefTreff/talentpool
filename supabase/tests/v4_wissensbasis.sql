-- Smoke-Test 0083 (Wissensbasis). Belegt:
--   01 ohne Anmeldung 28000, mit falscher Rolle 42501 — Zielgruppen sind Rechte;
--   02 Overlay: der Artikel der Edition schlägt den evergreen, ohne Edition gilt der evergreen;
--   03 Entwürfe und abgelaufene Artikel kommen nicht heraus;
--   04 Rollenfilter der Volunteers (leere roles = für alle);
--   05 Schreiben nur für die Bereichsleitung der Zielgruppe (42501);
--   06 unbekannte Zielgruppe/Phase ⇒ 22023;
--   07 zweiter Artikel mit gleichem Slug, Sprache und Edition ⇒ P0001 slug_taken;
--   08 Löschen archiviert, statt zu löschen;
--   09 Tabelle ohne Grants für authenticated;
--   10 (Review 14.09.) fremder Artikel lässt sich nicht über eine neue Zielgruppenliste übernehmen,
--      eine fremde Zielgruppe nicht dazunehmen, nicht zurücknehmen; der Editor zeigt ihn nicht.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_n integer; v_txt text;
        v_ever uuid; v_over uuid; v_draft uuid; v_role uuid; v_fremd uuid;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';

  -- 01a ohne Anmeldung
  begin
    perform kb_articles('talent', 'de', null);
    insert into t_res values ('01a_ohne_login', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('01a_ohne_login', 'abgewiesen ' || sqlstate); end;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01b angemeldet, aber keine Volunteer-Rolle
  begin
    perform kb_articles('volunteer', 'de', null);
    insert into t_res values ('01b_fremde_zielgruppe', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('01b_fremde_zielgruppe', 'abgewiesen ' || sqlstate); end;

  -- 05 Schreiben ohne Bereichsleitung
  begin
    perform upsert_kb_article(jsonb_build_object(
      'slug', 'zztest-regel', 'audience', jsonb_build_array('volunteer'), 'title', 'Test'));
    insert into t_res values ('05_schreiben_ohne_recht', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('05_schreiben_ohne_recht', 'abgewiesen ' || sqlstate); end;

  insert into role_assignment (person_id, role, scope_type, edition_id, valid_from)
  values (v_pid, 'area_lead_volunteers', 'edition', v_ed, now() - interval '1 day');
  insert into role_assignment (person_id, role, scope_type, edition_id, valid_from)
  values (v_pid, 'volunteer', 'edition', v_ed, now() - interval '1 day');

  -- 06 unbekannte Zielgruppe und Phase
  begin
    perform upsert_kb_article(jsonb_build_object(
      'slug', 'zztest-a', 'audience', jsonb_build_array('marsmenschen'), 'title', 'Test'));
    insert into t_res values ('06a_zielgruppe', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('06a_zielgruppe', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  begin
    perform upsert_kb_article(jsonb_build_object(
      'slug', 'zztest-a', 'audience', jsonb_build_array('volunteer'), 'title', 'Test', 'phase', 'irgendwann'));
    insert into t_res values ('06b_phase', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('06b_phase', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 02 Overlay
  v_ever := upsert_kb_article(jsonb_build_object(
    'slug', 'zztest-einlass', 'audience', jsonb_build_array('volunteer'),
    'title', 'Einlass (jedes Jahr)', 'body_md', 'evergreen'));
  perform publish_kb_article(v_ever, true);
  select title into v_txt from kb_articles('volunteer', 'de', v_ed) where slug = 'zztest-einlass';
  insert into t_res values ('02a_nur_evergreen', coalesce(v_txt, 'FEHLT'));

  v_over := upsert_kb_article(jsonb_build_object(
    'slug', 'zztest-einlass', 'audience', jsonb_build_array('volunteer'), 'edition_id', v_ed,
    'title', 'Einlass FLS27', 'body_md', 'Treffpunkt Halle B'));
  perform publish_kb_article(v_over, true);
  select title || ' | overlay=' || is_overlay::text into v_txt
    from kb_articles('volunteer', 'de', v_ed) where slug = 'zztest-einlass';
  insert into t_res values ('02b_mit_edition', coalesce(v_txt, 'FEHLT'));
  select title into v_txt from kb_articles('volunteer', 'de', null) where slug = 'zztest-einlass';
  insert into t_res values ('02c_ohne_edition', coalesce(v_txt, 'FEHLT'));

  -- 03 Entwurf und abgelaufen
  v_draft := upsert_kb_article(jsonb_build_object(
    'slug', 'zztest-entwurf', 'audience', jsonb_build_array('volunteer'), 'title', 'Entwurf'));
  select count(*) into v_n from kb_articles('volunteer', 'de', v_ed) where slug = 'zztest-entwurf';
  perform publish_kb_article(v_draft, true);
  perform upsert_kb_article(jsonb_build_object('id', v_draft, 'valid_until', (now() - interval '1 day')::text));
  insert into t_res values ('03_entwurf_und_abgelaufen',
    'entwurf=' || v_n || ' abgelaufen=' ||
    (select count(*) from kb_articles('volunteer', 'de', v_ed) where slug = 'zztest-entwurf'));

  -- 04 Rollenfilter
  v_role := upsert_kb_article(jsonb_build_object(
    'slug', 'zztest-rolle', 'audience', jsonb_build_array('volunteer'),
    'roles', jsonb_build_array('einlass'), 'title', 'Nur Einlass'));
  perform publish_kb_article(v_role, true);
  insert into t_res values ('04_rollenfilter',
    'ohne_rolle=' || (select count(*) from kb_articles('volunteer', 'de', v_ed, null) where slug = 'zztest-rolle') ||
    ' passend=' || (select count(*) from kb_articles('volunteer', 'de', v_ed, 'einlass') where slug = 'zztest-rolle') ||
    ' fremd=' || (select count(*) from kb_articles('volunteer', 'de', v_ed, 'garderobe') where slug = 'zztest-rolle'));

  -- 07 Slug doppelt
  begin
    perform upsert_kb_article(jsonb_build_object(
      'slug', 'zztest-einlass', 'audience', jsonb_build_array('volunteer'), 'title', 'Noch mal'));
    insert into t_res values ('07_slug_doppelt', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('07_slug_doppelt', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 08 Löschen archiviert
  perform delete_kb_article(v_role);
  select status into v_txt from kb_article where id = v_role;
  insert into t_res values ('08_archiviert', v_txt || ', sichtbar=' ||
    (select count(*) from kb_articles('volunteer', 'de', v_ed) where slug = 'zztest-rolle'));

  -- 10 Fremden Artikel nicht übernehmen (Review 14.09.): ein Partner-Artikel, ohne Umweg angelegt
  insert into kb_article (slug, audience, title, status)
  values ('zztest-partner', array['partner'], 'Nur Partner', 'published') returning id into v_fremd;
  begin
    perform upsert_kb_article(jsonb_build_object('id', v_fremd, 'audience', jsonb_build_array('volunteer'), 'title', 'gekapert'));
    insert into t_res values ('10a_fremder_artikel', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('10a_fremder_artikel', 'abgewiesen ' || sqlstate); end;
  begin
    perform upsert_kb_article(jsonb_build_object('slug', 'zztest-mix', 'audience', jsonb_build_array('volunteer', 'partner'), 'title', 'Mix'));
    insert into t_res values ('10b_fremde_zielgruppe_dazu', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('10b_fremde_zielgruppe_dazu', 'abgewiesen ' || sqlstate); end;
  begin
    perform publish_kb_article(v_fremd, false);
    insert into t_res values ('10c_fremd_zuruecknehmen', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('10c_fremd_zuruecknehmen', 'abgewiesen ' || sqlstate); end;
  insert into t_res values ('10d_editor_liste', 'fremd_sichtbar=' ||
    (select count(*) from kb_articles_admin(null) where slug = 'zztest-partner') ||
    ' eigene_sichtbar=' || (select count(*) from kb_articles_admin(null) where slug = 'zztest-einlass'));

  -- 09 Grants
  select count(*) into v_n from information_schema.role_table_grants
   where table_name = 'kb_article' and grantee in ('anon', 'authenticated');
  insert into t_res values ('09_grants', case when v_n = 0 then 'keine' else v_n || ' (BUG)' end);
end $$;

select * from t_res order by step;
rollback;
