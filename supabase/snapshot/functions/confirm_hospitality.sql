create or replace function confirm_hospitality(p_booking_id uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_b hospitality_booking%rowtype; v_q hospitality_quota%rowtype; v_sp speaker_profile%rowtype; v_locale text;
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_b from hospitality_booking where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found' using errcode = 'P0002'; end if;
  if v_b.status = 'cancelled' then raise exception 'booking_cancelled' using errcode = 'P0001'; end if;
  select * into v_q from hospitality_quota where id = v_b.quota_id;
  select * into v_sp from speaker_profile where id = v_b.profile_id;
  update hospitality_booking set status = 'confirmed', confirmed_by = current_person_id(), confirmed_at = now(), team_note = coalesce(nullif(btrim(p_note), ''), team_note)
   where id = p_booking_id;
  update speaker_profile set hospitality_status = 'booked' where id = v_sp.id and hospitality_status in ('eligible', 'requested');
  select coalesce(case when p.preferred_language in ('de', 'en') then p.preferred_language end, 'en') into v_locale from person p where p.id = v_sp.person_id;
  perform queue_mail('hospitality_confirmed', v_sp.person_id,
    jsonb_build_object(
      'kind', v_q.kind,
      'quota_label', case when v_locale = 'de' then v_q.label_de else v_q.label_en end,
      'location', coalesce(v_q.location, ''),
      'window', coalesce(mail_fmt_ts(v_q.window_from, 'Europe/Berlin', v_locale), '') || case when v_q.window_to is not null then ' – ' || mail_fmt_ts(v_q.window_to, 'Europe/Berlin', v_locale) else '' end,
      'guests', v_b.guests,
      'details', (select string_agg(key || ': ' || value, ', ') from jsonb_each_text(v_b.details)),
      'team_note', coalesce(p_note, '')),
    'hospitality_booking', v_b.id);
  perform log_audit('hospitality.confirm', 'hospitality_booking', p_booking_id::text, jsonb_build_object('status', v_b.status), jsonb_build_object('status', 'confirmed', 'note', p_note));
end $$;
