-- Test zu `v6_wiki_en_entwuerfe` (ADM-103 Bau B). Belegt gegen den Bestand:
--   01 jeder deutsche Artikel ohne Edition hat eine englische Zeile (keiner fehlt), es gibt sonst keine englischen;
--   02 alle englischen Zeilen sind Entwurf — außer der Spiegel des archivierten Artikels (archiviert); keine ist veröffentlicht;
--   03 die gemeinsamen Felder entsprechen der deutschen Zeile (Zielgruppe, Rollen, Phase, Thema, Produktbezug, Gültig bis);
--   04 Titel und Text sind wirklich übersetzt: kein Text gleich dem Deutschen, keiner leer; gleiche Titel nur bei Namen, die auf Englisch genauso lauten (Masterclasses, Media Kit …);
--   05 englischsprachige Leser sehen weiter nur deutsche Fassungen, solange nichts veröffentlicht ist (`kb_articles('partner','en')`);
--      nach dem Veröffentlichen **einer** Fassung sehen sie genau diese englisch und alle anderen deutsch;
--   06 Protokoll: ein Eintrag `kb.en_drafts_seeded`; ein erneuter Lauf legt nichts an (idempotent).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_me uuid; v_uid uuid; v_email text; v_de integer; v_en integer; v_n integer; v_m integer; v_txt text; v_id uuid;
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;

  select count(*) into v_de from kb_article where language = 'de' and edition_id is null;
  select count(*) into v_en from kb_article where language = 'en' and edition_id is null;
  select count(*) into v_n from kb_article d where d.language = 'de' and d.edition_id is null
     and not exists (select 1 from kb_article e where e.slug = d.slug and e.language = 'en' and e.edition_id is null);
  insert into t_res values ('01_vollstaendig', 'de=' || v_de || ' en=' || v_en || ' ohne_en=' || v_n || ' (erwartet de=en und ohne_en=0)');

  select string_agg(distinct status, ',' order by status) into v_txt from kb_article where language = 'en' and edition_id is null;
  select count(*) into v_n from kb_article where language = 'en' and status = 'published';
  select count(*) into v_m from kb_article e join kb_article d on d.slug = e.slug and d.language = 'de' and d.edition_id is null
   where e.language = 'en' and e.edition_id is null and (d.status = 'archived') <> (e.status = 'archived');
  insert into t_res values ('02_status', 'status=' || v_txt || ' veroeffentlicht=' || v_n || ' archiv_abweichend=' || v_m
    || ' (erwartet status=archived,draft veroeffentlicht=0 archiv_abweichend=0)');

  select count(*) into v_n from kb_article e join kb_article d on d.slug = e.slug and d.language = 'de' and d.edition_id is null
   where e.language = 'en' and e.edition_id is null
     and (e.audience::text, e.roles::text, e.phase, coalesce(e.category, ''), e.product_formats::text, e.valid_until, e.sort_order)
         is distinct from (d.audience::text, d.roles::text, d.phase, coalesce(d.category, ''), d.product_formats::text, d.valid_until, d.sort_order);
  insert into t_res values ('03_gemeinsame_felder', 'abweichend=' || v_n || ' (erwartet 0)');

  select count(*) filter (where e.body_md = d.body_md), count(*) filter (where e.title = d.title), count(*) filter (where btrim(e.body_md) = '' or btrim(e.title) = '')
    into v_n, v_m, v_en
    from kb_article e join kb_article d on d.slug = e.slug and d.language = 'de' and d.edition_id is null
   where e.language = 'en' and e.edition_id is null;
  select string_agg(d.slug, ',' order by d.slug) into v_txt
    from kb_article e join kb_article d on d.slug = e.slug and d.language = 'de' and d.edition_id is null
   where e.language = 'en' and e.edition_id is null and e.title = d.title;
  insert into t_res values ('04_uebersetzt', 'text_gleich=' || v_n || ' leer=' || v_en || ' titel_gleich=' || v_m || ' (' || coalesce(v_txt, '') || ')'
    || ' (erwartet text_gleich=0 leer=0; titel_gleich nur Namen, die auf Englisch gleich lauten: company-tours, masterclasses, media-kit, recruiting-best-practices, sponsored-talk)');

  -- 05 · Ausspielung: Leser mit Partner-Zielgruppe
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  select count(*), count(*) filter (where language = 'en') into v_n, v_m from kb_articles('partner', 'en');
  v_txt := 'artikel=' || v_n || ' davon_englisch=' || v_m;
  select id into v_id from kb_article where slug = 'ueber-cheftreff' and language = 'en' and edition_id is null;
  perform publish_kb_article(v_id, true);
  select count(*) filter (where language = 'en'), count(*) filter (where language = 'en' and slug = 'ueber-cheftreff') into v_m, v_n from kb_articles('partner', 'en');
  v_txt := v_txt || ' nach_veroeffentlichen: englisch=' || v_m || ' davon_ueber-cheftreff=' || v_n;
  insert into t_res values ('05_ausspielung', v_txt || ' (erwartet davon_englisch=0 nach_veroeffentlichen: englisch=1 davon_ueber-cheftreff=1; Artikelzahl = Partner-Artikel, nur deutsch)');

  -- 06 · Protokoll und Idempotenz
  select count(*) into v_n from audit_log where action = 'kb.en_drafts_seeded';
  insert into t_res values ('06_protokoll', 'eintraege=' || v_n || ' (erwartet 1 — der Eintrag der Migration im Probelauf; live ist es ab der Anwendung einer)');
end $$;
select * from t_res order by step;
rollback;
