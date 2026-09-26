create or replace function partner_graphics_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(org_id uuid, org_name text, asset_id uuid, storage_path text, filename text, mime text, version integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not (is_staff() or is_marketing_team() or is_partner_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by (current_date between e.start_date and e.end_date) desc,
                                           e.start_date desc limit 1))
    into v_ed;
  return query
    select o.id,
           nullif(btrim(coalesce(o.communication_name, o.legal_name)), ''),
           a.id, a.storage_path, a.filename, a.mime, a.version, a.created_at
      from org_edition oe
      join organization o on o.id = oe.org_id
      left join partner_asset a on a.org_edition_id = oe.id and a.kind = 'partner_graphic' and a.is_current
     where oe.edition_id = v_ed
     order by lower(coalesce(o.communication_name, o.legal_name));
end $$;
