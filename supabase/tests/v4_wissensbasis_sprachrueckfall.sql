-- Smoke-Test 0088 (Wissensbasis · Sprachrückfall). Belegt:
--   01 gibt es den Artikel nur auf Englisch, kommt er auch bei p_language='de'
--      — mit `language = 'en'` in der Antwort, damit die Seite es kennzeichnen kann;
--   02 gibt es beide Sprachen, gewinnt die gefragte;
--   03 eine Überlagerung der Edition sticht den evergreen auch dann, wenn sie
--      in der anderen Sprache steht (überholt schlägt fremdsprachig nicht);
--   04 je Slug kommt weiterhin genau eine Zeile;
--   05 eine unbekannte Sprache ('fr') ist kein Fehler, sondern Deutsch;
--   06 die Rechteprüfung bleibt: fremde Zielgruppe ⇒ 42501.
-- Vor 0088 war 01 rot (leere Liste) — genau der Befund von `/speaker/wiki`
-- im Walkthrough am 14.09.2026.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_n integer; v_lang text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, valid_from)
  values (v_pid, 'speaker', 'edition', null, v_ed, now() - interval '1 day');

  -- Wegwerf-Artikel. `zzsprach-*` bleibt vom echten Bestand unterscheidbar.
  insert into kb_article (slug, edition_id, language, audience, status, title, body_md)
  values ('zzsprach-nur-en', null, 'en', array['speaker'], 'published', 'Only English', 'EN'),
         ('zzsprach-beide',  null, 'en', array['speaker'], 'published', 'Both EN',      'EN'),
         ('zzsprach-beide',  null, 'de', array['speaker'], 'published', 'Beide DE',     'DE'),
         ('zzsprach-overlay', null, 'de', array['speaker'], 'published', 'Evergreen DE', 'alt'),
         ('zzsprach-overlay', v_ed, 'en', array['speaker'], 'published', 'Overlay EN',  'neu');

  -- 01 nur Englisch, gefragt ist Deutsch
  select k.language into v_lang from kb_articles('speaker', 'de', v_ed) k
   where k.slug = 'zzsprach-nur-en';
  insert into t_res values ('01_nur_en',
    case when v_lang = 'en' then 'geliefert, language=en (richtig)'
         when v_lang is null then 'LEER (BUG)' else 'unerwartet ' || v_lang end);

  -- 02 beide Sprachen da
  select k.language into v_lang from kb_articles('speaker', 'de', v_ed) k
   where k.slug = 'zzsprach-beide';
  insert into t_res values ('02_beide_de',
    case when v_lang = 'de' then 'de gewinnt (richtig)' else 'FALSCHE SPRACHE ' || coalesce(v_lang, 'leer') end);
  select k.language into v_lang from kb_articles('speaker', 'en', v_ed) k
   where k.slug = 'zzsprach-beide';
  insert into t_res values ('02_beide_en',
    case when v_lang = 'en' then 'en gewinnt (richtig)' else 'FALSCHE SPRACHE ' || coalesce(v_lang, 'leer') end);

  -- 03 Overlay in der anderen Sprache sticht den evergreen
  select k.title into v_lang from kb_articles('speaker', 'de', v_ed) k
   where k.slug = 'zzsprach-overlay';
  insert into t_res values ('03_overlay_vor_sprache',
    case when v_lang = 'Overlay EN' then 'Overlay gewinnt (richtig)' else 'EVERGREEN (BUG): ' || coalesce(v_lang, 'leer') end);

  -- 04 eine Zeile je Slug
  select count(*) into v_n from kb_articles('speaker', 'de', v_ed) k
   where k.slug like 'zzsprach-%';
  insert into t_res values ('04_eine_zeile_je_slug',
    case when v_n = 3 then '3 Slugs, 3 Zeilen (richtig)' else 'DOPPELT: ' || v_n end);

  -- 05 unbekannte Sprache
  select k.language into v_lang from kb_articles('speaker', 'fr', v_ed) k
   where k.slug = 'zzsprach-beide';
  insert into t_res values ('05_unbekannte_sprache',
    case when v_lang = 'de' then 'faellt auf de (richtig)' else 'unerwartet ' || coalesce(v_lang, 'leer') end);

  -- 06 fremde Zielgruppe
  begin
    perform kb_articles('partner', 'de', v_ed);
    insert into t_res values ('06_fremde_zielgruppe', 'ALLOWED (BUG)');
  exception when others then
    insert into t_res values ('06_fremde_zielgruppe', 'abgewiesen ' || sqlstate);
  end;
end $$;
select * from t_res order by step;
rollback;
-- Lauf am 14.09. gegen Frankfurt: ohne 0088 rot in 01, 03, 04, 05;
-- mit 0088 im selben Transaktionsblock alle sieben gruen.
