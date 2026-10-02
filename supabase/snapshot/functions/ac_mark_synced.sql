create or replace function ac_mark_synced(p_person_id uuid, p_contact_id text, p_topics text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_contact_id, '')), '') is null then raise exception 'fields_required' using errcode = '22023'; end if;
  insert into ac_contact (person_id, ac_contact_id, topics, synced_at)
  values (p_person_id, btrim(p_contact_id), coalesce((select array_agg(distinct t order by t) from unnest(p_topics) t), '{}'), now())
  on conflict (person_id) do update set ac_contact_id = excluded.ac_contact_id, topics = excluded.topics, synced_at = now();
end $$;
