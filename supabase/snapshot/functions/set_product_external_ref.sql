create or replace function set_product_external_ref(p_sku text, p_system text, p_external_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_system not in ('hubspot', 'sevdesk') then
    raise exception 'invalid_system' using errcode = '22023', detail = coalesce(p_system, 'null');
  end if;
  if not exists (select 1 from product where sku = p_sku) then
    raise exception 'unknown_sku' using errcode = 'P0002', detail = coalesce(p_sku, 'null');
  end if;

  insert into external_ref (system, object_type, object_key, external_id)
  values (p_system, 'product', p_sku, p_external_id)
  on conflict (system, object_type, object_key) where object_key is not null
  do update set external_id = excluded.external_id, updated_at = now();
end $$;
