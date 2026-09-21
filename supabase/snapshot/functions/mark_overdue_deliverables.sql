create or replace function mark_overdue_deliverables()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_n integer;
begin
  update deliverable d set status = 'open'
   where d.status = 'overdue'
     and (d.due_at is null or d.due_at >= now()
          or exists (select 1 from deliverable_template t where t.id = d.template_id and not t.required));
  update deliverable d set status = 'overdue'
   where d.status = 'open' and d.due_at is not null and d.due_at < now()
     and exists (select 1 from deliverable_template t where t.id = d.template_id and t.required);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
