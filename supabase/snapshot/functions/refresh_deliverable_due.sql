create or replace function refresh_deliverable_due()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_n integer;
begin
  update deliverable d set due_at = deliverable_due(t, oe)
  from deliverable_template t, org_edition oe
  where t.id = d.template_id and oe.id = d.org_edition_id
    and d.status in ('open', 'overdue', 'rejected')
    and deliverable_due(t, oe) is distinct from d.due_at;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
