-- 0294 · Wiki: fette Zeilen werden Zwischenüberschriften (PART-104 Teil 2, Redaktion)
-- Angewendet von der Architektur-Session am 09.10.2026 als 20261009080045.
--
-- Anlass: Konrad & Leopold 05.10.2026 (Durchgang Partner-Portal): „unübersichtlich, Abschnitte und Überschriften nicht klar erkennbar, auch in
-- den Texten unsaubere Überschriften“. Vorschlag `docs/design-vorschlaege-2026-10-06.md` §1 (Konrads Go 08.10., K-73), Plan 09.10.2026:
-- die Gliederung im Text. Die Unterabschnitte stehen als **fette Zeilen** (eine Zeile, die nur aus `**…**` besteht): „Schritt 1: Code
-- eingeben und Ticket einlösen“, „A) Offizielle Getränkepartner“, „Beispiel 3: …“. Sie sehen aus wie Betonung, nicht wie Überschrift,
-- und die Seite kann sie nicht gliedern. Seit PART-104 Teil 1 macht der Renderer aus `###` einen `h3` in `ct-h3`.
--
-- * **Neue Hilfsfunktion `wiki_fette_zeilen_zu_ueberschriften(text)`:** macht aus jeder Zeile, die **ausschließlich** aus einem fetten Stück
--   besteht, die Zeile `### …`. Nur die Markierung ändert sich, nicht der Wortlaut — mit drei Regeln:
--     – ein **Doppelpunkt am Ende** fällt weg, innerhalb oder hinter dem Fett („**Adresse:**“ → „### Adresse“; Plan 09.10.: eine Überschrift
--       endet nicht mit „:“). Doppelpunkte mitten im Text und Nummern bleiben („### Schritt 1: Code eingeben …“);
--     – eine Zeile, die nach dem Entfetten **leer** wäre, bleibt unberührt (Plan 09.10.);
--     – ein **fetter Satz mit Punkt oder Ausrufezeichen am Ende** bleibt fett („Wichtig: Ohne Chip kein Pfand zurück.“, „Important: no chip,
--       no deposit back.“ im Artikel Pfand): das ist ein Hinweis, keine Überschrift. Fragen mit „?“ sind Überschriften.
--   Geprüft wird je **Zeile** — so liest auch der Renderer (`parseMarkdown`: jede Zeile ist ein Block); ein Eintrag der Liste („- **Fett**“),
--   ein Zitat („> **Fett**“), eine Tabellenzeile, eine eingerückte Zeile und eine Zeile mit mehr als einem Fettstück bleiben, wie sie sind.
-- * **Daten:** alle Zeilen von `kb_article` (jede Sprache, jeder Status, mit und ohne Edition) — im Bestand vom 09.10.2026 sind es 52 fette Zeilen in
--   18 Artikeln (neun deutsche, neun englische Entwürfe, je 26), davon 50 Überschriften und die zwei fetten Sätze im Artikel Pfand. `updated_at` bleibt:
--   eine reine Markierung ist kein neuer „Stand“ des Artikels; die Migration prüft es und bricht sonst ab. Der Trigger `trg_kb_article_chunks`
--   zerlegt die geänderten Artikel neu (die Abschnitte der Suche des Assistenten sind die `##`; `###` bleibt im Text des Abschnitts).
-- * **Idempotent:** ein zweiter Lauf ändert keine Zeile (Test). **Kein Audit-Eintrag** — eine Datenmigration ohne handelnde Person (Plan 09.10.).
-- * `content/wiki/*.md` (die Quelle des Imports `scripts/wiki-import.mjs`) zieht im selben PR gleich, damit Repo und Datenbank wieder
--   deckungsgleich sind; `tests/wiki-gliederung.test.ts` hält fest, dass dort keine fette Zeile mehr als Überschrift gemeint ist.
-- * Die Hilfsfunktion ist kein Rechtepunkt: nur lesender Text-Umbau, für anon und authenticated nicht ausführbar. Sie darf später fallen,
--   wenn niemand sie mehr braucht (der Editor warnt im Browser, `components/wiki/markdown-parse.ts`).
-- Fehlerschlüssel: keine (Datenmigration).
set search_path = public, extensions;

create or replace function wiki_fette_zeilen_zu_ueberschriften(p_md text) returns text
language sql immutable parallel safe
set search_path = public, extensions
as $f$
  select string_agg(
           case when u.text is not null and u.text !~ '[.!]$' then '### ' || u.text else z.zeile end,
           E'\n' order by z.nr)
    from regexp_split_to_table(p_md, E'\n') with ordinality as z(zeile, nr)
   cross join lateral (
           select nullif(btrim(regexp_replace(btrim(m.t[1]), ':+$', '')), '') as text
             from (select regexp_match(z.zeile, '^\*\*([^*]+)\*\*:?[ \t\r]*$') as t) as m
         ) as u
$f$;

comment on function wiki_fette_zeilen_zu_ueberschriften(text) is
  'PART-104 Teil 2: macht aus Zeilen, die nur aus **…** bestehen, ### Überschriften (Doppelpunkt am Ende fällt weg; fette Sätze mit Punkt oder Ausrufezeichen bleiben). Reiner Text-Umbau.';

revoke execute on function wiki_fette_zeilen_zu_ueberschriften(text) from public, anon, authenticated;

do $mig$
declare
  v_zeilen integer;
  v_artikel integer;
  v_geaendert integer;
  v_abweichung integer;
begin
  create temp table t_kb_vorher on commit drop as select id, updated_at from kb_article;

  -- Wie viele Zeilen in wie vielen Artikeln gehen an: für die Meldung und als Gegenprobe zum Update.
  select coalesce(sum(s.n), 0), count(*) into v_zeilen, v_artikel
    from (select (select count(*) from regexp_split_to_table(a.body_md, E'\n') as l
                   where wiki_fette_zeilen_zu_ueberschriften(l) is distinct from l) as n
            from kb_article a) s
   where s.n > 0;

  update kb_article
     set body_md = wiki_fette_zeilen_zu_ueberschriften(body_md)
   where body_md is distinct from wiki_fette_zeilen_zu_ueberschriften(body_md);
  get diagnostics v_geaendert = row_count;

  if v_geaendert <> v_artikel then
    raise exception 'wiki_zwischenueberschriften: % Artikel gezählt, % geändert', v_artikel, v_geaendert;
  end if;

  select count(*) into v_abweichung
    from kb_article a join t_kb_vorher v on v.id = a.id
   where a.updated_at is distinct from v.updated_at;
  if v_abweichung > 0 then
    raise exception 'wiki_zwischenueberschriften: updated_at hat sich bei % Artikeln geändert — eine Markierung ist kein neuer Stand', v_abweichung;
  end if;

  raise notice 'wiki_zwischenueberschriften: % Zeilen in % Artikeln', v_zeilen, v_artikel;
end
$mig$;

select harden_definer_functions();
