create or replace function org_steps_progress(p_topic text, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(org_id uuid, org_name text, done integer, total integer, last_done_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid; v_total integer;
begin
  if not (is_partner_team() or is_production_team() or is_staff()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by (current_date between e.start_date and e.end_date) desc,
                                           e.start_date desc limit 1))
    into v_ed;
  select count(*)::integer into v_total from org_step s where s.topic = p_topic;
  return query
    select o.id, coalesce(o.communication_name, o.legal_name),
           count(c.key)::integer, v_total, max(c.done_at)
      from org_edition oe
      join organization o on o.id = oe.org_id
      left join org_step_check c on c.org_edition_id = oe.id and c.topic = p_topic
     where oe.edition_id = v_ed
     group by o.id, coalesce(o.communication_name, o.legal_name)
     order by count(c.key), coalesce(o.communication_name, o.legal_name);
end $$;
