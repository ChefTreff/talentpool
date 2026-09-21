create or replace function run_shop_finalization()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare r record; v_completed integer := 0; v_cancelled integer := 0; v_primary uuid; m record; v_locale text; v_org_name text; v_lines_de text; v_lines_en text; v_tot record;
begin
  for r in
    select o.*, oe.org_id, oe.edition_id
    from shop_order o join org_edition oe on oe.id = o.org_edition_id
    where o.status in ('draft', 'pending', 'editing')
      and exists (select 1 from deadline d
                   where d.edition_id = oe.edition_id
                     and d.key = shop_phase_deadline_key(o.phase)
                     and d.due_at < now())
    order by o.created_at
  loop
    if r.status = 'draft' or not exists (select 1 from shop_order_line where order_id = r.id) then
      perform shop_reconcile_ledger(r.id, true);
      update shop_order set status = 'cancelled', cancelled_at = now() where id = r.id;
      v_cancelled := v_cancelled + 1;
      continue;
    end if;
    begin
      perform shop_reconcile_ledger(r.id, false);
    exception when others then
      insert into audit_log (action, object_type, object_id, after) values ('shop.finalize_stock_conflict', 'shop_order', r.id::text, jsonb_build_object('error', sqlerrm));
    end;
    update shop_order set status = 'completed', completed_at = now() where id = r.id;
    v_completed := v_completed + 1;
    select coalesce(o.communication_name, o.legal_name) into v_org_name from organization o where o.id = r.org_id;
    select string_agg(format('- %s × %s (%s)', trim(to_char(sl.qty, 'FM999999990.##')), sl.name_de, fmt_cents(sl.price_net_cents, 'de')), E'\n' order by sl.created_at),
           string_agg(format('- %s × %s (%s)', trim(to_char(sl.qty, 'FM999999990.##')), coalesce(sl.name_en, sl.name_de), fmt_cents(sl.price_net_cents, 'en')), E'\n' order by sl.created_at)
      into v_lines_de, v_lines_en from shop_order_line sl where sl.order_id = r.id;
    select * into v_tot from shop_order_totals(r.id);
    select om.person_id into v_primary from org_membership om where om.org_id = r.org_id and om.roles @> '{primary_ops}';
    for m in select distinct x as pid from unnest(array_remove(array[r.confirmed_by, v_primary], null)) x loop
      select coalesce(p.preferred_language, 'de') into v_locale from person p where p.id = m.pid;
      perform queue_mail('shop_order_completed', m.pid,
                         jsonb_build_object('org_name', v_org_name, 'order_no', r.order_no, 'phase', r.phase,
                                            'lines', case when v_locale = 'en' then v_lines_en else v_lines_de end, 'total_net', fmt_cents(v_tot.net_cents::integer, v_locale)),
                         'shop_order', r.id);
    end loop;
  end loop;
  if v_completed > 0 or v_cancelled > 0 then
    insert into audit_log (action, object_type, object_id, after) values ('shop.finalize', 'system', 'cron', jsonb_build_object('completed', v_completed, 'cancelled', v_cancelled));
  end if;
  return jsonb_build_object('completed', v_completed, 'cancelled', v_cancelled);
end $$;
