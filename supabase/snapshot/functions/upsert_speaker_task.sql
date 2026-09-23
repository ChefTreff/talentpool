create or replace function upsert_speaker_task(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid; v_ed uuid := (p_data->>'edition_id')::uuid; v_key text := btrim(coalesce(p_data->>'key', ''));
begin
  if not is_speaker_team(v_ed) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_key = '' then raise exception 'task_key_required' using errcode = '22023'; end if;
  if btrim(coalesce(p_data->>'label_de', '')) = '' or btrim(coalesce(p_data->>'label_en', '')) = '' then
    raise exception 'task_label_required' using errcode = '22023';
  end if;

  insert into speaker_task (edition_id, key, label_de, label_en, description_de, description_en,
                            deadline_key, sort_order, is_active)
  values (v_ed, v_key, p_data->>'label_de', p_data->>'label_en',
          nullif(btrim(coalesce(p_data->>'description_de', '')), ''),
          nullif(btrim(coalesce(p_data->>'description_en', '')), ''),
          nullif(btrim(coalesce(p_data->>'deadline_key', '')), ''),
          coalesce(nullif(p_data->>'sort_order', '')::integer, 0),
          coalesce((p_data->>'is_active')::boolean, true))
  on conflict (edition_id, key) do update set
    label_de = excluded.label_de, label_en = excluded.label_en,
    description_de = excluded.description_de, description_en = excluded.description_en,
    deadline_key = excluded.deadline_key, sort_order = excluded.sort_order,
    is_active = excluded.is_active, updated_at = now()
  returning id into v_id;

  perform log_audit('speaker_task.upsert', 'speaker_task', v_id::text, null, p_data);
  return v_id;
end $$;
