create or replace function upsert_deadline(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid;
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into deadline (edition_id, key, audience, due_at, label_de, label_en, description_de, description_en, reminder_lead_hours)
  values ((p_data->>'edition_id')::uuid, p_data->>'key', coalesce(nullif(p_data->>'audience', ''), 'all'), (p_data->>'due_at')::timestamptz,
          p_data->>'label_de', p_data->>'label_en', nullif(p_data->>'description_de', ''), nullif(p_data->>'description_en', ''),
          coalesce(nullif(p_data->>'reminder_lead_hours', '')::integer, 48))
  on conflict (edition_id, key) do update set
    audience = excluded.audience, due_at = excluded.due_at, label_de = excluded.label_de, label_en = excluded.label_en,
    description_de = excluded.description_de, description_en = excluded.description_en,
    reminder_lead_hours = case when p_data ? 'reminder_lead_hours' then excluded.reminder_lead_hours else deadline.reminder_lead_hours end
  returning id into v_id;
  perform log_audit('deadline.upsert', 'deadline', v_id::text, null, p_data);
  return v_id;
end $$;
