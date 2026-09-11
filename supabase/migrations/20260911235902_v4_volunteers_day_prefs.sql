-- 0066 · Tageswünsche robust einlesen (Fund der Architektur-Session beim Lauf von v4_volunteers.sql gegen Frankfurt, PR #21).
-- FLS27 hat noch keine `event_day`-Zeilen. Ein leerer oder fehlender Eintrag in `day_prefs` lief deshalb als NULL in die Prüfung,
-- und `raise … detail = d::text` mit NULL bricht mit 22004 „RAISE statement option cannot be null“ ab — statt mit P0002 `day_not_found`.
-- Beide Funktionen überspringen leere Einträge jetzt, prüfen die Form der Id (sonst käme ein roher 22P02 statt eines Schlüssels)
-- und melden im Zweifel `coalesce(…, 'null')`. `update_my_volunteer_profile` las die Tage bisher ganz ohne Prüfung — jetzt gleich.
-- Abweichungen: keine. Verhalten bei gültigen Angaben unverändert.
set search_path = public, extensions;

/** Tageswünsche aus `p_data->'day_prefs'`: leere Einträge fallen weg, jede Id muss es in dieser Edition geben. */
create or replace function volunteer_day_prefs(p_data jsonb, p_edition_id uuid) returns uuid[]
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_out uuid[] := '{}'; r record; v_text text;
begin
  for r in select value from jsonb_array_elements_text(coalesce(p_data->'day_prefs', '[]'::jsonb)) loop
    v_text := nullif(btrim(coalesce(r.value, '')), '');
    continue when v_text is null;
    -- Form zuerst: ohne diese Prüfung bräche der Cast mit 22P02 ab, und die
    -- Oberfläche bekäme keinen Schlüssel, den sie übersetzen kann.
    if v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'day_not_found' using errcode = 'P0002', detail = coalesce(v_text, 'null');
    end if;
    if not exists (select 1 from event_day ed where ed.id = v_text::uuid and ed.event_id = p_edition_id) then
      raise exception 'day_not_found' using errcode = 'P0002', detail = coalesce(v_text, 'null');
    end if;
    v_out := v_out || v_text::uuid;
  end loop;
  return v_out;
end $$;
revoke execute on function volunteer_day_prefs(jsonb, uuid) from public, anon, authenticated;

create or replace function apply_volunteer(p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_pid uuid := current_person_id(); v_ed uuid; v_start date; v_bd date; v_id uuid; v_shirt text; v_areas text[]; v_days uuid[]; a text;
begin
  if v_pid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := volunteer_edition(nullif(p_data->>'edition_id', '')::uuid);
  if v_ed is null then raise exception 'edition_required' using errcode = '22023'; end if;

  if not exists (select 1 from consent_current c where c.person_id = v_pid and c.consent_type = 'terms' and c.granted)
     or not exists (select 1 from consent_current c where c.person_id = v_pid and c.consent_type = 'privacy' and c.granted) then
    raise exception 'consent_required' using errcode = 'P0001';
  end if;

  v_bd := coalesce(nullif(p_data->>'birthdate', '')::date, (select p.birthdate from person p where p.id = v_pid));
  if v_bd is null then raise exception 'birthdate_required' using errcode = '22023'; end if;
  select e.start_date into v_start from event e where e.id = v_ed;
  if v_bd > coalesce(v_start, current_date) - interval '18 years' then
    raise exception 'too_young' using errcode = 'P0001', detail = to_char(coalesce(v_start, current_date), 'YYYY-MM-DD');
  end if;
  update person set birthdate = v_bd where id = v_pid and birthdate is distinct from v_bd;

  v_shirt := nullif(btrim(coalesce(p_data->>'shirt_size', '')), '');
  if v_shirt is not null and not is_vocab_key('shirt_size', v_shirt) then
    raise exception 'invalid_shirt_size' using errcode = '22023', detail = v_shirt;
  end if;

  v_areas := coalesce((select array_agg(x) from jsonb_array_elements_text(p_data->'areas') x
                        where nullif(btrim(x), '') is not null), '{}');
  foreach a in array v_areas loop
    if not is_vocab_key('volunteer_area', a) then raise exception 'invalid_area' using errcode = '22023', detail = a; end if;
  end loop;
  v_days := volunteer_day_prefs(p_data, v_ed);

  insert into volunteer_profile (person_id, edition_id, shirt_size, areas, day_prefs, availability, buddy_person_id, buddy_note)
  values (v_pid, v_ed, v_shirt, v_areas, v_days, p_data->'availability',
          nullif(p_data->>'buddy_person_id', '')::uuid, nullif(btrim(coalesce(p_data->>'buddy_note', '')), ''))
  on conflict (person_id, edition_id) do update
    set status = 'applied', applied_at = now(), shirt_size = excluded.shirt_size, areas = excluded.areas,
        day_prefs = excluded.day_prefs, availability = excluded.availability,
        buddy_person_id = excluded.buddy_person_id, buddy_note = excluded.buddy_note,
        decided_at = null, decided_by = null, decision_note = null
    where volunteer_profile.status = 'withdrawn'
  returning id into v_id;
  if v_id is null then raise exception 'already_applied' using errcode = '23505'; end if;

  perform queue_mail('volunteer_applied', v_pid, jsonb_build_object('edition', (select e.name from event e where e.id = v_ed)), 'volunteer_profile', v_id);
  perform log_audit('volunteer.apply', 'volunteer_profile', v_id::text, null, jsonb_build_object('edition_id', v_ed));
  return v_id;
end $$;

create or replace function update_my_volunteer_profile(p_data jsonb, p_edition_id uuid default null) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_pid uuid := current_person_id(); v_ed uuid; v_p volunteer_profile; v_shirt text; v_areas text[]; v_days uuid[]; a text;
begin
  if v_pid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := volunteer_edition(p_edition_id);
  select * into v_p from volunteer_profile where person_id = v_pid and edition_id = v_ed for update;
  if not found then raise exception 'profile_not_found' using errcode = 'P0002'; end if;
  if v_p.status = 'declined' then raise exception 'not_editable' using errcode = 'P0001', detail = v_p.status; end if;

  if p_data ? 'shirt_size' then
    v_shirt := nullif(btrim(coalesce(p_data->>'shirt_size', '')), '');
    if v_shirt is not null and not is_vocab_key('shirt_size', v_shirt) then
      raise exception 'invalid_shirt_size' using errcode = '22023', detail = v_shirt;
    end if;
  end if;
  if p_data ? 'areas' then
    v_areas := coalesce((select array_agg(x) from jsonb_array_elements_text(p_data->'areas') x
                          where nullif(btrim(x), '') is not null), '{}');
    foreach a in array v_areas loop
      if not is_vocab_key('volunteer_area', a) then raise exception 'invalid_area' using errcode = '22023', detail = a; end if;
    end loop;
  end if;
  -- Tage werden jetzt geprüft wie bei der Bewerbung; bisher liefen sie ungeprüft durch.
  if p_data ? 'day_prefs' then v_days := volunteer_day_prefs(p_data, v_ed); end if;

  update volunteer_profile set
    shirt_size   = case when p_data ? 'shirt_size' then v_shirt else shirt_size end,
    areas        = case when p_data ? 'areas' then v_areas else areas end,
    day_prefs    = case when p_data ? 'day_prefs' then v_days else day_prefs end,
    availability = case when p_data ? 'availability' then p_data->'availability' else availability end,
    buddy_note   = case when p_data ? 'buddy_note' then nullif(btrim(coalesce(p_data->>'buddy_note', '')), '') else buddy_note end,
    status       = case when coalesce(p_data->>'status', '') = 'withdrawn' then 'withdrawn' else status end
  where id = v_p.id;
  perform log_audit('volunteer.update_profile', 'volunteer_profile', v_p.id::text, null, p_data - 'availability');
end $$;

select harden_definer_functions();
