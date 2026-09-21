create or replace function upsert_reception(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid; v_ed uuid; v_start timestamptz; v_end timestamptz; v_cap integer;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_id := nullif(p_data->>'id', '')::uuid;

  -- Beim Ändern gilt die Edition des Datensatzes, nicht die im Aufruf: sonst
  -- liesse sich über eine fremde `edition_id` eine Reception übernehmen, für
  -- die man nicht zuständig ist (Lehre aus Review 0083).
  if v_id is not null then
    select e.edition_id into v_ed from speaker_reception e where e.id = v_id;
    if v_ed is null then raise exception 'reception_not_found' using errcode = 'P0002'; end if;
  else
    select coalesce(nullif(p_data->>'edition_id', '')::uuid,
                    (select ev.id from event ev where ev.is_edition order by ev.start_date desc limit 1))
      into v_ed;
  end if;
  if not is_speaker_team(v_ed) then raise exception 'not allowed' using errcode = '42501'; end if;

  v_start := nullif(btrim(p_data->>'starts_at'), '')::timestamptz;
  v_end   := nullif(btrim(p_data->>'ends_at'), '')::timestamptz;
  v_cap   := nullif(btrim(p_data->>'capacity'), '')::integer;
  if v_cap is not null and v_cap <= 0 then
    raise exception 'invalid_reception' using errcode = '22023', detail = 'capacity:' || v_cap::text;
  end if;
  if v_end is not null and v_start is not null and v_end < v_start then
    raise exception 'invalid_reception' using errcode = '22023', detail = 'ends_at';
  end if;

  if v_id is null then
    if nullif(btrim(p_data->>'title_de'), '') is null
       or nullif(btrim(p_data->>'title_en'), '') is null
       or nullif(btrim(p_data->>'location'), '') is null
       or v_start is null then
      raise exception 'fields_required' using errcode = '22023',
        detail = 'title_de, title_en, location, starts_at';
    end if;
    insert into speaker_reception (
      edition_id, title_de, title_en, description_de, description_en,
      location, address, starts_at, ends_at, capacity, rsvp_deadline, published, created_by)
    values (v_ed, btrim(p_data->>'title_de'), btrim(p_data->>'title_en'),
            nullif(btrim(p_data->>'description_de'), ''), nullif(btrim(p_data->>'description_en'), ''),
            btrim(p_data->>'location'), nullif(btrim(p_data->>'address'), ''),
            v_start, v_end, v_cap,
            nullif(btrim(p_data->>'rsvp_deadline'), '')::timestamptz,
            coalesce((p_data->>'published')::boolean, false), current_person_id())
    returning id into v_id;
  else
    -- Teilupdate über die mitgeschickten Schlüssel: was fehlt, bleibt stehen.
    update speaker_reception set
      title_de = coalesce(nullif(btrim(p_data->>'title_de'), ''), title_de),
      title_en = coalesce(nullif(btrim(p_data->>'title_en'), ''), title_en),
      description_de = case when p_data ? 'description_de' then nullif(btrim(p_data->>'description_de'), '') else description_de end,
      description_en = case when p_data ? 'description_en' then nullif(btrim(p_data->>'description_en'), '') else description_en end,
      location = coalesce(nullif(btrim(p_data->>'location'), ''), location),
      address = case when p_data ? 'address' then nullif(btrim(p_data->>'address'), '') else address end,
      starts_at = coalesce(v_start, starts_at),
      ends_at = case when p_data ? 'ends_at' then v_end else ends_at end,
      capacity = case when p_data ? 'capacity' then v_cap else capacity end,
      rsvp_deadline = case when p_data ? 'rsvp_deadline'
                           then nullif(btrim(p_data->>'rsvp_deadline'), '')::timestamptz
                           else rsvp_deadline end,
      published = coalesce((p_data->>'published')::boolean, published)
    where id = v_id;
  end if;

  perform log_audit('speaker.reception_saved', 'speaker_reception', v_id::text, null, p_data);
  return v_id;
end $$;
