-- Test zu `v6_wiki_artikelpaar` (ADM-103). Belegt (nur über ZZTEST-Artikel):
--   01 Paar neu anlegen: zwei Zeilen (DE, EN), gleiche gemeinsame Felder, beide als Entwurf; ohne EN-Teil nur DE;
--   02 gemeinsame Felder gehen in beide Zeilen (Zielgruppe, Thema, Phase); nur EN-Text ändert DE nicht;
--   03 neue Sprache erbt die gemeinsamen Felder der vorhandenen (EN zu einem DE-Artikel mit Zielgruppe partner,
--      Thema, Produktbezug) und ist Entwurf; Status DE bleibt veröffentlicht;
--   04 Rechte: area_lead_partner ändert ein Partner-Paar, aber nicht auf Zielgruppe speaker (42501) und nichts davon
--      bleibt stehen (Transaktion); talent_team ohne Recht 42501; Fremdartikel (speaker) 42501;
--   05 Fehler: leerer Slug invalid_slug, unbekannte Zielgruppe invalid_audience, unbekanntes gemeinsames Feld fields_required,
--      nichts übergeben fields_required;
--   06 kb_articles() liefert einem englischen Aufrufer die englische Fassung, sobald sie veröffentlicht ist, sonst die deutsche.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_me uuid; v_uid uuid; v_email text; v_txt text; v_n integer; v_ids jsonb; v_de uuid; v_en uuid; v_ed uuid;
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01
  v_ids := upsert_kb_article_pair('zztest-paar', null,
    '{"audience":["partner"],"phase":"vor","category":"summit","product_formats":["masterclass"]}'::jsonb,
    '{"title":"ZZTEST Titel DE","body_md":"Text DE"}'::jsonb, '{"title":"ZZTEST Title EN","body_md":"Text EN"}'::jsonb);
  select id into v_de from kb_article where slug = 'zztest-paar' and language = 'de';
  select id into v_en from kb_article where slug = 'zztest-paar' and language = 'en';
  select count(*) into v_n from kb_article where slug = 'zztest-paar';
  insert into t_res values ('01a_paar_neu', 'zeilen=' || v_n || ' ids_stimmen=' || ((v_ids ->> 'de') = v_de::text and (v_ids ->> 'en') = v_en::text)::text
    || ' status=' || (select string_agg(distinct status, ',') from kb_article where slug = 'zztest-paar')
    || ' gleich=' || (select count(distinct (audience::text || phase || category || product_formats::text)) from kb_article where slug = 'zztest-paar')
    || ' (erwartet zeilen=2 ids_stimmen=true status=draft gleich=1)');
  perform upsert_kb_article_pair('zztest-nur-de', null, '{"audience":["speaker"],"category":"speaking"}'::jsonb, '{"title":"ZZTEST nur DE","body_md":"x"}'::jsonb, null);
  select count(*) into v_n from kb_article where slug = 'zztest-nur-de';
  insert into t_res values ('01b_nur_de', 'zeilen=' || v_n || ' sprache=' || (select language from kb_article where slug = 'zztest-nur-de') || ' (erwartet zeilen=1 sprache=de)');

  -- 02
  update kb_article set updated_at = now() - interval '1 day' where slug = 'zztest-paar';
  perform upsert_kb_article_pair('zztest-paar', null, '{"audience":["partner","speaker"],"category":"stand","phase":"event"}'::jsonb, null, null);
  insert into t_res values ('02a_gemeinsam', 'de=' || (select audience::text || '/' || category || '/' || phase from kb_article where id = v_de)
    || ' en=' || (select audience::text || '/' || category || '/' || phase from kb_article where id = v_en)
    || ' (erwartet beide {partner,speaker}/stand/event)');
  update kb_article set updated_at = now() - interval '1 day' where slug = 'zztest-paar';
  perform upsert_kb_article_pair('zztest-paar', null, null, null, '{"title":"ZZTEST Title EN 2"}'::jsonb);
  insert into t_res values ('02b_nur_en', 'en=' || (select title from kb_article where id = v_en) || ' de=' || (select title from kb_article where id = v_de)
    || ' de_unberuehrt=' || ((select updated_at from kb_article where id = v_de) < now() - interval '1 hour')::text
    || ' (erwartet en=ZZTEST Title EN 2 de=ZZTEST Titel DE de_unberuehrt=true)');

  -- 03
  perform upsert_kb_article_pair('zztest-erbe', null, '{"audience":["partner"],"category":"stand","product_formats":["company_tour"],"phase":"vor"}'::jsonb,
                                 '{"title":"ZZTEST Erbe DE","body_md":"x"}'::jsonb, null);
  perform publish_kb_article((select id from kb_article where slug = 'zztest-erbe' and language = 'de'), true);
  perform upsert_kb_article_pair('zztest-erbe', null, null, null, '{"title":"ZZTEST Erbe EN","body_md":"y"}'::jsonb);
  insert into t_res values ('03_erbt', 'en=' || (select audience::text || '/' || category || '/' || product_formats::text || '/' || phase || '/' || status from kb_article where slug = 'zztest-erbe' and language = 'en')
    || ' de_status=' || (select status from kb_article where slug = 'zztest-erbe' and language = 'de')
    || ' (erwartet en={partner}/stand/{company_tour}/vor/draft de_status=published)');

  -- 04 · Rechte
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'area_lead_partner', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  perform upsert_kb_article_pair('zztest-erbe', null, '{"category":"vorort"}'::jsonb, '{"title":"ZZTEST Erbe DE 2"}'::jsonb, null);
  v_txt := 'partner_aendert=' || (select category from kb_article where slug = 'zztest-erbe' and language = 'en');
  begin
    perform upsert_kb_article_pair('zztest-erbe', null, '{"audience":["speaker"]}'::jsonb, '{"title":"ZZTEST soll nicht bleiben"}'::jsonb, null);
    v_txt := v_txt || ' auf_speaker=ERLAUBT';
  exception when sqlstate '42501' then v_txt := v_txt || ' auf_speaker=42501'; end;
  v_txt := v_txt || ' titel_blieb=' || ((select title from kb_article where slug = 'zztest-erbe' and language = 'de') = 'ZZTEST Erbe DE 2')::text;
  begin perform upsert_kb_article_pair('zztest-nur-de', null, null, '{"title":"x"}'::jsonb, null); v_txt := v_txt || ' fremd=ERLAUBT';
  exception when sqlstate '42501' then v_txt := v_txt || ' fremd=42501'; end;
  insert into t_res values ('04a_partner_lead', v_txt || ' (erwartet partner_aendert=vorort auf_speaker=42501 titel_blieb=true fremd=42501)');

  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'talent_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin perform upsert_kb_article_pair('zztest-erbe', null, null, '{"title":"x"}'::jsonb, null); v_txt := 'ERLAUBT'; exception when sqlstate '42501' then v_txt := '42501'; end;
  insert into t_res values ('04b_ohne_recht', 'talent_team=' || v_txt || ' (erwartet 42501)');

  -- 05 · Fehler
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  v_txt := '';
  begin perform upsert_kb_article_pair('  ', null, null, '{"title":"x"}'::jsonb, null); v_txt := 'A'; exception when sqlstate '22023' then v_txt := sqlerrm; end;
  begin perform upsert_kb_article_pair('zztest-neu', null, '{"audience":["bunt"]}'::jsonb, '{"title":"x"}'::jsonb, null); v_txt := v_txt || ' / A'; exception when sqlstate '22023' then v_txt := v_txt || ' / ' || sqlerrm; end;
  begin perform upsert_kb_article_pair('zztest-paar', null, '{"status":"published"}'::jsonb, null, null); v_txt := v_txt || ' / A'; exception when sqlstate '22023' then v_txt := v_txt || ' / ' || sqlerrm; end;
  begin perform upsert_kb_article_pair('zztest-paar', null, null, null, null); v_txt := v_txt || ' / A'; exception when sqlstate '22023' then v_txt := v_txt || ' / ' || sqlerrm; end;
  insert into t_res values ('05_fehler', v_txt || ' (erwartet invalid_slug / invalid_audience / fields_required / fields_required)');

  -- 06 · Ausspielung nach Sprache (nur Veröffentlichtes; Aufrufer mit Partner-Zielgruppe)
  perform publish_kb_article((select id from kb_article where slug = 'zztest-erbe' and language = 'en'), false);
  v_txt := 'en_entwurf=' || coalesce((select language from kb_articles('partner', 'en') where slug = 'zztest-erbe'), '-');
  perform publish_kb_article((select id from kb_article where slug = 'zztest-erbe' and language = 'en'), true);
  v_txt := v_txt || ' en_veroeffentlicht=' || coalesce((select language from kb_articles('partner', 'en') where slug = 'zztest-erbe'), '-')
        || ' de_aufrufer=' || coalesce((select language from kb_articles('partner', 'de') where slug = 'zztest-erbe'), '-');
  insert into t_res values ('06_ausspielung', v_txt || ' (erwartet en_entwurf=de en_veroeffentlicht=en de_aufrufer=de)');
end $$;
select * from t_res order by step;
rollback;
