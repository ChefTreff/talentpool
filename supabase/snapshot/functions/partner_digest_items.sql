create or replace function partner_digest_items(p_org_edition_id uuid)
 RETURNS TABLE(deliverable_id uuid, label_de text, label_en text, status text, due_at timestamp with time zone, sort integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select d.id, t.label_de, t.label_en, d.status, d.due_at, t.sort
  from deliverable d
  join deliverable_template t on t.id = d.template_id
  join org_edition oe on oe.id = d.org_edition_id
  left join deadline dl on dl.edition_id = oe.edition_id and dl.key = t.due_rule->>'deadline_key'
  where d.org_edition_id = p_org_edition_id
    and (
      (t.required
        and (d.status in ('overdue', 'rejected')
             or (d.status = 'open' and d.due_at is not null
                 and d.due_at <= now() + make_interval(hours => coalesce(dl.reminder_lead_hours, 168)))))
      or (not t.required
        and d.status = 'open' and d.due_at is not null and d.due_at > now()
        and d.due_at <= now() + make_interval(hours => coalesce(dl.reminder_lead_hours, 168)))
    )
  order by d.due_at nulls last, t.sort
$$;
