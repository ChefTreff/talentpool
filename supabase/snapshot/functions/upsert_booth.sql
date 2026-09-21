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
  insert into booth (org_edition_id, booth_number, booth_type, segment, length_m, width_m, backdrop_w_mm, backdrop_h_mm, notes)
  values (v_oe.id, p_data->>'booth_number', p_data->>'booth_type', p_data->>'segment', (p_data->>'length_m')::numeric, (p_data->>'width_m')::numeric,
          (p_data->>'backdrop_w_mm')::integer, (p_data->>'backdrop_h_mm')::integer, p_data->>'notes')
  on conflict (org_edition_id) do update set
    booth_number  = case when p_data ? 'booth_number' then excluded.booth_number else booth.booth_number end,
    booth_type    = case when p_data ? 'booth_type' then excluded.booth_type else booth.booth_type end,
    segment       = case when p_data ? 'segment' then excluded.segment else booth.segment end,
    length_m      = case when p_data ? 'length_m' then excluded.length_m else booth.length_m end,
    width_m       = case when p_data ? 'width_m' then excluded.width_m else booth.width_m end,
    backdrop_w_mm = case when p_data ? 'backdrop_w_mm' then excluded.backdrop_w_mm else booth.backdrop_w_mm end,
    backdrop_h_mm = case when p_data ? 'backdrop_h_mm' then excluded.backdrop_h_mm else booth.backdrop_h_mm end,
    notes         = case when p_data ? 'notes' then excluded.notes else booth.notes end
  returning id into v_id;
  perform log_audit('partner.booth', 'organization', p_org_id::text, null, p_data);
  return v_id;
end $$;
