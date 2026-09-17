-- Smoke-Test 0109 (Suche gibt nicht beim ersten fehlenden Wort auf). Belegt:
--   01 eine Frage, deren Wörter **alle** vorkommen, findet weiterhin genau den
--      passenden Abschnitt — der Rückfall verdünnt die gute Antwort nicht;
--   02 **der Befund aus dem Walkthrough:** eine Frage mit einem Wort, das im
--      Artikel nicht steht („geliefert" statt „einsenden"), findet den Artikel
--      jetzt trotzdem; vor 0109 war das Ergebnis leer;
--   03 dabei steht der richtige Artikel oben, nicht irgendeiner;
--   04 Unsinn findet auch als ODER nichts — der Leerzustand bleibt;
--   05 die Zielgruppe gilt im Rückfall genauso: ein Artikel einer fremden
--      Zielgruppe kann den Rückfall weder auslösen noch in ihm auftauchen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_art uuid; v_fremd uuid;
  v_n integer; v_txt text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  insert into kb_article (slug, language, audience, title, status, body_md)
  values ('test-rueckwand', 'de', array['talent'], 'Messestand: Rueckwand', 'published',
          E'## Wer muss eine Datei einsenden?\n'
          'Alle Partner mit einer bedruckten Rueckwand senden die Druckdatei ein.\n\n'
          '## Bis wann reiche ich die Druckdatei ein?\n'
          'Die Rueckwand-Datei muss bis zwei Wochen vor dem Summit im Portal liegen.')
  returning id into v_art;

  -- 01 · Die genaue Frage.
  select s.heading into v_txt from kb_search('Wer muss eine Datei einsenden?', 'talent', 'de') s limit 1;
  insert into t_res values ('01_genaue_frage',
    case when v_txt = 'Wer muss eine Datei einsenden?' then 'trifft den Abschnitt (richtig)'
         else 'unerwartet ' || coalesce(v_txt, 'null') end);

  -- 02/03 · Ein Wort, das nicht im Text steht.
  select count(*)::integer into v_n from kb_search('Bis wann muss die Rueckwand geliefert sein?', 'talent', 'de') s;
  insert into t_res values ('02_rueckfall',
    case when v_n > 0 then v_n || ' Abschnitte trotz fehlendem Wort (richtig)'
         else 'nichts gefunden (BUG - das war der Befund)' end);
  select s.slug into v_txt from kb_search('Bis wann muss die Rueckwand geliefert sein?', 'talent', 'de') s limit 1;
  insert into t_res values ('03_richtiger_artikel',
    case when v_txt = 'test-rueckwand' then 'richtiger Artikel oben (richtig)'
         else 'unerwartet ' || coalesce(v_txt, 'null') end);

  -- 04 · Unsinn bleibt Unsinn.
  select count(*)::integer into v_n from kb_search('Zebrastreifen Quantenphysik', 'talent', 'de') s;
  insert into t_res values ('04_unsinn',
    case when v_n = 0 then 'kein Treffer (richtig)' else 'unerwartet ' || v_n end);

  -- 05 · Die Zielgruppe gilt auch im Rückfall.
  insert into kb_article (slug, language, audience, title, status, body_md)
  values ('test-nur-partner-2', 'de', array['partner'], 'Nur Partner', 'published',
          E'## Geliefert wird morgens\nDie Anlieferung erfolgt frueh.')
  returning id into v_fremd;
  select count(*)::integer into v_n from kb_search('Wann wird geliefert?', 'talent', 'de') s
   where s.slug = 'test-nur-partner-2';
  insert into t_res values ('05_zielgruppe_im_rueckfall',
    case when v_n = 0 then 'fremder Artikel bleibt draussen (richtig)' else 'sichtbar (BUG)' end);
end $$;
select * from t_res order by step;
rollback;
