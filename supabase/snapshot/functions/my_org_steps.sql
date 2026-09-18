create or replace function my_org_steps(p_org_id uuid, p_topic text, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(key text, sort_order integer, done_at timestamp with time zone, done_by_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not (is_partner_of(p_org_id) or is_partner_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then
    raise exception 'org_edition_not_found' using errcode = 'P0002', detail = p_org_id::text;
  end if;
  return query
    select s.key, s.sort_order, c.done_at,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
      from org_step s
      left join org_step_check c
        on c.topic = s.topic and c.key = s.key and c.org_edition_id = v_oe.id
      left join person p on p.id = c.done_by
     where s.topic = p_topic
     order by s.sort_order, s.key;
end $$;
