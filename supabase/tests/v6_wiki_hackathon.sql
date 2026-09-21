-- Smoke-Test 0129 (Wiki: Hackathon-Inhalte für Partner, PART-018). Belegt:
--   01 sechs Artikel sind angelegt, alle für die Zielgruppe `partner`;
--   02 **alle stehen als `draft`** — im Portal unsichtbar, bis Konrad sie freischaltet;
--   03 sie sind jahresunabhängig (`edition_id is null`), damit ein Overlay je Edition
--      später darüber passt;
--   04 **keine Telefonnummer im Bestand** — die Mobilnummer aus der Quelle wurde bewusst
--      nicht übernommen (Ansprechpersonen gehören in `edition_contact`, und was einmal in
--      einer Migration steht, bleibt in der Historie);
--   05 keine Mailadresse im Text, aus demselben Grund;
--   06 die Firmennamen der Challenges 2025/2026 kommen nicht vor — interne Aufgaben fremder
--      Unternehmen gehören nicht in ein Portal, das alle Partner lesen;
--   07 die Daten und der Ort von 2026 stehen nicht drin (der Hackathon 27 läuft am 15./16.04.);
--   08 die Grafikanforderungen der Rückwand sind vollständig, samt Endformat
--      1610 × 2790 mm (Konrad 21.09., D4-Ergänzung);
--   09 als Entwurf sieht ein Partner sie nicht, nach dem Freischalten schon;
--   10 ein zweiter Lauf der Migration legt nichts doppelt an.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_n integer; v_txt text; v_id uuid;
  v_slugs text[] := array['hackathon-challenge-definieren','hackathon-mentoren-jury','hackathon-preise',
                          'hackathon-pitch-vorstellung','hackathon-teilnehmende','hackathon-rueckwand'];
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 Sechs Artikel für Partner
  select count(*)::integer into v_n from kb_article
   where slug = any(v_slugs) and audience @> '{partner}';
  insert into t_res values ('01_sechs_artikel',
    case when v_n = 6 then 'sechs Artikel fuer Partner (richtig)' else 'unerwartet ' || v_n end);

  -- 02 Alle als Entwurf
  select count(*)::integer into v_n from kb_article where slug = any(v_slugs) and status <> 'draft';
  insert into t_res values ('02_alle_entwurf',
    case when v_n = 0 then 'alle draft (richtig — Konrad schaltet frei)'
         else 'ALLOWED (BUG): ' || v_n || ' schon sichtbar' end);

  -- 03 Jahresunabhaengig
  select count(*)::integer into v_n from kb_article where slug = any(v_slugs) and edition_id is not null;
  insert into t_res values ('03_evergreen',
    case when v_n = 0 then 'alle jahresunabhaengig (richtig)' else 'unerwartet ' || v_n end);

  -- 04 Keine Telefonnummer. Geprueft wird auf Ziffernfolgen, die wie eine Nummer aussehen,
  --    nicht auf die eine bekannte — sonst faende der Test nur, was er schon kennt.
  select count(*)::integer into v_n from kb_article
   where slug = any(v_slugs) and (body_md ~ '\+49[ 0-9/-]{6,}' or body_md ~ '\m0[1-9][0-9]{2,}[ /-][0-9]{5,}');
  insert into t_res values ('04_keine_telefonnummer',
    case when v_n = 0 then 'keine Nummer im Bestand (richtig)'
         else 'ALLOWED (BUG): ' || v_n || ' Artikel mit Nummer' end);

  -- 05 Keine Mailadresse
  select count(*)::integer into v_n from kb_article
   where slug = any(v_slugs) and body_md ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}';
  insert into t_res values ('05_keine_mailadresse',
    case when v_n = 0 then 'keine Adresse im Text (richtig)' else 'ALLOWED (BUG): ' || v_n end);

  -- 06 Keine fremden Firmennamen aus den Challenges der Vorjahre
  select count(*)::integer into v_n from kb_article
   where slug = any(v_slugs)
     and (body_md ilike '%1KOMMA5%' or body_md ilike '%BEAM.AI%' or body_md ilike '%Netlight%'
          or body_md ilike '%Otto Dörner%' or body_md ilike '%Knowunity%' or body_md ilike '%BioNTech%'
          or body_md ilike '%Eurogate%' or body_md ilike '%Finanz Informatik%');
  insert into t_res values ('06_keine_fremdfirmen',
    case when v_n = 0 then 'keine fremden Challenge-Inhalte (richtig)'
         else 'ALLOWED (BUG): ' || v_n || ' Artikel nennen fremde Firmen' end);

  -- 07 Keine Daten und Orte von 2026
  select count(*)::integer into v_n from kb_article
   where slug = any(v_slugs)
     and (body_md ilike '%Hammerbrooklyn%' or body_md ilike '%2026%' or body_md ilike '%luma.com%');
  insert into t_res values ('07_kein_2026',
    case when v_n = 0 then 'jahresfrei (richtig)' else 'ALLOWED (BUG): ' || v_n end);

  -- 08 Grafikanforderungen vollstaendig
  select body_md into v_txt from kb_article where slug = 'hackathon-rueckwand';
  insert into t_res values ('08_rueckwand_vollstaendig',
    case when v_txt like '%100 mm%' and v_txt like '%PDF/X-4%' and v_txt like '%ISO Coated v2%'
              and v_txt like '%62 dpi%' and v_txt like '%Beschnitt%'
              and v_txt like '%1610 × 2790 mm%'
         then 'alle sieben Angaben samt Endformat (richtig)' else 'unvollstaendig' end);

  -- 09 Sichtbarkeit: Entwurf nein, freigeschaltet ja.
  --    Die Rolle kommt unmittelbar vor dem Schritt, der sie braucht (Konvention §6): ohne
  --    Zielgruppe `partner` liefert `kb_articles` gar nichts, und „unsichtbar" saehe dann
  --    genauso aus wie „kein Zugriff" — der Test waere gruen aus dem falschen Grund.
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'partner_contact', 'global');
  insert into t_res values ('09_vorbedingung',
    case when 'partner' = any(my_kb_audiences()) then 'Zielgruppe partner (richtig)'
         else 'FEHLT — die folgenden Schritte waeren aussagelos' end);
  select count(*)::integer into v_n from kb_articles('partner', 'de', v_ed) a where a.slug = any(v_slugs);
  insert into t_res values ('09_entwurf_unsichtbar',
    case when v_n = 0 then 'nicht im Portal (richtig)' else 'ALLOWED (BUG): ' || v_n || ' sichtbar' end);
  select id into v_id from kb_article where slug = 'hackathon-preise';
  update kb_article set status = 'published', published_at = now() where id = v_id;
  select count(*)::integer into v_n from kb_articles('partner', 'de', v_ed) a where a.slug = 'hackathon-preise';
  insert into t_res values ('09b_freigeschaltet_sichtbar',
    case when v_n = 1 then 'nach dem Freischalten sichtbar (richtig)' else 'unerwartet ' || v_n end);

  delete from role_assignment where person_id = v_pid and role = 'partner_contact';

  -- 10 Zweiter Lauf legt nichts doppelt an
  insert into kb_article (slug, edition_id, language, audience, phase, title, body_md, status)
  values ('hackathon-preise', null, 'de', '{partner}', 'evergreen', 'ZZ Doppelt', 'ZZ', 'draft')
  on conflict do nothing;
  select count(*)::integer into v_n from kb_article where slug = 'hackathon-preise' and edition_id is null;
  insert into t_res values ('10_kein_duplikat',
    case when v_n = 1 then 'einmal (richtig)' else 'ALLOWED (BUG): ' || v_n || 'mal' end);
end $$;

select * from t_res order by step;
rollback;
