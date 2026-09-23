create or replace function speaker_tasks_admin(p_edition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_speaker_team(p_edition_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', st.id, 'edition_id', st.edition_id, 'key', st.key,
             'label_de', st.label_de, 'label_en', st.label_en,
             'description_de', st.description_de, 'description_en', st.description_en,
             'deadline_key', st.deadline_key, 'sort_order', st.sort_order,
             'is_active', st.is_active,
             'tick_count', (select count(*) from speaker_task_tick tk where tk.task_id = st.id))
           order by st.sort_order, st.key)
      from speaker_task st
     where st.edition_id = p_edition_id), '[]'::jsonb);
end $$;
