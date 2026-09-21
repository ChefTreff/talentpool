create or replace function edition_infos_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, key text, audience text[], label_de text, label_en text, value_de text, value_en text, sort_order integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not can_edit_edition_info() then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;
  return query
    select i.id, i.key, i.audience, i.label_de, i.label_en, i.value_de, i.value_en, i.sort_order
      from edition_info i where i.edition_id = v_ed order by i.sort_order, i.key;
end $$;
