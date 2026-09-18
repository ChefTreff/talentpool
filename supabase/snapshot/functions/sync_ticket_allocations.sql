create or replace function sync_ticket_allocations(p_org_edition_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition; r record; v_n integer := 0;
begin
  select * into v_oe from org_edition where id = p_org_edition_id;
  if not found then return 0; end if;
  for r in
    select effective_pass_type(pr.pass_type, v_oe.id) as pass_type, sum(op.qty)::integer as quantity
    from org_product op join product pr on pr.sku = op.product_sku
    where op.org_edition_id = v_oe.id and op.status = 'booked' and pr.pass_type is not null
    group by effective_pass_type(pr.pass_type, v_oe.id)
  loop
    insert into org_ticket_allocation (event_id, org_id, org_edition_id, pass_type, quantity)
    values (v_oe.edition_id, v_oe.org_id, v_oe.id, r.pass_type, r.quantity)
    on conflict (event_id, org_id, pass_type) do update set
      quantity = excluded.quantity, org_edition_id = excluded.org_edition_id,
      status = case when org_ticket_allocation.status = 'disabled' then 'pending_vivenu' else org_ticket_allocation.status end,
      synced_at = case when org_ticket_allocation.quantity <> excluded.quantity or org_ticket_allocation.status = 'disabled' then null else org_ticket_allocation.synced_at end;
    v_n := v_n + 1;
  end loop;
  -- Kontingente ohne Produkt: noch nicht in vivenu ⇒ weg; sonst deaktivieren (die Route schaltet den Coupon ab)
  delete from org_ticket_allocation a
   where a.org_id = v_oe.org_id and a.event_id = v_oe.edition_id and a.status = 'pending_vivenu'
     and not exists (select 1 from org_product op join product pr on pr.sku = op.product_sku
                     where op.org_edition_id = v_oe.id and op.status = 'booked' and pr.pass_type is not null and effective_pass_type(pr.pass_type, v_oe.id) = a.pass_type);
  update org_ticket_allocation a set status = 'disabled', quantity = 0, synced_at = null
   where a.org_id = v_oe.org_id and a.event_id = v_oe.edition_id and a.status in ('active', 'error')
     and not exists (select 1 from org_product op join product pr on pr.sku = op.product_sku
                     where op.org_edition_id = v_oe.id and op.status = 'booked' and pr.pass_type is not null and effective_pass_type(pr.pass_type, v_oe.id) = a.pass_type);
  return v_n;
end $$;
