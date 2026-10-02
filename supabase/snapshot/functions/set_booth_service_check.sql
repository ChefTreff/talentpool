create or replace function set_booth_service_check(p_org_edition_id uuid, p_product_sku text, p_checked boolean, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_edition uuid; v_org uuid;
begin
  if not has_admin_section('productionBooths') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_checked then
    -- Abhaken lässt sich, was in der Produktionsliste steht: Paketausstattung, Angebot oder Shop.
    select oe.edition_id, oe.org_id into v_edition, v_org from org_edition oe where oe.id = p_org_edition_id;
    if not exists (select 1 from booth_production_lines(v_edition, v_org) l
                    where l.org_edition_id = p_org_edition_id and l.product_sku = p_product_sku) then
      raise exception 'booth_item_not_found' using errcode = 'P0002';
    end if;
    insert into booth_service_check (org_edition_id, product_sku, checked_by, note)
    values (p_org_edition_id, p_product_sku, current_person_id(), nullif(btrim(p_note), ''))
    on conflict (org_edition_id, product_sku)
      do update set checked_by = excluded.checked_by, checked_at = now(), note = excluded.note;
  else
    -- Den Haken nehmen geht immer — auch wenn die Position inzwischen storniert ist.
    delete from booth_service_check
     where org_edition_id = p_org_edition_id and product_sku = p_product_sku;
  end if;
  perform log_audit('booth.service_checked', 'org_edition', p_org_edition_id::text, null,
                    jsonb_build_object('sku', p_product_sku, 'checked', p_checked));
end $$;
