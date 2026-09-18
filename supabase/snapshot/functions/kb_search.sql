create or replace function kb_search(p_query text, p_audience text, p_language text DEFAULT 'de'::text, p_edition_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 6)
 RETURNS TABLE(article_id uuid, slug text, title text, heading text, body text, language text, is_overlay boolean, rank real)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
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
