-- Test zu `v6_wiki_thema_produktbezug` (ADM-064 + PART-103). Belegt:
--   01 Vokabular wiki_category: sieben aktive Themen mit DE/EN, Reihenfolge 10…70;
--   02 Bestand: kein Artikel aus der bisherigen Slug-Zuordnung ohne Thema; die drei Formatartikel tragen
--      ihren Produktbezug (masterclasses → masterclass), sonst ist der Bezug leer;
--   03 upsert_kb_article: Thema und Produktbezug werden gespeichert; ein Aufruf ohne diese Schlüssel
--      lässt sie stehen; leeres Thema ⇒ NULL, leere Liste ⇒ {}; unbekanntes Thema ⇒ invalid_category,
--      unbekanntes Format ⇒ invalid_format, in beiden Fällen bleibt der Stand unverändert;
--   04 kb_articles: ohne p_formats alles sichtbar (inkl. Artikel mit Produktbezug); mit {masterclass}
--      Artikel mit Bezug + allgemeine; mit {} nur die allgemeinen; mit {talent} der Masterclass-Artikel nicht;
--   05 Overlay: ein Edition-Artikel mit Produktbezug blendet den allgemeinen evergreen-Artikel gleichen Slugs
--      bei p_formats={} NICHT wieder ein (Filter nach der Wahl Edition-vor-evergreen);
--   06 kb_article_by_slug reicht p_formats durch und liefert category/product_formats;
--   07 kb_articles_admin liefert category/product_formats;
--   08 vocab_term_usage zählt die neuen Verwendungen (wiki_category, partner_format an Artikeln);
--   09 Rechte: Person ohne Rollen ⇒ upsert 42501, kb_articles('partner') 42501; die Zielgruppenprüfung bleibt
--      auch mit p_formats (kein Zugriffsschutz-Ersatz).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_me uuid; v_uid uuid; v_email text; v_ed uuid; v_txt text; v_n integer; v_n0 integer;
  v_a uuid; v_b uuid; v_c uuid; v_cat text; v_f text; v_rows jsonb; v_lang text := 'de';
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;

  -- 01
  select count(*) || ' ' || string_agg(sort_order::text, ',' order by sort_order) || ' de_en=' || bool_and(label_de is not null and label_en is not null)::text
    into v_txt from vocab_term where vocabulary = 'wiki_category' and active;
  insert into t_res values ('01_vokabular', v_txt || ' (erwartet 7 10,20,30,40,50,60,70 de_en=true)');

  -- 02
  select count(*) into v_n from kb_article
   where category is null and slug in ('ueber-cheftreff', 'messestand-rueckwand', 'company-tours', 'masterclasses', 'talk-guidelines', 'pfand');
  select string_agg(distinct slug || '=' || array_to_string(product_formats, '+'), ' ' order by slug || '=' || array_to_string(product_formats, '+')) into v_txt
    from kb_article where cardinality(product_formats) > 0 and slug in ('masterclasses', 'company-tours', 'sponsored-talk');
  insert into t_res values ('02_bestand', 'ohne_thema=' || v_n || ' bezug=' || coalesce(v_txt, '-')
    || ' ausserhalb=' || (select count(*) from kb_article where cardinality(product_formats) > 0 and slug not in ('masterclasses', 'company-tours', 'sponsored-talk'))
    || ' (erwartet ohne_thema=0 bezug=company-tours=company_tour masterclasses=masterclass sponsored-talk=talk ausserhalb=0, sofern die Artikel vorhanden sind)');

  -- Admin handelt
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');
  insert into event (name, format_tag, slug, is_edition, start_date) values ('ZZTEST Edition Wiki', 'edition', 'zztest-wiki', true, now() - interval '12 years') returning id into v_ed;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 03
  v_a := upsert_kb_article(jsonb_build_object('slug', 'zztest-masterclass', 'title', 'ZZTEST Masterclass', 'audience', jsonb_build_array('partner'),
          'category', 'speaking', 'product_formats', jsonb_build_array('masterclass', 'talk')));
  select category, array_to_string(product_formats, '+') into v_cat, v_f from kb_article where id = v_a;
  v_txt := 'neu=' || v_cat || '/' || v_f;
  perform upsert_kb_article(jsonb_build_object('id', v_a, 'title', 'ZZTEST Masterclass 2'));
  select category, array_to_string(product_formats, '+') into v_cat, v_f from kb_article where id = v_a;
  v_txt := v_txt || ' ohne_schluessel=' || v_cat || '/' || v_f;
  begin perform upsert_kb_article(jsonb_build_object('id', v_a, 'category', 'gibt-es-nicht')); v_txt := v_txt || ' kat=ANGENOMMEN';
  exception when sqlstate '22023' then v_txt := v_txt || ' kat=' || sqlerrm; end;
  begin perform upsert_kb_article(jsonb_build_object('id', v_a, 'product_formats', jsonb_build_array('masterclass', 'zeppelin'))); v_txt := v_txt || ' fmt=ANGENOMMEN';
  exception when sqlstate '22023' then v_txt := v_txt || ' fmt=' || sqlerrm; end;
  select category, array_to_string(product_formats, '+') into v_cat, v_f from kb_article where id = v_a;
  v_txt := v_txt || ' danach=' || v_cat || '/' || v_f;
  insert into t_res values ('03a_upsert', v_txt
    || ' (erwartet neu=speaking/masterclass+talk ohne_schluessel=speaking/masterclass+talk kat=invalid_category fmt=invalid_format danach=speaking/masterclass+talk)');
  -- leeres Thema und leere Liste setzen zurück
  perform upsert_kb_article(jsonb_build_object('id', v_a, 'category', '', 'product_formats', '[]'::jsonb));
  select coalesce(category, 'NULL') || '/' || cardinality(product_formats) into v_txt from kb_article where id = v_a;
  insert into t_res values ('03b_leeren', v_txt || ' (erwartet NULL/0)');
  perform upsert_kb_article(jsonb_build_object('id', v_a, 'category', 'speaking', 'product_formats', jsonb_build_array('masterclass')));

  -- Weitere Artikel für 04 bis 06: allgemein (evergreen), Overlay mit Bezug (Test-Edition), allgemeiner Artikel mit Overlay
  perform set_config('request.jwt.claims', '', true);
  update kb_article set status = 'published' where id = v_a;
  insert into kb_article (slug, language, audience, title, status, category) values ('zztest-allgemein', 'de', array['partner'], 'ZZTEST allgemein', 'published', 'stand') returning id into v_b;
  insert into kb_article (slug, language, audience, title, status) values ('zztest-overlay', 'de', array['partner'], 'ZZTEST Overlay evergreen', 'published');
  insert into kb_article (slug, language, edition_id, audience, title, status, product_formats)
    values ('zztest-overlay', 'de', v_ed, array['partner'], 'ZZTEST Overlay Edition', 'published', array['talk']) returning id into v_c;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 04
  select string_agg(slug, ',' order by slug) into v_txt from kb_articles('partner', 'de', v_ed) where slug like 'zztest-%';
  v_txt := 'alle=' || coalesce(v_txt, '-');
  select string_agg(slug, ',' order by slug) into v_f from kb_articles('partner', 'de', v_ed, null, array['masterclass']) where slug like 'zztest-%';
  v_txt := v_txt || ' masterclass=' || coalesce(v_f, '-');
  select string_agg(slug, ',' order by slug) into v_f from kb_articles('partner', 'de', v_ed, null, array[]::text[]) where slug like 'zztest-%';
  v_txt := v_txt || ' leer=' || coalesce(v_f, '-');
  select string_agg(slug, ',' order by slug) into v_f from kb_articles('partner', 'de', v_ed, null, array['talent']) where slug like 'zztest-%';
  v_txt := v_txt || ' fremd=' || coalesce(v_f, '-');
  insert into t_res values ('04_filter', v_txt
    || ' (erwartet alle=zztest-allgemein,zztest-masterclass,zztest-overlay masterclass=zztest-allgemein,zztest-masterclass leer=zztest-allgemein fremd=zztest-allgemein)');
  -- Hinweis: „fremd“ nennt ein Format, das kein Artikel führt (vocab-fremd, nur zum Filtern, nicht gespeichert).

  -- 05 · Overlay mit Bezug {talent}: mit {} bleibt der Slug ganz draussen, mit {talent} kommt die Edition-Fassung
  select string_agg(title, ',') into v_txt from kb_articles('partner', 'de', v_ed, null, array[]::text[]) where slug = 'zztest-overlay';
  select string_agg(title, ',') into v_f from kb_articles('partner', 'de', v_ed, null, array['talk']) where slug = 'zztest-overlay';
  insert into t_res values ('05_overlay', 'leer=' || coalesce(v_txt, '-') || ' talk=' || coalesce(v_f, '-')
    || ' ohne_edition=' || (select count(*) from kb_articles('partner', 'de', null, null, array[]::text[]) where slug = 'zztest-overlay')
    || ' (erwartet leer=- talk=ZZTEST Overlay Edition ohne_edition=1)');

  -- 06
  select slug || ':' || coalesce(category, '-') || ':' || array_to_string(product_formats, '+') into v_txt
    from kb_article_by_slug('zztest-masterclass', 'partner', 'de', v_ed, array['masterclass']);
  select count(*) into v_n from kb_article_by_slug('zztest-masterclass', 'partner', 'de', v_ed, array['talent']);
  insert into t_res values ('06_by_slug', coalesce(v_txt, '-') || ' gefiltert=' || v_n
    || ' (erwartet zztest-masterclass:speaking:masterclass gefiltert=0)');

  -- 07
  select category || ':' || array_to_string(product_formats, '+') into v_txt from kb_articles_admin('partner') where id = v_a;
  insert into t_res values ('07_admin', coalesce(v_txt, '-') || ' (erwartet speaking:masterclass)');

  -- 08
  insert into t_res values ('08_verwendung', 'thema=' || (vocab_term_usage('wiki_category', 'speaking') >= 1)::text
    || ' format=' || (vocab_term_usage('partner_format', 'masterclass') >= 1)::text
    || ' (erwartet true true: ein benutzter Begriff lässt sich nicht löschen)');

  -- 09 · ohne Rollen
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  v_txt := '';
  begin perform upsert_kb_article(jsonb_build_object('id', v_a, 'category', 'stand')); v_txt := 'upsert=ERLAUBT'; exception when sqlstate '42501' then v_txt := 'upsert=42501'; end;
  begin perform * from kb_articles('partner', 'de', v_ed, null, array[]::text[]); v_txt := v_txt || ' lesen=ERLAUBT'; exception when sqlstate '42501' then v_txt := v_txt || ' lesen=42501'; end;
  select category into v_cat from kb_article where id = v_a;
  insert into t_res values ('09_rechte', v_txt || ' thema_unveraendert=' || v_cat || ' (erwartet upsert=42501 lesen=42501 thema_unveraendert=speaking)');
end $$;
select * from t_res order by step;
rollback;
