create or replace function hubspot_deals_ingested(p_deal_ids text[])
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null and not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return coalesce((select array_agg(pd.hubspot_deal_id) from partner_deal pd where pd.hubspot_deal_id = any(p_deal_ids)), '{}'::text[]);
end $$;
