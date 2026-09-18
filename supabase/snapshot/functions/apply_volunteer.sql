create or replace function apply_volunteer(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
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
