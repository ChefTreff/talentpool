create or replace function swap_tour_stops(p_stop_a uuid, p_stop_b uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare a company_tour_stop; b company_tour_stop;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('tourAssignment') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_stop_a = p_stop_b then raise exception 'stop_not_found' using errcode = 'P0002'; end if;
  -- Feste Reihenfolge beim Sperren, damit zwei gleichzeitige Tausche sich nicht verhaken.
  perform 1 from company_tour_stop where id in (p_stop_a, p_stop_b) order by id for update;
  select * into a from company_tour_stop where id = p_stop_a;
  select * into b from company_tour_stop where id = p_stop_b;
  if a.id is null or b.id is null then raise exception 'stop_not_found' using errcode = 'P0002'; end if;
  if (select edition_id from company_tour where id = a.tour_id) <> (select edition_id from company_tour where id = b.tour_id) then
    raise exception 'stop_not_found' using errcode = 'P0002', detail = 'edition';
  end if;
  begin
    -- Über einen freien Zwischenplatz, sonst stösst (tour_id, sort_order) an sich selbst.
    update company_tour_stop set sort_order = -1 where id = a.id;
    update company_tour_stop set tour_id = a.tour_id, sort_order = a.sort_order,
                                 arrival_at = a.arrival_at, departure_at = a.departure_at, updated_at = now()
     where id = b.id;
    update company_tour_stop set tour_id = b.tour_id, sort_order = b.sort_order,
                                 arrival_at = b.arrival_at, departure_at = b.departure_at, updated_at = now()
     where id = a.id;
  exception when unique_violation then
    raise exception 'partner_already_on_tour' using errcode = 'P0001';
  end;
  perform log_audit('tour.swap', 'company_tour_stop', a.id::text,
                    jsonb_build_object('a', jsonb_build_object('stop', a.id, 'tour', a.tour_id, 'sort', a.sort_order, 'org', a.host_org_id),
                                       'b', jsonb_build_object('stop', b.id, 'tour', b.tour_id, 'sort', b.sort_order, 'org', b.host_org_id)),
                    jsonb_build_object('a_tour', b.tour_id, 'b_tour', a.tour_id));
end $$;
