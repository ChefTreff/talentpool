create or replace function run_partner_housekeeping()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_refreshed integer; v_overdue integer; v_digests integer; v_shop jsonb;
begin
  v_refreshed := refresh_deliverable_due();
  v_overdue := mark_overdue_deliverables();
  v_digests := send_partner_reminders();
  v_shop := run_shop_finalization();
  return jsonb_build_object('refreshed', v_refreshed, 'overdue', v_overdue, 'digests', v_digests, 'shop', v_shop);
end $$;
