create or replace function my_partner_assets(p_org_id uuid, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, deliverable_id uuid, deliverable_key text, label_de text, label_en text, kind text, storage_path text, filename text, mime text, size_bytes bigint, version integer, is_current boolean, status text, review_note text, reviewed_at timestamp with time zone, created_at timestamp with time zone)
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
    select a.id, a.deliverable_id, d.key, t.label_de, t.label_en, a.kind, a.storage_path, a.filename, a.mime, a.size_bytes, a.version, a.is_current,
           a.status, a.review_note, a.reviewed_at, a.created_at
    from partner_asset a
    left join deliverable d on d.id = a.deliverable_id
    left join deliverable_template t on t.id = d.template_id
    where a.org_edition_id = v_oe.id
    order by a.created_at desc;
end $$;
