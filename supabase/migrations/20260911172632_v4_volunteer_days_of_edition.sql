-- 0068 · Eventtage einer Edition kommen von ihren Kind-Events (Fund im Walkthrough zu PR #21).
-- `fls27` ist die Edition und hat selbst keine `event_day`-Zeilen; die Tage hängen an `summit-27` und `hackathon-27`
-- (`event.edition_id = fls27`). `volunteer_day_prefs` prüfte aber nur `event_day.event_id = <edition>` — damit wäre
-- **jeder echte Tag** als `day_not_found` abgewiesen worden, und die Bewerbung hätte nie einen Tagwunsch aufnehmen können.
-- Dieselbe Lesart wie `partner_overview` bei Sessions: die Edition selbst **oder** ein Event, das zu ihr gehört.
-- `upsert_shift` prüft `event_day_id` jetzt überhaupt erst — bisher liess sich eine Schicht an einen fremden Tag hängen.
-- Abweichungen: keine.
set search_path = public, extensions;

/** Gehört dieser Eventtag zur Edition — direkt oder über eines ihrer Events? */
create or replace function day_of_edition(p_day_id uuid, p_edition_id uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from event_day d join event e on e.id = d.event_id
     where d.id = p_day_id and (e.id = p_edition_id or e.edition_id = p_edition_id))
$$;
revoke execute on function day_of_edition(uuid, uuid) from public, anon, authenticated;

create or replace function volunteer_day_prefs(p_data jsonb, p_edition_id uuid) returns uuid[]
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_out uuid[] := '{}'; r record; v_text text;
begin
  for r in select value from jsonb_array_elements_text(coalesce(p_data->'day_prefs', '[]'::jsonb)) loop
    v_text := nullif(btrim(coalesce(r.value, '')), '');
    continue when v_text is null;
    if v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'day_not_found' using errcode = 'P0002', detail = coalesce(v_text, 'null');
    end if;
    if not day_of_edition(v_text::uuid, p_edition_id) then
      raise exception 'day_not_found' using errcode = 'P0002', detail = coalesce(v_text, 'null');
    end if;
    v_out := v_out || v_text::uuid;
  end loop;
  return v_out;
end $$;
revoke execute on function volunteer_day_prefs(jsonb, uuid) from public, anon, authenticated;

/** Wie 0065, zusätzlich mit Prüfung des Eventtags gegen die Edition. */
create or replace function upsert_shift(p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_id uuid := nullif(p_data->>'id', '')::uuid; v_ed uuid; v_area text; v_day uuid;
begin
  if not is_volunteer_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_area := nullif(btrim(coalesce(p_data->>'area', '')), '');
  if v_area is not null and not is_vocab_key('volunteer_area', v_area) then
    raise exception 'invalid_area' using errcode = '22023', detail = v_area;
  end if;
  v_day := nullif(p_data->>'event_day_id', '')::uuid;
  if v_id is null then
    v_ed := volunteer_edition(nullif(p_data->>'edition_id', '')::uuid);
    if v_ed is null then raise exception 'edition_required' using errcode = '22023'; end if;
    if v_area is null or nullif(btrim(coalesce(p_data->>'position', '')), '') is null
       or nullif(p_data->>'start_at', '') is null or nullif(p_data->>'end_at', '') is null then
      raise exception 'fields_required' using errcode = '22023';
    end if;
    if v_day is not null and not day_of_edition(v_day, v_ed) then
      raise exception 'day_not_found' using errcode = 'P0002', detail = v_day::text;
    end if;
    insert into shift (edition_id, event_day_id, area, position, start_at, end_at, capacity, overbook, location, lead_person_id, briefing_md, active)
    values (v_ed, v_day, v_area, btrim(p_data->>'position'),
            (p_data->>'start_at')::timestamptz, (p_data->>'end_at')::timestamptz,
            coalesce((p_data->>'capacity')::integer, 1), coalesce((p_data->>'overbook')::integer, 0),
            nullif(btrim(coalesce(p_data->>'location', '')), ''), nullif(p_data->>'lead_person_id', '')::uuid,
            nullif(btrim(coalesce(p_data->>'briefing_md', '')), ''), coalesce((p_data->>'active')::boolean, true))
    returning id into v_id;
  else
    select s.edition_id into v_ed from shift s where s.id = v_id;
    if v_ed is null then raise exception 'shift_not_found' using errcode = 'P0002'; end if;
    if p_data ? 'event_day_id' and v_day is not null and not day_of_edition(v_day, v_ed) then
      raise exception 'day_not_found' using errcode = 'P0002', detail = v_day::text;
    end if;
    update shift set
      event_day_id   = case when p_data ? 'event_day_id' then v_day else event_day_id end,
      area           = coalesce(v_area, area),
      position       = coalesce(nullif(btrim(coalesce(p_data->>'position', '')), ''), position),
      start_at       = coalesce(nullif(p_data->>'start_at', '')::timestamptz, start_at),
      end_at         = coalesce(nullif(p_data->>'end_at', '')::timestamptz, end_at),
      capacity       = case when p_data ? 'capacity' then (p_data->>'capacity')::integer else capacity end,
      overbook       = case when p_data ? 'overbook' then (p_data->>'overbook')::integer else overbook end,
      location       = case when p_data ? 'location' then nullif(btrim(coalesce(p_data->>'location', '')), '') else location end,
      lead_person_id = case when p_data ? 'lead_person_id' then nullif(p_data->>'lead_person_id', '')::uuid else lead_person_id end,
      briefing_md    = case when p_data ? 'briefing_md' then nullif(btrim(coalesce(p_data->>'briefing_md', '')), '') else briefing_md end,
      active         = case when p_data ? 'active' then (p_data->>'active')::boolean else active end
    where id = v_id;
  end if;
  perform log_audit('volunteer.upsert_shift', 'shift', v_id::text, null, p_data);
  return v_id;
end $$;

select harden_definer_functions();
