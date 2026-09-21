create or replace function my_deliverables(p_org_id uuid, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, key text, type text, label_de text, label_en text, description_de text, description_en text, product_sku text, product_name_de text, product_name_en text, status text, due_at timestamp with time zone, submitted_at timestamp with time zone, review_note text, required boolean, file_rules jsonb, answers jsonb, assets jsonb, sort integer, answers_schema jsonb, fulfilled_by_sku text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition;
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  return query
    select d.id, d.key, t.type, t.label_de, t.label_en, t.description_de, t.description_en, d.product_sku, pr.name_de, pr.name_en,
           d.status, d.due_at, d.submitted_at, d.review_note, t.required, t.file_rules, d.answers,
           coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'filename', a.filename, 'mime', a.mime, 'size_bytes', a.size_bytes, 'status', a.status,
                                                          'version', a.version, 'storage_path', a.storage_path, 'created_at', a.created_at) order by a.created_at desc)
                     from partner_asset a where a.deliverable_id = d.id and a.is_current), '[]'::jsonb),
           t.sort, t.answers_schema, t.fulfilled_by_sku
    from deliverable d
    join deliverable_template t on t.id = d.template_id
    left join product pr on pr.sku = d.product_sku
    where d.org_edition_id = v_oe.id and d.status <> 'not_required'
    order by t.sort, d.due_at nulls last, t.label_de;
end $$;
