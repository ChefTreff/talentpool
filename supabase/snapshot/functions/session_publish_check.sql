create or replace function session_publish_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $$
begin
  new.title_de       := nullif(btrim(new.title_de), '');
  new.title_en       := nullif(btrim(new.title_en), '');
  new.description_de := nullif(btrim(new.description_de), '');
  new.description_en := nullif(btrim(new.description_en), '');
  if new.publish_status = 'published' then
    if new.slot_id is null then
      raise exception 'publish requires a slot (stage/room)' using errcode = '23514';
    end if;
    if new.title_de is null or new.title_en is null then
      raise exception 'publish requires title_de and title_en' using errcode = '23514';
    end if;
    if coalesce(new.description_de, new.description_en) is null then
      raise exception 'publish requires a description' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
