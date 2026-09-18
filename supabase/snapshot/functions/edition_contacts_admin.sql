create or replace function edition_contacts_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, type text, display_name text, role_label_de text, role_label_en text, email text, phone text, photo_path text, is_default boolean, sort_order integer, contract_consent_at date, orgs integer, speakers integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not can_edit_edition_contacts() then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;
  return query
    select c.id, c.type, c.display_name, c.role_label_de, c.role_label_en, c.email::text, c.phone,
           c.photo_path, c.is_default, c.sort_order, c.contract_consent_at,
           (select count(*)::integer from org_edition oe
             where oe.lead_contact_id = c.id or oe.buddy_contact_id = c.id),
           (select count(*)::integer from speaker_profile sp
             where sp.lead_contact_id = c.id or sp.buddy_contact_id = c.id)
      from edition_contact c
     where c.edition_id = v_ed
     order by c.type, c.sort_order, c.display_name;
end $$;
