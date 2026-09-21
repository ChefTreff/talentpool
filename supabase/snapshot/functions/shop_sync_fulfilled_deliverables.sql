create or replace function shop_sync_fulfilled_deliverables(p_org_edition_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare r record; v_order record; v_n integer := 0;
begin
  for r in
    select d.id, d.status, d.answers, t.fulfilled_by_sku
    from deliverable d join deliverable_template t on t.id = d.template_id
    where d.org_edition_id = p_org_edition_id and t.fulfilled_by_sku is not null
  loop
    select o.id, o.order_no into v_order
    from shop_order o join shop_order_line sl on sl.order_id = o.id
    where o.org_edition_id = p_org_edition_id and o.status in ('pending', 'editing', 'completed') and sl.product_sku = r.fulfilled_by_sku
    order by o.confirmed_at desc nulls last limit 1;
    if found then
      if r.status in ('open', 'overdue', 'rejected') then
        update deliverable set status = 'accepted', submitted_at = now(), submitted_by = null, reviewed_at = now(), reviewed_by = null, review_note = null,
                               answers = jsonb_build_object('auto', true, 'order_id', v_order.id, 'order_no', v_order.order_no)
         where id = r.id;
        v_n := v_n + 1;
      end if;
    elsif r.status in ('submitted', 'accepted') and coalesce((r.answers->>'auto')::boolean, false) then
      update deliverable set status = 'open', submitted_at = null, submitted_by = null, reviewed_at = null, reviewed_by = null, answers = '{}'::jsonb where id = r.id;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
