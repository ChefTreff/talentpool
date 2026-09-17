-- Smoke-Test 0111 (Bilder am Auftritt). Belegt:
--   01 ohne Marketing-/Team-Rolle kein Eintrag ⇒ 42501;
--   02 eine erfundene Bildart ⇒ 22023 `invalid_kind`;
--   03 ein Pfad, der nicht zur Session gehört ⇒ 22023 `invalid_path` — sonst
--      zeigte die Zeile auf ein Bild, das jemand anderem gehört;
--   04 **mehrere Bühnenfotos bleiben alle gültig** (es gibt mehrere je Auftritt);
--   05 eine zweite Slot-Grafik setzt die erste zurück — zwei gültige
--      Programmgrafiken wären eine Frage an die Event-App, die niemand
--      beantworten kann;
--   06 das **erste** Bühnenfoto verschickt genau eine Mail je Speaker, das
--      zweite keine mehr;
--   07 `my_session_photos` zeigt die eigenen Auftritte;
--   08 und **nicht** die fremden;
--   09 hart löschen darf nur Admin, nicht das Marketing;
--   10 die Pflegelisten sind ohne Rolle zu;
--   11 `sessions_for_assets` zählt Fotos und **gültige** Grafiken.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ev uuid;
  v_ses uuid; v_fremd_ses uuid; v_fremd uuid; v_a1 uuid; v_a2 uuid; v_g1 uuid;
  v_n integer; v_txt text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ev from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  insert into session (event_id, title_de) values (v_ev, 'Mein Auftritt') returning id into v_ses;
  insert into session_speaker (session_id, person_id) values (v_ses, v_pid);
  insert into person (first_name, last_name, preferred_language, source_first, tier)
    values ('Fremde', 'Person', 'de', 'test', 'lead') returning id into v_fremd;
  insert into session (event_id, title_de) values (v_ev, 'Fremder Auftritt') returning id into v_fremd_ses;
  insert into session_speaker (session_id, person_id) values (v_fremd_ses, v_fremd);

  -- 01 · Ohne Rolle.
  begin
    perform register_session_asset(jsonb_build_object(
      'session_id', v_ses, 'kind', 'stage_photo',
      'storage_path', v_ses::text || '/stage_photo/a.jpg', 'filename', 'a.jpg'));
    insert into t_res values ('01_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('01_ohne_recht', 'abgewiesen ' || sqlstate); end;

  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'marketing_team', 'global');

  -- 02 · Erfundene Art.
  begin
    perform register_session_asset(jsonb_build_object(
      'session_id', v_ses, 'kind', 'urlaubsfoto',
      'storage_path', v_ses::text || '/urlaubsfoto/a.jpg', 'filename', 'a.jpg'));
    insert into t_res values ('02_bildart', 'ANGENOMMEN (BUG)');
  exception when others then
    insert into t_res values ('02_bildart', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 03 · Fremder Pfad.
  begin
    perform register_session_asset(jsonb_build_object(
      'session_id', v_ses, 'kind', 'stage_photo',
      'storage_path', v_fremd_ses::text || '/stage_photo/a.jpg', 'filename', 'a.jpg'));
    insert into t_res values ('03_pfad', 'ANGENOMMEN (BUG)');
  exception when others then
    insert into t_res values ('03_pfad', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 04/06 · Zwei Bühnenfotos, eine Mail.
  delete from mail_log where person_id = v_pid;
  v_a1 := register_session_asset(jsonb_build_object(
    'session_id', v_ses, 'kind', 'stage_photo',
    'storage_path', v_ses::text || '/stage_photo/eins.jpg', 'filename', 'eins.jpg'));
  select count(*)::integer into v_n from mail_log
   where person_id = v_pid and template_key = 'stage_photos_ready';
  insert into t_res values ('06_erste_mail',
    case when v_n = 1 then 'eine Mail beim ersten Foto (richtig)' else 'unerwartet ' || v_n end);

  v_a2 := register_session_asset(jsonb_build_object(
    'session_id', v_ses, 'kind', 'stage_photo',
    'storage_path', v_ses::text || '/stage_photo/zwei.jpg', 'filename', 'zwei.jpg'));
  select count(*)::integer into v_n from session_asset
   where session_id = v_ses and kind = 'stage_photo' and is_current;
  insert into t_res values ('04_mehrere_fotos',
    case when v_n = 2 then 'beide gueltig (richtig)' else 'unerwartet ' || v_n end);
  select count(*)::integer into v_n from mail_log
   where person_id = v_pid and template_key = 'stage_photos_ready';
  insert into t_res values ('06b_keine_zweite_mail',
    case when v_n = 1 then 'keine zweite Mail (richtig)' else 'unerwartet ' || v_n end);

  -- 05 · Zwei Slot-Grafiken.
  v_g1 := register_session_asset(jsonb_build_object(
    'session_id', v_ses, 'kind', 'slot_graphic',
    'storage_path', v_ses::text || '/slot_graphic/eins.png', 'filename', 'eins.png', 'cutout', true));
  perform register_session_asset(jsonb_build_object(
    'session_id', v_ses, 'kind', 'slot_graphic',
    'storage_path', v_ses::text || '/slot_graphic/zwei.png', 'filename', 'zwei.png', 'cutout', true));
  select is_current::text into v_txt from session_asset where id = v_g1;
  select count(*)::integer into v_n from session_asset
   where session_id = v_ses and kind = 'slot_graphic' and is_current;
  insert into t_res values ('05_grafik_ersetzt',
    case when v_txt = 'false' and v_n = 1 then 'nur die neue gilt (richtig)'
         else 'unerwartet ' || coalesce(v_txt, 'null') || '/' || v_n end);

  -- 11 · Die Arbeitsliste zählt richtig.
  select s.photos || '/' || s.graphics into v_txt from sessions_for_assets(v_ev) s
   where s.session_id = v_ses;
  insert into t_res values ('11_arbeitsliste',
    case when v_txt = '2/1' then 'zwei Fotos, eine gueltige Grafik (richtig)'
         else 'unerwartet ' || coalesce(v_txt, 'null') end);

  -- 07/08 · Die eigenen Fotos, und nur die.
  insert into session_asset (session_id, kind, storage_path, filename)
  values (v_fremd_ses, 'stage_photo', v_fremd_ses::text || '/stage_photo/fremd.jpg', 'fremd.jpg');
  select count(*)::integer into v_n from my_session_photos();
  insert into t_res values ('07_eigene',
    case when v_n = 2 then 'beide eigenen Fotos (richtig)' else 'unerwartet ' || v_n end);
  select count(*)::integer into v_n from my_session_photos() m where m.session_id = v_fremd_ses;
  insert into t_res values ('08_keine_fremden',
    case when v_n = 0 then 'fremde bleiben draussen (richtig)' else 'sichtbar (BUG)' end);

  -- 09 · Hart löschen nur Admin.
  begin
    perform delete_session_asset(v_a1);
    insert into t_res values ('09_loeschen_marketing', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('09_loeschen_marketing', 'abgewiesen ' || sqlstate); end;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  select delete_session_asset(v_a1) into v_txt;
  insert into t_res values ('09b_loeschen_admin',
    case when v_txt like '%/stage_photo/eins.jpg' then 'geloescht, Pfad zurueck (richtig)'
         else 'unerwartet ' || coalesce(v_txt, 'null') end);

  -- 10 · Pflegelisten ohne Rolle.
  delete from role_assignment where person_id = v_pid;
  begin
    perform sessions_for_assets(v_ev);
    insert into t_res values ('10_liste_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('10_liste_ohne_recht', 'abgewiesen ' || sqlstate); end;
end $$;
select * from t_res order by step;
rollback;
