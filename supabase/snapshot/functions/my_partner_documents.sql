create or replace function my_partner_documents(p_org_id uuid, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, beleg text, filename text, storage_path text, size_bytes bigint, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition;
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  return query
    select a.id,
           case
             when a.kind = 'offer' then 'angebot'
             -- Aus dem Messeshop, wenn eine Bestellung dieser Organisation auf genau diese
             -- SevDesk-Rechnung verweist (Dateiname = SevDesk-Id, 0122).
             when exists (select 1 from external_ref x join shop_order o on o.id = x.object_id
                           where x.system = 'sevdesk' and x.object_type = 'shop_order'
                             and o.org_edition_id = v_oe.id
                             and x.meta->>'invoice_id' = regexp_replace(a.filename, '\.pdf$', ''))
               then 'messeshop_rechnung'
             else 'rechnung'
           end,
           a.filename, a.storage_path, a.size_bytes, a.created_at
      from partner_asset a
     where a.org_edition_id = v_oe.id and a.kind in ('offer', 'invoice')
     order by a.created_at desc;
end $$;
