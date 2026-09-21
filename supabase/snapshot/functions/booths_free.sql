create or replace function booths_free(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(booth_id uuid, booth_number text, booth_type text, segment text, belegte_tage integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not (is_partner_team() or is_production_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by e.start_date desc limit 1)) into v_ed;
  return query
    select b.id, b.booth_number, b.booth_type, b.segment,
           (select count(*)::integer from booth_assignment x
              join org_edition xoe on xoe.id = x.org_edition_id and xoe.edition_id = v_ed
             where x.booth_id = b.id)
      from booth b
     where not exists (
       select 1 from booth_assignment a
         join org_edition aoe on aoe.id = a.org_edition_id and aoe.edition_id = v_ed
        where a.booth_id = b.id and a.event_day_id is null)
     order by b.booth_number nulls last, b.created_at;
end $$;
