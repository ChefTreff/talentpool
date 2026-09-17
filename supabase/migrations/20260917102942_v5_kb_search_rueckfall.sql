-- =============================================================================
-- 0109 · Welle 5 · Die Suche gibt nicht beim ersten fehlenden Wort auf
--     Angewendet von der Architektur-Session am 17.09.2026 als 20260917102942
--
-- Korrigiert 0108 (`kb_search`).
--
-- **Befund aus dem Walkthrough vom 17.09.**, an echten Artikeln: die Frage
-- „Bis wann muss die Rückwand geliefert sein?" fand **nichts** — obwohl der
-- Artikel `messestand-rueckwand` genau das beantwortet, im Abschnitt „Bis wann
-- und wo reiche ich die Druckdatei ein?".
--
-- Der Grund steht in einem Zeichen: `websearch_to_tsquery` verknüpft mit UND.
-- Aus der Frage wird `'wann' & 'ruckwand' & 'geliefert'`, und weil im Wiki
-- „einsenden" steht und nicht „geliefert", fällt **alles** heraus. So fragt
-- aber niemand: eine natürliche Frage enthält fast immer ein Wort, das im Text
-- nicht vorkommt. Der Assistent hätte am ersten Tag auf die Hälfte aller Fragen
-- „Dazu steht nichts im Wiki" geantwortet, obwohl es dort steht — und das ist
-- die Sorte Fehler, die Vertrauen kostet und nie gemeldet wird.
--
-- **Der Rückfall:** erst UND, und nur wenn das nichts findet, dasselbe als ODER.
-- In dieser Reihenfolge, weil die genaue Frage die bessere Antwort verdient:
-- wer alle Wörter trifft, soll nicht mit halbpassenden Abschnitten verdünnt
-- werden. Erst wenn es sonst gar nichts gäbe, zählt jedes Wort für sich.
--
-- Die ODER-Fassung entsteht aus der **bereits geparsten** `tsquery`, nicht aus
-- dem Eingabetext: `replace(v_q::text, '&', '|')`. Damit bleibt die Eingabe
-- durch `websearch_to_tsquery` gegangen — die Anführungszeichen-Phrasen
-- (`<->`) bleiben erhalten, und aus der Frage kann nichts nachträglich in die
-- Abfrage geraten.
--
-- Gegenprobe an den zehn freigeschalteten Artikeln (Walkthrough): UND 0 Treffer,
-- ODER 7 Abschnitte, und der Rang sortiert `messestand-rueckwand` nach oben,
-- mit dem passenden Abschnitt unter den ersten dreien. Unsinn („Zebrastreifen
-- Quantenphysik") findet auch als ODER nichts — der Leerzustand bleibt der
-- Leerzustand.
--
-- Fehlerschlüssel: unverändert.
--
-- Test: supabase/tests/v5_kb_search_rueckfall.sql
-- =============================================================================
set search_path = public, extensions;

create or replace function kb_search(
  p_query text, p_audience text, p_language text default 'de',
  p_edition_id uuid default null, p_limit integer default 6)
returns table (article_id uuid, slug text, title text, heading text, body text,
               language text, is_overlay boolean, rank real)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_lang text; v_cfg regconfig; v_q tsquery; v_text text; v_treffer boolean;
begin
  if auth.uid() is null then raise exception 'not allowed' using errcode = '28000'; end if;
  if is_kiosk_only() then raise exception 'not allowed' using errcode = '42501'; end if;
  if not (my_kb_audiences() && array[p_audience]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_text := btrim(coalesce(p_query, ''));
  if v_text = '' then raise exception 'empty_query' using errcode = '22023'; end if;

  v_lang := case when p_language in ('de', 'en') then p_language else 'de' end;
  v_cfg := kb_ts_config(v_lang);
  v_q := websearch_to_tsquery(v_cfg, v_text);
  if v_q is null or v_q::text = '' then raise exception 'empty_query' using errcode = '22023'; end if;

  -- Findet die genaue Frage nichts, zählt jedes Wort für sich. Die Prüfung
  -- läuft über dieselben Sichtbarkeitsregeln wie die Abfrage darunter — sonst
  -- würde ein Abschnitt, den diese Person gar nicht lesen darf, den Rückfall
  -- verhindern.
  select exists (
    select 1 from kb_chunk c join kb_article a on a.id = c.article_id
     where a.status = 'published' and a.audience && array[p_audience]
       and (a.valid_until is null or a.valid_until > now())
       and (a.edition_id is null or a.edition_id = p_edition_id)
       and c.ts @@ v_q)
    into v_treffer;
  if not v_treffer then
    v_q := replace(v_q::text, '&', '|')::tsquery;
  end if;

  return query
    select c.article_id, a.slug, a.title, c.heading, c.body, c.language,
           a.edition_id is not null, ts_rank_cd(c.ts, v_q)
      from kb_chunk c
      join kb_article a on a.id = c.article_id
     where a.status = 'published'
       and a.audience && array[p_audience]
       and (a.valid_until is null or a.valid_until > now())
       and (a.edition_id is null or a.edition_id = p_edition_id)
       and c.ts @@ v_q
     order by (a.language = v_lang) desc, a.edition_id nulls last, ts_rank_cd(c.ts, v_q) desc
     limit greatest(1, least(coalesce(p_limit, 6), 12));
end $$;

select harden_definer_functions();
