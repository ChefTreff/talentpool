-- Test zu `v6_tour_typ_marketing` (K-52, Nachtrag zu ADM-045). Belegt:
--   01 Vokabular company_tour_type: sechs aktive Typen, Marketing mit DE/EN-Bezeichnung,
--      Reihenfolge alphabetisch (Sales hinter Marketing);
--   02 Bestand: keine Tour namens „Marketing" ohne Typ mehr;
--   03 ensure_company_tours legt in einer frischen Edition sechs Touren mit 18 Stopps an,
--      darunter Marketing; ein zweiter Lauf legt nichts mehr an;
--   04 eine Marketing-Tour ohne Typ (Bestand) bekommt von ensure_company_tours den Typ,
--      statt verdoppelt zu werden;
--   05 set_company_tour_type kennt `marketing` und vergibt den Typ je Edition nur einmal
--      (zweite Tour ⇒ invalid_type);
--   06 Gegenprobe: ohne Abschnitt tourAssignment bleibt der Typ unerreichbar (42501).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_me uuid; v_uid uuid; v_email text; v_ed uuid; v_txt text; v_n integer; v_tm uuid; v_tx uuid;
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;

  -- 01
  select count(*) filter (where active) || ' aktiv; ' || coalesce(max(label_de || '/' || label_en) filter (where key = 'marketing'), 'marketing fehlt')
         || '; marketing=' || coalesce(max(sort_order) filter (where key = 'marketing'), 0)
         || ' sales=' || coalesce(max(sort_order) filter (where key = 'sales'), 0)
    into v_txt from vocab_term where vocabulary = 'company_tour_type';
  insert into t_res values ('01_vokabular', v_txt || ' (erwartet 6 aktiv; Marketing/Marketing; marketing=50 sales=60)');

  -- 02
  select count(*) into v_n from company_tour where lower(btrim(name)) = 'marketing' and tour_type is null;
  insert into t_res values ('02_bestand', 'ohne_typ=' || v_n || ' mit_typ=' || (select count(*) from company_tour where lower(btrim(name)) = 'marketing' and tour_type = 'marketing')
    || ' (erwartet ohne_typ=0; mit_typ = Zahl der Marketing-Touren im Bestand, vor der Migration stehen sie unter ohne_typ)');

  -- 03 · Team-Rolle mit Abschnitt tourAssignment
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'partner_team', 'global');
  insert into event (name, format_tag, slug, is_edition, start_date) values ('ZZTEST Edition Marketing', 'edition', 'zztest-marketing', true, now() - interval '10 years') returning id into v_ed;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  v_n := ensure_company_tours(v_ed);
  v_txt := 'erster=' || v_n || ' zweiter=' || ensure_company_tours(v_ed)
        || ' touren=' || (select count(*) from company_tour where edition_id = v_ed)
        || ' stopps=' || (select count(*) from company_tour_stop s join company_tour t on t.id = s.tour_id where t.edition_id = v_ed)
        || ' marketing=' || (select count(*) from company_tour where edition_id = v_ed and tour_type = 'marketing' and name = 'Marketing');
  insert into t_res values ('03_ensure', v_txt || ' (erwartet erster=6 zweiter=0 touren=6 stopps=18 marketing=1)');

  -- 04 · Bestand ohne Typ in einer zweiten Edition
  perform set_config('request.jwt.claims', '', true);
  insert into event (name, format_tag, slug, is_edition, start_date) values ('ZZTEST Edition Marketing Bestand', 'edition', 'zztest-marketing-bestand', true, now() - interval '11 years') returning id into v_ed;
  insert into company_tour (edition_id, name) values (v_ed, 'Marketing') returning id into v_tm;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  perform ensure_company_tours(v_ed);
  insert into t_res values ('04_bestand_typ', 'marketing_touren=' || (select count(*) from company_tour where edition_id = v_ed and lower(name) = 'marketing')
    || ' typ=' || coalesce((select tour_type from company_tour where id = v_tm), '-')
    || ' touren=' || (select count(*) from company_tour where edition_id = v_ed)
    || ' (erwartet marketing_touren=1 typ=marketing touren=6)');

  -- 05 · eine andere Tour der Edition kann den Typ nicht noch einmal bekommen
  select id into v_tx from company_tour where edition_id = v_ed and tour_type = 'sales';
  begin perform set_company_tour_type(v_tx, 'marketing'); v_txt := 'ANGENOMMEN'; exception when sqlstate '22023' then v_txt := sqlerrm; end;
  -- freigeben und neu vergeben: der Typ ist als Vokabular gültig
  perform set_company_tour_type(v_tm, null);
  perform set_company_tour_type(v_tm, 'marketing');
  insert into t_res values ('05_typ_einmalig', v_txt || ' wieder=' || (select tour_type from company_tour where id = v_tm)
    || ' (erwartet invalid_type wieder=marketing)');

  -- 06 · ohne Abschnitt tourAssignment
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'talent_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin perform set_company_tour_type(v_tm, 'marketing'); v_txt := 'ERLAUBT'; exception when sqlstate '42501' then v_txt := '42501'; end;
  insert into t_res values ('06_ohne_abschnitt', v_txt || ' (erwartet 42501)');
end $$;
select * from t_res order by step;
rollback;
