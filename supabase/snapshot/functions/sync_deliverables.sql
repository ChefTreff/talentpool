create or replace function sync_deliverables(p_org_edition_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition; r deliverable_template; v_n integer := 0;
begin
  select * into v_oe from org_edition where id = p_org_edition_id;
  if not found then return 0; end if;
  for r in select t.* from deliverable_template t where t.active and template_applies(t, v_oe.id) loop
    insert into deliverable (org_edition_id, template_id, key, product_sku, due_at)
    values (v_oe.id, r.id, r.key, r.product_sku, deliverable_due(r, v_oe))
    on conflict (org_edition_id, template_id) do update
      set due_at = coalesce(deliverable.due_at, excluded.due_at),
          status = case when deliverable.status = 'not_required' then 'open' else deliverable.status end;
    v_n := v_n + 1;
  end loop;
  update deliverable d set status = 'not_required'
   where d.org_edition_id = v_oe.id and d.status in ('open', 'overdue')
     and not exists (select 1 from deliverable_template t where t.id = d.template_id and t.active and template_applies(t, v_oe.id));
  return v_n;
end $$;
