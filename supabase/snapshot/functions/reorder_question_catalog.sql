create or replace function reorder_question_catalog(p_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_alle integer; v_gegeben integer;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('questionCatalog') then raise exception 'not allowed' using errcode = '42501'; end if;

  select count(*) into v_alle from question_catalog;
  select count(distinct x) into v_gegeben from unnest(coalesce(p_ids, '{}')) as x
   where x in (select q.id from question_catalog q);
  if v_gegeben <> v_alle or cardinality(coalesce(p_ids, '{}')) <> v_alle then
    raise exception 'invalid_order' using errcode = '22023',
      detail = v_gegeben::text || ' von ' || v_alle::text;
  end if;

  update question_catalog q set sort_order = t.pos
    from unnest(p_ids) with ordinality as t(id, pos)
   where q.id = t.id and q.sort_order is distinct from t.pos;

  perform log_audit('question_catalog.reordered', 'question_catalog', null, null,
                    jsonb_build_object('ids', to_jsonb(p_ids)));
end $$;
