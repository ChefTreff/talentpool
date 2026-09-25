create or replace function upsert_company_tour_stop(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid := nullif(p_data->>'id', '')::uuid; v_tour uuid := nullif(p_data->>'tour_id', '')::uuid;
begin
  if not has_admin_section('companyTours') then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_id is null then
    if v_tour is null then raise exception 'fields_required' using errcode = '22023', detail = 'tour_id'; end if;
    insert into company_tour_stop (tour_id, sort_order, arrival_at, departure_at, host_org_id, address)
    values (v_tour, coalesce(nullif(p_data->>'sort_order','')::integer, 1),
            nullif(p_data->>'arrival_at','')::timestamptz, nullif(p_data->>'departure_at','')::timestamptz,
            nullif(p_data->>'host_org_id','')::uuid, nullif(btrim(coalesce(p_data->>'address','')), ''))
    returning id into v_id;
  else
    update company_tour_stop set
      sort_order = case when p_data ? 'sort_order' then (p_data->>'sort_order')::integer else sort_order end,
      arrival_at = case when p_data ? 'arrival_at' then nullif(p_data->>'arrival_at','')::timestamptz else arrival_at end,
      departure_at = case when p_data ? 'departure_at' then nullif(p_data->>'departure_at','')::timestamptz else departure_at end,
      host_org_id = case when p_data ? 'host_org_id' then nullif(p_data->>'host_org_id','')::uuid else host_org_id end,
      address = case when p_data ? 'address' then nullif(btrim(p_data->>'address'),'') else address end
    where id = v_id;
    if not found then raise exception 'stop_not_found' using errcode = 'P0002'; end if;
  end if;
  perform log_audit('tour.stop_upsert', 'company_tour_stop', v_id::text, null, p_data);
  return v_id;
end $$;
