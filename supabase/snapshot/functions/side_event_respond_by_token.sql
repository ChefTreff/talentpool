create or replace function side_event_respond_by_token(p_token text, p_status text DEFAULT NULL::text, p_ip_hash text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_ed uuid; v_quelle text; v_hash text; v_e side_event%rowtype; v_i side_event_invite%rowtype; v_eigene integer := 0; v_frei integer;
  v_event jsonb;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status is not null and p_status not in ('yes', 'no') then return jsonb_build_object('state', 'invalid'); end if;

  -- Ratenbegrenzung: höchstens 60 Anfragen je Quelle und Stunde (auch Lesen — der Link ist ein Geheimnis, kein Hobby). Ohne gültige
  -- Quelle antworten wir nicht: lieber keine Antwort als eine, die sich nicht begrenzen lässt.
  select ev.id into v_ed from event ev where ev.is_edition order by ev.start_date desc limit 1;
  if v_ed is null then return jsonb_build_object('state', 'invalid'); end if;
  v_quelle := award_hash(v_ed, p_ip_hash);
  if v_quelle is null then return jsonb_build_object('state', 'invalid'); end if;
  delete from side_event_attempt where created_at < now() - interval '1 day';
  if (select count(*) from side_event_attempt a where a.source_hash = v_quelle and a.created_at > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('state', 'rate_limited');
  end if;
  insert into side_event_attempt (source_hash) values (v_quelle);

  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return jsonb_build_object('state', 'invalid'); end if;
  v_hash := encode(digest(p_token, 'sha256'), 'hex');
  select i.* into v_i from side_event_invite i where i.token_hash = v_hash for update;
  if not found then return jsonb_build_object('state', 'invalid'); end if;
  select * into v_e from side_event where id = v_i.side_event_id;
  -- Gültig bis Eventbeginn, und nur solange das Event veröffentlicht ist.
  if not v_e.published or v_e.starts_at <= now() then return jsonb_build_object('state', 'invalid'); end if;

  v_event := jsonb_build_object('title_de', v_e.title_de, 'title_en', v_e.title_en, 'starts_at', v_e.starts_at, 'ends_at', v_e.ends_at,
                                'location', v_e.location, 'address', v_e.address);
  if p_status is null then
    return jsonb_build_object('state', case when v_e.rsvp_deadline is not null and now() > v_e.rsvp_deadline then 'closed' else 'ok' end,
                              'status', v_i.status, 'event', v_event);
  end if;
  if v_e.rsvp_deadline is not null and now() > v_e.rsvp_deadline then
    return jsonb_build_object('state', 'closed', 'status', v_i.status, 'event', v_event);
  end if;
  -- Derselbe Stand noch einmal: nichts schreiben, nichts protokollieren — ein doppelter Klick ist kein zweites Ereignis.
  if v_i.status = p_status then
    return jsonb_build_object('state', 'ok', 'status', v_i.status, 'event', v_event);
  end if;

  if p_status = 'yes' and v_e.capacity is not null then
    if v_i.status = 'yes' then v_eigene := 1 + v_i.guests; end if;
    v_frei := v_e.capacity - (side_event_taken(v_e.id) - v_eigene);
    if 1 + v_i.guests > v_frei then
      return jsonb_build_object('state', 'full', 'status', v_i.status, 'event', v_event);
    end if;
  end if;

  update side_event_invite
     set status = p_status, guests = case when p_status = 'yes' then guests else 0 end, responded_at = now(), via = 'email'
   where side_event_id = v_i.side_event_id and profile_id = v_i.profile_id;
  perform log_audit('side_event.responded', 'side_event', v_e.id::text, null,
    jsonb_build_object('person_id', (select sp.person_id from speaker_profile sp where sp.id = v_i.profile_id),
                       'status', p_status, 'via', 'email', 'responded_at', now()));
  return jsonb_build_object('state', 'ok', 'status', p_status, 'event', v_event);
end $$;
