create or replace function upsert_company_tour(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid := nullif(p_data->>'id', '')::uuid; v_ed uuid := nullif(p_data->>'edition_id', '')::uuid;
begin
  if not (is_partner_team() or is_programme_editor(null)) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_id is null then
    if v_ed is null or nullif(btrim(coalesce(p_data->>'name', '')), '') is null then
      raise exception 'fields_required' using errcode = '22023', detail = 'edition_id,name';
    end if;
    insert into company_tour (edition_id, name, track, event_day_id, meeting_point, starts_at, ends_at, lead_contact_id, capacity, notes)
    values (v_ed, btrim(p_data->>'name'), nullif(p_data->>'track', ''), nullif(p_data->>'event_day_id','')::uuid,
            coalesce(nullif(btrim(coalesce(p_data->>'meeting_point','')), ''), 'CCH, Congressplatz 1, 20355 Hamburg'),
            nullif(p_data->>'starts_at','')::timestamptz, nullif(p_data->>'ends_at','')::timestamptz,
            nullif(p_data->>'lead_contact_id','')::uuid, nullif(p_data->>'capacity','')::integer,
            nullif(btrim(coalesce(p_data->>'notes','')), ''))
    returning id into v_id;
  else
    update company_tour set
      name = case when p_data ? 'name' then btrim(p_data->>'name') else name end,
      track = case when p_data ? 'track' then nullif(p_data->>'track','') else track end,
      event_day_id = case when p_data ? 'event_day_id' then nullif(p_data->>'event_day_id','')::uuid else event_day_id end,
      meeting_point = case when p_data ? 'meeting_point' then coalesce(nullif(btrim(p_data->>'meeting_point'),''), meeting_point) else meeting_point end,
      starts_at = case when p_data ? 'starts_at' then nullif(p_data->>'starts_at','')::timestamptz else starts_at end,
      ends_at = case when p_data ? 'ends_at' then nullif(p_data->>'ends_at','')::timestamptz else ends_at end,
      lead_contact_id = case when p_data ? 'lead_contact_id' then nullif(p_data->>'lead_contact_id','')::uuid else lead_contact_id end,
      capacity = case when p_data ? 'capacity' then nullif(p_data->>'capacity','')::integer else capacity end,
      notes = case when p_data ? 'notes' then nullif(btrim(p_data->>'notes'),'') else notes end
    where id = v_id;
    if not found then raise exception 'tour_not_found' using errcode = 'P0002'; end if;
  end if;
  -- Die Begleitperson muss vom richtigen Typ und aus derselben Edition sein.
  if (select lead_contact_id from company_tour where id = v_id) is not null then
    perform check_edition_contact((select lead_contact_id from company_tour where id = v_id),
                                  (select edition_id from company_tour where id = v_id), 'tour_lead');
  end if;
  perform log_audit('tour.upsert', 'company_tour', v_id::text, null, p_data);
  return v_id;
end $$;
