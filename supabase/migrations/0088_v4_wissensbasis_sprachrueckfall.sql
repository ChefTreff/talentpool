-- 0088 · Welle 4 · Wissensbasis: Rückfall auf die andere Sprache
--
-- Befund aus dem Walkthrough am 14.09.2026: `/speaker/wiki` war leer, obwohl
-- Artikel für die Zielgruppe da waren — sie lagen auf Englisch, die Seite
-- fragte `p_language = 'de'`, und `and a.language = p_language` in 0083 warf
-- sie weg. Für den Leser ist das der schlechteste von drei Ausgängen: nicht
-- „Artikel auf Englisch", sondern „keine Artikel".
--
-- Die Redaktion pflegt DE und EN nicht im Gleichschritt. Ein Artikel, den es
-- nur in einer Sprache gibt, ist trotzdem die Information, die jemand sucht.
-- Deshalb filtert die Funktion nicht mehr nach Sprache, sondern **sortiert**:
-- `distinct on (slug)` nimmt je Slug
--
--   1. die Überlagerung der laufenden Edition vor dem evergreen,
--   2. darin die gefragte Sprache vor der anderen.
--
-- Die Reihenfolge ist Absicht. Eine Überlagerung existiert, weil der evergreen
-- für diese Edition überholt ist; eine überholte Auskunft in der Wunschsprache
-- ist schlechter als eine richtige in der anderen. Die Spalte `language` sagt
-- dem Aufrufer, was er bekommen hat — die Oberfläche kann es kennzeichnen.
--
-- Was gleich bleibt: Rechteprüfung (28000 ohne Login, 42501 für fremde
-- Zielgruppen), Overlay-Logik, Signatur, Rückgabespalten. Test unten.

create or replace function kb_articles(
  p_audience text,
  p_language text default 'de',
  p_edition_id uuid default null,
  p_role text default null)
returns table(id uuid, slug text, title text, body_md text, phase text, roles text[],
              language text, edition_id uuid, updated_at timestamptz, is_overlay boolean)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_allowed text[]; v_lang text;
begin
  if auth.uid() is null then raise exception 'not allowed' using errcode = '28000'; end if;
  v_allowed := my_kb_audiences();
  if not (v_allowed && array[p_audience]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- Unbekannte Sprache ist kein Fehler, sondern Deutsch: der Aufrufer ist der
  -- Locale-String des Browsers, und eine Ausnahme hülfe dem Leser nicht.
  v_lang := case when p_language in ('de', 'en') then p_language else 'de' end;
  return query
    select distinct on (a.slug)
           a.id, a.slug, a.title, a.body_md, a.phase, a.roles, a.language, a.edition_id,
           a.updated_at, a.edition_id is not null
      from kb_article a
     where a.status = 'published'
       and a.audience && array[p_audience]
       and (a.valid_until is null or a.valid_until > now())
       -- `a.edition_id = p_edition_id` ist NULL, wenn keine Edition gefragt ist —
       -- dann bleibt nur der evergreen übrig. Mit `p_edition_id is null` als
       -- drittem Oder-Zweig hätte die Überlagerung einer **alten** Edition
       -- gewonnen, sobald niemand eine Edition mitgibt.
       and (a.edition_id is null or a.edition_id = p_edition_id)
       and (p_role is null or cardinality(a.roles) = 0 or a.roles && array[p_role])
     -- Edition vor evergreen, dann Wunschsprache vor der anderen.
     order by a.slug, a.edition_id nulls last, (a.language = v_lang) desc, a.sort_order;
end $$;

select harden_definer_functions();
