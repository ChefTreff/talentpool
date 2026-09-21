create or replace function my_partner_stages()
 RETURNS TABLE(stage_id uuid, stage_name text, stage_slug text, event_id uuid, event_slug text, event_name text, edition_id uuid, org_id uuid, org_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select distinct st.id, st.name, st.slug, ev.id, ev.slug, ev.name, coalesce(ev.edition_id, ev.id), st.partner_org_id, coalesce(o.communication_name, o.legal_name)
    from stage st
    join event ev on ev.id = st.event_id
    left join organization o on o.id = st.partner_org_id
    join active_roles() ra on ra.role = 'standbuehne_editor'
      and ((ra.scope_type = 'org' and st.partner_org_id is not null and ra.scope_id = st.partner_org_id)
           or (ra.scope_type = 'stage' and ra.scope_id = st.id))
    where st.active
    order by ev.slug, st.name;
end $$;
