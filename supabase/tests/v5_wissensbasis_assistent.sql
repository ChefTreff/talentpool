-- Smoke-Test 0108 (Assistent auf der Wissensbasis). Belegt:
--   01 ohne Login keine Suche ⇒ 28000;
--   02 eine fremde Zielgruppe ⇒ 42501;
--   03 eine leere Frage ⇒ 22023 `empty_query`;
--   04 das Kiosk-Gerätekonto fragt nicht ⇒ 42501;
--   05 ein Entwurf liefert **keine** Abschnitte, erst das Veröffentlichen tut es;
--   06 Abschnitt = H2-Block, H3 bleibt im Text des Abschnitts;
--   07 ein langer Abschnitt wird geteilt und **jedes Teilstück trägt die
--      Überschrift** — sonst rutscht ein Mittelteil ohne Kontext ins Ranking;
--   08 die Suche findet den Abschnitt mit einem Rang > 0;
--   09 ein abgelaufener Artikel fällt heraus;
--   10 ein Artikel einer fremden Zielgruppe fällt heraus;
--   11 die 21. Frage in der Stunde ⇒ P0001 `rate_limited`;
--   12 `kb_question_log` hat **keine** Personenspalte — die Zusage steckt in der
--      Tabellenform, nicht in der Disziplin des Aufrufers;
--   13 das Aufräumen löscht Fragen älter als 90 Tage und Zählerzeilen älter als
--      24 Stunden, jüngere bleiben stehen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid;
  v_art uuid; v_alt uuid; v_fremd uuid; v_n integer; v_txt text; v_rank real; v_kiosk uuid;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  delete from staff_user where auth_user_id = v_uid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';

  -- 01 · Ohne Login.
  perform set_config('request.jwt.claims', '', true);
  begin
    perform kb_search('hotel', 'talent', 'de');
    insert into t_res values ('01_ohne_login', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('01_ohne_login', 'abgewiesen ' || sqlstate); end;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 02 · Fremde Zielgruppe (ohne Partner-Rolle, ohne Admin).
  begin
    perform kb_search('stand', 'partner', 'de');
    insert into t_res values ('02_fremde_zielgruppe', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('02_fremde_zielgruppe', 'abgewiesen ' || sqlstate); end;

  -- 03 · Leere Frage.
  begin
    perform kb_search('   ', 'talent', 'de');
    insert into t_res values ('03_leere_frage', 'ANGENOMMEN (BUG)');
  exception when others then
    insert into t_res values ('03_leere_frage', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 05/06/07 · Abschnitte entstehen erst beim Veröffentlichen.
  insert into kb_article (slug, language, audience, title, status, body_md)
  values ('test-assistent', 'de', array['talent'], 'Anreise und Hotel', 'draft',
          E'Kurze Einleitung vor der ersten Überschrift.\n\n'
          '## Wie komme ich zum Veranstaltungsort?\n'
          'Mit der S-Bahn bis Dammtor.\n\n'
          '### Vom Bahnhof\n'
          'Zehn Minuten zu Fuss.\n\n'
          '## Gibt es ein Hotelkontingent?\n'
          || repeat('Das Kontingent liegt im Radisson Blu und wird über das Portal gebucht. ', 30)
          || E'\n\n'
          || repeat('Die Buchung ist bis vier Wochen vor dem Summit möglich. ', 30))
  returning id into v_art;
  select count(*)::integer into v_n from kb_chunk where article_id = v_art;
  insert into t_res values ('05_entwurf',
    case when v_n = 0 then 'Entwurf ohne Abschnitte (richtig)' else 'unerwartet ' || v_n end);

  update kb_article set status = 'published' where id = v_art;
  select count(*)::integer into v_n from kb_chunk where article_id = v_art;
  insert into t_res values ('05b_veroeffentlicht',
    case when v_n >= 3 then v_n || ' Abschnitte (richtig)' else 'nur ' || v_n || ' (BUG)' end);

  select c.body into v_txt from kb_chunk c
   where c.article_id = v_art and c.heading = 'Wie komme ich zum Veranstaltungsort?';
  insert into t_res values ('06_h3_bleibt',
    case when v_txt like '%### Vom Bahnhof%' and v_txt like '%Dammtor%'
         then 'H3 steht im Abschnitt (richtig)' else 'unerwartet ' || coalesce(left(v_txt, 60), 'null') end);

  select count(*)::integer into v_n from kb_chunk c
   where c.article_id = v_art and c.heading = 'Gibt es ein Hotelkontingent?';
  insert into t_res values ('07_geteilt',
    case when v_n = 2 then 'langer Abschnitt in zwei Teilen, beide mit Ueberschrift (richtig)'
         else 'unerwartet ' || v_n end);

  -- 08 · Treffer.
  select s.rank into v_rank from kb_search('Hotelkontingent', 'talent', 'de') s limit 1;
  insert into t_res values ('08_treffer',
    case when v_rank > 0 then 'gefunden, Rang > 0 (richtig)' else 'nicht gefunden (BUG)' end);

  -- 09 · Abgelaufen.
  update kb_article set valid_until = now() - interval '1 day' where id = v_art;
  select count(*)::integer into v_n from kb_search('Hotelkontingent', 'talent', 'de') s;
  insert into t_res values ('09_abgelaufen',
    case when v_n = 0 then 'abgelaufener Artikel faellt raus (richtig)' else 'noch da (BUG)' end);
  update kb_article set valid_until = null where id = v_art;

  -- 10 · Fremde Zielgruppe am Artikel.
  insert into kb_article (slug, language, audience, title, status, body_md)
  values ('test-nur-partner', 'de', array['partner'], 'Standbau', 'published',
          E'## Wann ist die Aufbauzeit?\nAm Vortag ab 14 Uhr, Hotelkontingent inklusive.')
  returning id into v_fremd;
  select count(*)::integer into v_n from kb_search('Aufbauzeit', 'talent', 'de') s;
  insert into t_res values ('10_zielgruppe',
    case when v_n = 0 then 'fremder Artikel faellt raus (richtig)' else 'sichtbar (BUG)' end);

  -- 04 · Kiosk. Die Rolle kommt unmittelbar vor dem Schritt, der sie braucht.
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'checkin_operator', 'global');
  begin
    perform kb_search('hotel', 'talent', 'de');
    insert into t_res values ('04_kiosk', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('04_kiosk', 'abgewiesen ' || sqlstate); end;
  delete from role_assignment where person_id = v_pid and role = 'checkin_operator';

  -- 11 · Rate-Limit.
  delete from kb_rate_limit where auth_user_id = v_uid;
  for v_n in 1..20 loop perform kb_take_question_slot(20); end loop;
  begin
    perform kb_take_question_slot(20);
    insert into t_res values ('11_rate_limit', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('11_rate_limit', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 12 · Die Zusage steckt in der Tabellenform.
  select string_agg(column_name, ',' order by column_name) into v_txt
    from information_schema.columns where table_name = 'kb_question_log';
  insert into t_res values ('12_keine_person',
    case when v_txt not like '%person%' and v_txt not like '%auth_user%' and v_txt like '%question%'
         then 'keine Personenspalte (richtig)' else 'unerwartet ' || v_txt end);

  -- 13 · Aufräumen.
  perform kb_log_question('talent', 'de', 'Wie komme ich hin?', array[v_art], true, 120);
  insert into kb_question_log (audience, language, question, hit, created_at)
  values ('talent', 'de', 'alte Frage', false, now() - interval '100 days');
  insert into kb_rate_limit (auth_user_id, window_start, hits)
  values (v_uid, date_trunc('hour', now() - interval '30 hours'), 3);
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  v_n := purge_kb_questions(90);
  insert into t_res values ('13_aufraeumen',
    case when v_n = 1
          and exists (select 1 from kb_question_log where question = 'Wie komme ich hin?')
          and not exists (select 1 from kb_rate_limit where auth_user_id = v_uid
                            and window_start < now() - interval '24 hours')
         then 'alte Frage weg, junge bleibt, Zaehler geraeumt (richtig)'
         else 'unerwartet ' || v_n end);
end $$;
select * from t_res order by step;
rollback;
