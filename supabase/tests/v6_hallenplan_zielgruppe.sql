-- Test zu `v6_hallenplan_zielgruppe` (PROD-009). Belegt:
--   01 kein Hallenplan mit allen fünf Zielgruppen mehr — der Bestand ist ohne speaker;
--   02 ein bewusst gesetzter Speaker-Plan (nur speaker) und eine andere Art mit
--      allen fünf bleiben unberührt (Gegenprobe: die Migration läuft hier ein
--      zweites Mal über eigene Zeilen);
--   03 set_edition_file ändert die Zielgruppe einer bestehenden Zeile (mit id
--      und kind), Art bleibt.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_ed uuid; v_sp uuid; v_an uuid; v_hp uuid; v_txt text; v_me uuid; v_uid uuid; v_email text;
begin
  select count(*)::text into v_txt from edition_file
   where kind = 'hallenplan' and audience @> '{partner,speaker,talent,volunteer,hackathon}'::text[];
  insert into t_res values ('01_bestand_ohne_speaker', v_txt || ' Hallenpläne mit allen fünf (erwartet 0)');

  select id into v_ed from event where is_edition order by start_date desc limit 1;
  insert into edition_file (edition_id, kind, storage_path, filename, audience)
  values (v_ed, 'hallenplan', v_ed || '/hallenplan/zztest-speaker.pdf', 'zztest-speaker.pdf', '{speaker}') returning id into v_sp;
  insert into edition_file (edition_id, kind, storage_path, filename, audience)
  values (v_ed, 'anfahrt', v_ed || '/anfahrt/zztest-anfahrt.pdf', 'zztest-anfahrt.pdf', '{partner,speaker,talent,volunteer,hackathon}') returning id into v_an;
  insert into edition_file (edition_id, kind, storage_path, filename, audience)
  values (v_ed, 'hallenplan', v_ed || '/hallenplan/zztest-alle.pdf', 'zztest-alle.pdf', '{partner,speaker,talent,volunteer,hackathon}') returning id into v_hp;
  update edition_file set audience = array_remove(audience, 'speaker')
   where kind = 'hallenplan' and audience @> '{partner,speaker,talent,volunteer,hackathon}'::text[];
  select string_agg(filename || '=' || array_to_string(audience, ','), ' ' order by filename) into v_txt
    from edition_file where id in (v_sp, v_an, v_hp);
  insert into t_res values ('02_nur_unbeschraenkte_hallenplaene', v_txt
    || ' (erwartet zztest-alle.pdf=partner,talent,volunteer,hackathon zztest-anfahrt.pdf=partner,speaker,talent,volunteer,hackathon zztest-speaker.pdf=speaker)');

  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'production_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  perform set_edition_file(jsonb_build_object('id', v_hp, 'kind', 'hallenplan', 'audience', jsonb_build_array('partner')));
  select kind || '=' || array_to_string(audience, ',') into v_txt from edition_file where id = v_hp;
  insert into t_res values ('03_aendern', v_txt || ' (erwartet hallenplan=partner)');
end $$;
select * from t_res order by step;
rollback;
