create or replace function session_partner_org(p_session_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(
           se.partner_org_id,
           (select st.partner_org_id from slot sl join stage st on st.id = sl.stage_id
             where sl.id = se.slot_id and st.kind = 'branded'))
    from session se
   where se.id = p_session_id
$$;
