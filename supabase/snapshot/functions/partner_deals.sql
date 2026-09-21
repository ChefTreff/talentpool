create or replace function partner_deals(p_org_id uuid)
 RETURNS TABLE(hubspot_deal_id text, deal_name text, ingested_at timestamp with time zone, org_edition_id uuid, edition_id uuid, line_items jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select pd.hubspot_deal_id, pd.deal_name, pd.ingested_at, pd.org_edition_id, oe.edition_id, pd.payload->'line_items'
    from partner_deal pd join org_edition oe on oe.id = pd.org_edition_id
    where oe.org_id = p_org_id order by pd.ingested_at desc;
end $$;
