create or replace function request_photo_removal(p_photo_id uuid, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_p event_photo; v_id uuid; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_p from event_photo where id = p_photo_id and published;
  if not found or not attended_event(v_p.event_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if length(v_note) > 500 then raise exception 'too_long' using errcode = '22023', detail = '500'; end if;
  insert into event_photo_removal_request (photo_id, person_id, note)
  values (p_photo_id, current_person_id(), v_note)
  on conflict (photo_id, person_id) where status = 'open' do nothing
  returning id into v_id;
  -- Audit ohne Text der Notiz (kann Gesundheits- oder Lebensumstände enthalten).
  perform log_audit('photo.removal_requested', 'event', v_p.event_id::text, null, jsonb_build_object('photo_id', p_photo_id));
  return v_id;
end $$;
