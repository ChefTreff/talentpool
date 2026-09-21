create or replace function set_booth_service_check(p_org_edition_id uuid, p_product_sku text, p_checked boolean, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_production_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from org_product op
                  where op.org_edition_id = p_org_edition_id and op.product_sku = p_product_sku) then
    raise exception 'booth_item_not_found' using errcode = 'P0002';
  end if;
  if p_checked then
    insert into booth_service_check (org_edition_id, product_sku, checked_by, note)
    values (p_org_edition_id, p_product_sku, current_person_id(), nullif(btrim(p_note), ''))
    on conflict (org_edition_id, product_sku)
      do update set checked_by = excluded.checked_by, checked_at = now(), note = excluded.note;
  else
    delete from booth_service_check
     where org_edition_id = p_org_edition_id and product_sku = p_product_sku;
  end if;
  perform log_audit('booth.service_checked', 'org_edition', p_org_edition_id::text, null,
                    jsonb_build_object('sku', p_product_sku, 'checked', p_checked));
end $$;
