create or replace function session_change_mail()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if old.publish_status is distinct from 'published' or new.publish_status is distinct from 'published' then
    return coalesce(new, old);
  end if;
  if (new.title_de, new.title_en, new.slot_id) is not distinct from (old.title_de, old.title_en, old.slot_id) then
    return coalesce(new, old);
  end if;
  begin
    perform session_change_notify(new.id,
      session_change_state(old.title_de, old.title_en, old.slot_id),
      session_change_state(new.title_de, new.title_en, new.slot_id));
  exception when others then
    raise warning 'session_change_mail: % (%)', sqlerrm, sqlstate;
  end;
  return coalesce(new, old);
end $$;
