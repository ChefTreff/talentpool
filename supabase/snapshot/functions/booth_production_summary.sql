create or replace function booth_production_summary(p_edition_id uuid)
 RETURNS TABLE(org_edition_id uuid, org_id uuid, org_name text, booth_number text, booth_length_m numeric, booth_width_m numeric, stand_sqm numeric, stand_days smallint, package_names text, reviews jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not has_admin_section('productionBooths') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    with basis as (select h.org_edition_id as oe_id, h.basis_hash as hash from booth_basis_hash(p_edition_id) h),
         staende as (
           select oe.id as oe_id, oe.org_id as o_id
             from org_edition oe
            where oe.edition_id = p_edition_id
              and (org_has_booth(oe.id) or exists (select 1 from basis b where b.oe_id = oe.id))
         )
    select s.oe_id, s.o_id, coalesce(o.communication_name, o.legal_name), bo.booth_number, bo.length_m, bo.width_m,
           fl.sqm, fl.tage, fl.namen,
           (select coalesce(jsonb_agg(jsonb_build_object(
                      'item_key', t.key, 'label_de', t.label_de, 'label_en', t.label_en,
                      'status', r.status, 'note', r.note, 'checked_at', r.checked_at,
                      'checked_by_name', nullif(btrim(coalesce(pe.first_name, '') || ' ' || coalesce(pe.last_name, '')), ''),
                      'stale', r.id is not null and r.basis_hash is distinct from coalesce(b.hash, md5(''))
                    ) order by t.sort_order, t.key), '[]'::jsonb)
              from vocab_term t
              left join booth_review r on r.org_edition_id = s.oe_id and r.item_key = t.key
              left join person pe on pe.id = r.checked_by
              left join basis b on b.oe_id = s.oe_id
             where t.vocabulary = 'booth_review_item' and t.active)
      from staende s
      join organization o on o.id = s.o_id
      left join lateral (
        select b2.booth_number, b2.length_m, b2.width_m from booth_assignment ba join booth b2 on b2.id = ba.booth_id
         where ba.org_edition_id = s.oe_id
         order by ba.event_day_id nulls first, b2.created_at limit 1) bo on true
      left join lateral (
        select sum(p.area_sqm * op.qty) as sqm, max(p.stand_days) as tage,
               string_agg(coalesce(p.name_de, p.name_en), ', ' order by p.sku) as namen
          from org_product op join product p on p.sku = op.product_sku
         where op.org_edition_id = s.oe_id and op.status <> 'cancelled'
           and p.type = 'package' and p.category = 'standflaeche') fl on true
     order by coalesce(o.communication_name, o.legal_name);
end $$;
