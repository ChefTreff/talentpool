create or replace function partner_review_queue(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, org_id uuid, org_name text, key text, type text, label_de text, label_en text, status text, due_at timestamp with time zone, submitted_at timestamp with time zone, submitted_by_name text, assets jsonb, answers jsonb, review_note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select d.id, oe.org_id, coalesce(o.communication_name, o.legal_name), d.key, t.type, t.label_de, t.label_en, d.status, d.due_at, d.submitted_at,
           (select btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) from person p where p.id = d.submitted_by),
           coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'filename', a.filename, 'mime', a.mime, 'size_bytes', a.size_bytes, 'storage_path', a.storage_path, 'status', a.status) order by a.created_at desc)
                     from partner_asset a where a.deliverable_id = d.id and a.is_current), '[]'::jsonb),
           d.answers, d.review_note
    from deliverable d
    join deliverable_template t on t.id = d.template_id
    join org_edition oe on oe.id = d.org_edition_id
    join organization o on o.id = oe.org_id
    where d.status in ('submitted', 'rejected', 'overdue') and (p_edition_id is null or oe.edition_id = p_edition_id)
    order by case d.status when 'submitted' then 0 when 'overdue' then 1 else 2 end, d.submitted_at nulls last, d.due_at nulls last;
end $$;
