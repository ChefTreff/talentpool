create or replace function slot_session_change_mail()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare r record;
begin
  if (new.start_at, new.end_at, new.stage_id) is not distinct from (old.start_at, old.end_at, old.stage_id) then
    return coalesce(new, old);
  end if;
  for r in select s.id, s.title_de, s.title_en from session s where s.slot_id = new.id and s.publish_status = 'published' loop
    begin
      perform session_change_notify(r.id,
        jsonb_build_object('title_de', r.title_de, 'title_en', r.title_en, 'start_at', old.start_at, 'end_at', old.end_at,
                           'stage_id', old.stage_id, 'stage_name', (select st.name from stage st where st.id = old.stage_id)),
        jsonb_build_object('title_de', r.title_de, 'title_en', r.title_en, 'start_at', new.start_at, 'end_at', new.end_at,
                           'stage_id', new.stage_id, 'stage_name', (select st.name from stage st where st.id = new.stage_id)));
    exception when others then
      -- Der Mailweg darf eine Programmänderung nie verhindern.
      raise warning 'slot_session_change_mail: % (%)', sqlerrm, sqlstate;
    end;
  end loop;
  return coalesce(new, old);
end $$;
