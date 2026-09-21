create or replace function exhibitor_list(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(org_id uuid, name text, booth_number text, booth_type text, segment text, package_name_de text, package_name_en text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not (my_kb_audiences() && array['partner', 'speaker']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by (current_date between e.start_date and e.end_date) desc,
                                           e.start_date desc limit 1))
    into v_ed;
  return query
    select o.id, coalesce(o.communication_name, o.legal_name), b.booth_number, b.booth_type, b.segment,
           pk.name_de, pk.name_en
      from org_edition oe
      join organization o on o.id = oe.org_id and o.active
      join lateral (
        select b2.* from booth_assignment ba join booth b2 on b2.id = ba.booth_id
         where ba.org_edition_id = oe.id
         order by ba.event_day_id nulls first, b2.created_at limit 1) b on true
      left join lateral (
        select p.name_de, p.name_en
          from org_product op join product p on p.sku = op.product_sku
         where op.org_edition_id = oe.id and op.status = 'booked'
           and p.type = 'package' and p.category = 'standflaeche'
         order by p.area_sqm desc nulls last
         limit 1) pk on true
     where oe.edition_id = v_ed
       -- Ohne Standnummer ist die Zeile für die Liste wertlos und verrät nur,
       -- wer gebucht hat. Sie kommt rein, sobald die Produktion zugeordnet hat.
       and nullif(btrim(coalesce(b.booth_number, '')), '') is not null
     order by b.booth_number;
end $$;
