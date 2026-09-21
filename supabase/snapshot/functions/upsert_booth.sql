create or replace function upsert_booth(p_org_id uuid, p_data jsonb, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition; v_id uuid;
begin
  if not (is_partner_team() or is_production_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;

  -- Welcher Stand gehoert dieser Teilnahme? Seit 0124 sagt das die Zuordnung und
  -- nicht mehr eine Spalte am Stand. Die Zuordnung fuer alle Tage gewinnt vor
  -- einer einzelnen Tageszuordnung — wer hier pflegt, meint den Hauptstand.
  select b.id into v_id
    from booth_assignment ba join booth b on b.id = ba.booth_id
   where ba.org_edition_id = v_oe.id
   order by ba.event_day_id nulls first, b.created_at
   limit 1;

  if v_id is null then
    insert into booth (booth_number, booth_type, segment, length_m, width_m, backdrop_w_mm, backdrop_h_mm, notes)
    values (p_data->>'booth_number', p_data->>'booth_type', p_data->>'segment', (p_data->>'length_m')::numeric, (p_data->>'width_m')::numeric,
            (p_data->>'backdrop_w_mm')::integer, (p_data->>'backdrop_h_mm')::integer, p_data->>'notes')
    returning id into v_id;
    -- Ohne Tag heisst: beide Tage. Wer den Stand teilt, traegt danach die
    -- Tageszuordnungen ueber `set_booth_assignment` nach.
    insert into booth_assignment (booth_id, org_edition_id, event_day_id) values (v_id, v_oe.id, null);
  else
    update booth set
      booth_number  = case when p_data ? 'booth_number' then p_data->>'booth_number' else booth_number end,
      booth_type    = case when p_data ? 'booth_type' then p_data->>'booth_type' else booth_type end,
      segment       = case when p_data ? 'segment' then p_data->>'segment' else segment end,
      length_m      = case when p_data ? 'length_m' then (p_data->>'length_m')::numeric else length_m end,
      width_m       = case when p_data ? 'width_m' then (p_data->>'width_m')::numeric else width_m end,
      backdrop_w_mm = case when p_data ? 'backdrop_w_mm' then (p_data->>'backdrop_w_mm')::integer else backdrop_w_mm end,
      backdrop_h_mm = case when p_data ? 'backdrop_h_mm' then (p_data->>'backdrop_h_mm')::integer else backdrop_h_mm end,
      notes         = case when p_data ? 'notes' then p_data->>'notes' else notes end,
      updated_at    = now()
     where id = v_id;
  end if;

  perform log_audit('partner.booth', 'organization', p_org_id::text, null, p_data);
  return v_id;
end $$;
