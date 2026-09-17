-- Smoke-Test 0092 (Eingebettete Videos). Belegt:
--   01 Pflegen ohne Team-Rolle ⇒ 42501;
--   02 ein **fremder Anbieter** wird abgewiesen — mit eigenem Schlüssel
--      `invalid_video_url`, nicht als nacktes 23514 aus dem CHECK;
--   03 Lesen über Schlüssel und Zielgruppe findet das Video;
--   04 eine fremde Zielgruppe sieht es **nicht**, auch wenn sie den
--      Schlüssel kennt;
--   05 die Fassung einer Edition sticht die allgemeine;
--   06 keine Grants für `authenticated` — gelesen wird über die RPC.
-- Lauf am 14.09. gegen Frankfurt: alle sechs grün.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_id uuid; v_txt text; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  begin
    perform upsert_portal_video(jsonb_build_object(
      'key', 'zztest', 'url', 'https://www.loom.com/share/x', 'audience', jsonb_build_array('partner')));
    insert into t_res values ('01_ohne_recht', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('01_ohne_recht', 'abgewiesen ' || sqlstate); end;

  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, valid_from)
  values (v_pid, 'admin', 'global', null, null, now() - interval '1 hour');

  -- Ein freies URL-Feld im iframe wäre eine offene Tür.
  begin
    perform upsert_portal_video(jsonb_build_object(
      'key', 'zztest', 'url', 'https://youtube.com/watch?v=1', 'audience', jsonb_build_array('partner')));
    insert into t_res values ('02_fremder_anbieter', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('02_fremder_anbieter', 'abgewiesen ' || sqlerrm); end;

  v_id := upsert_portal_video(jsonb_build_object(
    'key', 'zztest_ticket', 'url', 'https://www.loom.com/share/532a8072a5eb49f8ba8c35b0e2a29044',
    'audience', jsonb_build_array('partner'), 'title_de', 'Anleitung'));
  select url into v_txt from portal_video_for('zztest_ticket', 'partner', v_ed);
  insert into t_res values ('03_lesen',
    case when v_txt like '%532a8072%' then 'gefunden (richtig)' else 'unerwartet ' || coalesce(v_txt, 'leer') end);

  select count(*) into v_n from portal_video_for('zztest_ticket', 'speaker', v_ed);
  insert into t_res values ('04_fremde_zielgruppe',
    case when v_n = 0 then 'nichts (richtig)' else 'SICHTBAR (BUG)' end);

  perform upsert_portal_video(jsonb_build_object(
    'key', 'zztest_ticket', 'url', 'https://www.loom.com/share/EDITION',
    'audience', jsonb_build_array('partner'), 'edition_id', v_ed::text));
  select url into v_txt from portal_video_for('zztest_ticket', 'partner', v_ed);
  insert into t_res values ('05_edition_sticht',
    case when v_txt like '%EDITION%' then 'Editionsfassung (richtig)' else 'unerwartet ' || coalesce(v_txt, 'leer') end);

  insert into t_res values ('06_grants',
    case when has_table_privilege('authenticated', 'portal_video', 'select')
         then 'LESBAR (BUG)' else 'kein SELECT (richtig)' end);
end $$;
select * from t_res order by step;
rollback;
