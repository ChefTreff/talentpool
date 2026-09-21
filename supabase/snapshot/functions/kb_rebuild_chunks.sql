create or replace function kb_rebuild_chunks(p_article_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_a kb_article%rowtype; v_part text; v_head text; v_body text; v_cfg regconfig;
  v_i integer := 0; v_buf text; v_para text;
begin
  delete from kb_chunk where article_id = p_article_id;
  select * into v_a from kb_article where id = p_article_id;
  if not found or v_a.status <> 'published' then return 0; end if;
  v_cfg := kb_ts_config(v_a.language);

  for v_part in
    select t from regexp_split_to_table(coalesce(v_a.body_md, ''), E'\n(?=##\\s)') t
  loop
    if btrim(coalesce(v_part, '')) = '' then continue; end if;
    if v_part ~ '^##\s' then
      v_head := btrim(regexp_replace(split_part(v_part, E'\n', 1), '^#+\s*', ''));
      v_body := btrim(substr(v_part, coalesce(nullif(strpos(v_part, E'\n'), 0), length(v_part) + 1)));
    else
      v_head := null;
      v_body := btrim(v_part);
    end if;
    if v_body = '' and v_head is null then continue; end if;

    v_buf := '';
    for v_para in select p from regexp_split_to_table(v_body, E'\n\\s*\n') p loop
      if length(v_buf) > 0 and length(v_buf) + length(v_para) > 1500 then
        v_i := v_i + 1;
        insert into kb_chunk (article_id, section_index, heading, body, language, ts)
        values (p_article_id, v_i, v_head, v_buf, v_a.language,
                to_tsvector(v_cfg, coalesce(v_a.title, '') || ' ' || coalesce(v_head, '') || ' ' || v_buf));
        v_buf := v_para;
      else
        v_buf := case when v_buf = '' then v_para else v_buf || E'\n\n' || v_para end;
      end if;
    end loop;
    if btrim(v_buf) <> '' or v_head is not null then
      v_i := v_i + 1;
      insert into kb_chunk (article_id, section_index, heading, body, language, ts)
      values (p_article_id, v_i, v_head, v_buf, v_a.language,
              to_tsvector(v_cfg, coalesce(v_a.title, '') || ' ' || coalesce(v_head, '') || ' ' || v_buf));
    end if;
  end loop;
  return v_i;
end $$;
