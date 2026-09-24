create or replace function luma_sync_registration(p_luma_event_id text, p_email text, p_guest_id text, p_status text, p_registered_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_checked_in boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_event uuid; v_person uuid; v_reg uuid; v_status text;
  v_guest text := nullif(btrim(coalesce(p_guest_id, '')), '');
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  v_status := case p_status
    when 'registered' then 'confirmed'
    when 'pending' then 'applied'
    when 'waitlist' then 'waitlisted'
    when 'declined' then 'declined'
    when 'invited' then 'no_response'
  end;
  if v_status is null then raise exception 'invalid_status' using errcode = '22023', detail = coalesce(p_status, 'null'); end if;
  if coalesce(p_checked_in, false) then v_status := 'attended'; end if;

  select r.object_id into v_event from external_ref r
   where r.system = 'luma' and r.object_type = 'event' and r.external_id = btrim(coalesce(p_luma_event_id, ''));
  if v_event is null then raise exception 'event_not_found' using errcode = 'P0002', detail = coalesce(p_luma_event_id, 'null'); end if;

  select pe.person_id into v_person from person_email pe join person p on p.id = pe.person_id
   where lower(pe.email::text) = lower(btrim(coalesce(p_email, ''))) and p.deleted_at is null
   order by pe.is_primary desc limit 1;
  if v_person is null then return jsonb_build_object('matched', false); end if;

  -- Erst über die Gast-Id, dann über Person × Event (Anmeldung aus dem Portal, Id noch leer).
  if v_guest is not null then
    select g.id into v_reg from registration g where g.external_source = 'luma' and g.external_ref = v_guest;
  end if;
  if v_reg is null then
    select g.id into v_reg from registration g
     where g.person_id = v_person and g.event_id = v_event and g.source = 'luma' and g.session_id is null
     order by g.created_at limit 1;
  end if;

  if v_reg is null then
    insert into registration (person_id, event_id, status, source, external_source, external_ref, registered_at)
    values (v_person, v_event, v_status, 'luma', 'luma', v_guest, coalesce(p_registered_at, now()))
    returning id into v_reg;
  else
    update registration set
      status = v_status,
      external_source = 'luma',
      external_ref = coalesce(v_guest, external_ref),
      registered_at = coalesce(p_registered_at, registered_at)
     where id = v_reg;
  end if;
  return jsonb_build_object('matched', true, 'registration_id', v_reg, 'status', v_status);
end $$;
