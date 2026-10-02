create or replace function tour_assignment_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('tourAssignment') then raise exception 'not allowed' using errcode = '42501'; end if;
  v_ed := coalesce(p_edition_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1));
  return jsonb_build_object(
    'edition_id', v_ed,
    'tours', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'name', t.name, 'tour_type', t.tour_type, 'starts_at', t.starts_at,
               'has_day', t.event_day_id is not null, 'lead_name', ec.display_name,
               'session_title', coalesce(se.title_de, se.title_en),
               'stops', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', s.id, 'sort_order', s.sort_order, 'arrival_at', s.arrival_at,
                          'host_org_id', s.host_org_id,
                          'host_name', coalesce(nullif(btrim(o.communication_name), ''), o.legal_name),
                          'filled', s.filled_at is not null) order by s.sort_order)
                   from company_tour_stop s left join organization o on o.id = s.host_org_id
                  where s.tour_id = t.id), '[]'::jsonb),
               'stops_total', (select count(*) from company_tour_stop s where s.tour_id = t.id),
               'stops_assigned', (select count(*) from company_tour_stop s where s.tour_id = t.id and s.host_org_id is not null),
               'stops_filled', (select count(*) from company_tour_stop s where s.tour_id = t.id and s.filled_at is not null))
             order by tv.sort_order nulls last, t.starts_at nulls last, t.name)
        from company_tour t
        left join vocab_term tv on tv.vocabulary = 'company_tour_type' and tv.key = t.tour_type
        left join edition_contact ec on ec.id = t.lead_contact_id
        left join session se on se.id = t.session_id
       where t.edition_id = v_ed), '[]'::jsonb),
    'partners', coalesce((
      select jsonb_agg(jsonb_build_object(
               'org_id', b.org_id, 'name', b.name, 'products', b.products,
               'tours', coalesce((
                 select jsonb_agg(t.name order by t.name)
                   from company_tour_stop s join company_tour t on t.id = s.tour_id
                  where s.host_org_id = b.org_id and t.edition_id = v_ed), '[]'::jsonb))
             order by b.name)
        from (select oe.org_id, coalesce(nullif(btrim(o.communication_name), ''), o.legal_name) as name,
                     jsonb_agg(distinct pr.name_de) as products
                from org_edition oe
                join organization o on o.id = oe.org_id
                join org_product op on op.org_edition_id = oe.id and op.status = 'booked'
                join product pr on pr.sku = op.product_sku and pr.format_key = 'company_tour'
               where oe.edition_id = v_ed
               group by oe.org_id, o.communication_name, o.legal_name) b), '[]'::jsonb));
end $$;
