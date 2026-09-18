create or replace function trg_product_supplier()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if new.supplier is not null and btrim(new.supplier) <> ''
     and not is_vocab_key('supplier', new.supplier) then
    raise exception 'supplier_unknown' using errcode = 'P0001',
      detail = format('%s steht nicht im Vokabular supplier', new.supplier);
  end if;
  if new.shop_visible and coalesce(btrim(new.supplier), '') = '' then
    raise exception 'supplier_required' using errcode = 'P0001',
      detail = 'Shop-Artikel brauchen einen Dienstleister';
  end if;
  return new;
end $$;
