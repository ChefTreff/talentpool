create or replace function deliverable_due(p_template deliverable_template, p_oe org_edition)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select case
    when p_template.due_rule ? 'deadline_key' then (select d.due_at from deadline d where d.edition_id = p_oe.edition_id and d.key = p_template.due_rule->>'deadline_key')
    when p_template.due_rule ? 'offset_days' then coalesce(p_oe.invited_at, p_oe.created_at) + make_interval(days => (p_template.due_rule->>'offset_days')::integer)
    else null end
$$;
