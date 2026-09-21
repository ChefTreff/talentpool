create or replace function kb_articles(p_audience text, p_language text DEFAULT 'de'::text, p_edition_id uuid DEFAULT NULL::uuid, p_role text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, slug text, title text, body_md text, phase text, roles text[], language text, edition_id uuid, updated_at timestamp with time zone, is_overlay boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
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
