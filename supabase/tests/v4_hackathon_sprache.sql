-- Smoke-Test 0089 (Hackathon · Sprache). Belegt:
--   01 mit deutscher Fassung im Feld bekommt `p_language => 'de'` auch Deutsch;
--   02 ohne deutsche Fassung bleibt es Englisch — kein Loch;
--   03 Englisch bleibt die Voreinstellung: ohne `p_language` kommt EN;
--   04 eine leere deutsche Fassung ('' oder Leerzeichen) zählt nicht als Fassung;
--   05 `my_hack` reicht dieselbe Regel an die eigene Challenge durch;
--   06 die Rechteprüfung bleibt: ohne Login 28000, Jury-Sicht ohne Rolle 42501.
-- Vor 0089 waren 01, 04 und 05 rot: `coalesce(title_en, title_de)` mit
-- `title_en not null` liess Deutsch nie durch (Walkthrough 14.09.2026).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_titel text; v_team uuid; v_j jsonb;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';

  -- Wegwerf-Challenges. `sort_order` weit hinten, damit die Reihenfolge des
  -- echten Bestands im Test nicht zufällig mitgeprüft wird.
  insert into hack_challenge (edition_id, title_en, title_de, description_en, description_de,
                              status, sort_order)
  values (v_ed, 'ZZTEST beide EN', 'ZZTEST beide DE', 'desc EN', 'desc DE', 'published', 900),
         (v_ed, 'ZZTEST nur EN',   null,              'only EN', null,     'published', 901),
         (v_ed, 'ZZTEST leer EN',  '   ',             'empty EN', '',      'published', 902);

  -- 01 deutsche Fassung vorhanden
  select title into v_titel from hack_challenges(v_ed, 'de') where title like 'ZZTEST beide%';
  insert into t_res values ('01_de_vorhanden',
    case when v_titel = 'ZZTEST beide DE' then 'de geliefert (richtig)' else 'EN GEBLIEBEN (BUG): ' || coalesce(v_titel, 'leer') end);

  -- 02 keine deutsche Fassung
  select title into v_titel from hack_challenges(v_ed, 'de') where title like 'ZZTEST nur%';
  insert into t_res values ('02_de_fehlt',
    case when v_titel = 'ZZTEST nur EN' then 'faellt auf en (richtig)' else 'unerwartet ' || coalesce(v_titel, 'LEER (BUG)') end);

  -- 03 Voreinstellung bleibt Englisch
  select title into v_titel from hack_challenges(v_ed) where title like 'ZZTEST beide%';
  insert into t_res values ('03_default_en',
    case when v_titel = 'ZZTEST beide EN' then 'en als Standard (richtig)' else 'unerwartet ' || coalesce(v_titel, 'leer') end);

  -- 04 leere deutsche Fassung ist keine Fassung
  select title into v_titel from hack_challenges(v_ed, 'de') where title like 'ZZTEST leer%';
  insert into t_res values ('04_de_leer',
    case when v_titel = 'ZZTEST leer EN' then 'leer zaehlt nicht (richtig)' else 'LEERER TITEL (BUG): "' || coalesce(v_titel, 'null') || '"' end);

  -- 05 my_hack reicht die Regel durch
  -- `join_code` ist not null und wird sonst von create_hack_team() gesetzt.
  insert into hack_team (edition_id, name, status, challenge_id, join_code)
  select v_ed, 'ZZTEST Team', 'confirmed', c.id, hack_join_code() from hack_challenge c
   where c.edition_id = v_ed and c.title_en = 'ZZTEST beide EN'
  returning id into v_team;
  insert into hack_team_member (team_id, person_id, is_captain, edition_id)
  values (v_team, v_pid, true, v_ed);
  v_j := my_hack(v_ed, 'de');
  insert into t_res values ('05_my_hack_de',
    case when v_j->'challenge'->>'title' = 'ZZTEST beide DE' then 'de geliefert (richtig)'
         else 'EN GEBLIEBEN (BUG): ' || coalesce(v_j->'challenge'->>'title', 'leer') end);

  -- 06 Rechte
  begin
    perform hack_judging(v_ed, 'de');
    insert into t_res values ('06_jury_ohne_rolle', 'ALLOWED (BUG)');
  exception when others then
    insert into t_res values ('06_jury_ohne_rolle', 'abgewiesen ' || sqlstate);
  end;
  perform set_config('request.jwt.claims', null, true);
  begin
    perform hack_challenges(v_ed, 'de');
    insert into t_res values ('06_ohne_login', 'ALLOWED (BUG)');
  exception when others then
    insert into t_res values ('06_ohne_login', 'abgewiesen ' || sqlstate);
  end;
end $$;
select * from t_res order by step;
rollback;
-- Lauf am 14.09. gegen Frankfurt: ohne 0089 gab es keinen Weg zur deutschen
-- Fassung (01, 04, 05 lieferten durchweg Englisch); mit 0089 im selben
-- Transaktionsblock alle sieben gruen.
