create or replace function merge_persons(p_survivor uuid, p_merged uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_res jsonb; v_log uuid; v_name text;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('duplicates') then raise exception 'not allowed' using errcode = '42501'; end if;

  v_res := person_merge_core(p_survivor, p_merged);
  if jsonb_array_length(v_res->'report'->'blocking') > 0 then
    -- Ausnahme nimmt auch die schon umgehängten Zeilen zurück.
    raise exception 'merge_conflict' using errcode = 'P0001', detail = (v_res->'report'->'blocking')::text;
  end if;

  insert into person_merge_log (surviving_person_id, merged_person_id, actor, payload)
  values (p_survivor, p_merged, auth.uid()::text, v_res)
  returning id into v_log;

  v_name := nullif(btrim(coalesce(v_res->'undo'->'merged_row'->>'first_name', '') || ' '
                         || coalesce(v_res->'undo'->'merged_row'->>'last_name', '')), '');
  perform log_audit('person.merge', 'person', p_survivor::text,
    jsonb_build_object('merged_person_id', p_merged, 'merged_name', v_name),
    jsonb_build_object('merge_log_id', v_log, 'moved', v_res->'report'->'moved',
                       'deduplicated', v_res->'report'->'deduplicated', 'filled', v_res->'report'->'filled',
                       'account_moved', v_res->'report'->'account_moved'));
  return v_log;
end $$;
