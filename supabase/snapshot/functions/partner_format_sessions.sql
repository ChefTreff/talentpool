create or replace function partner_format_sessions(p_org_id uuid, p_format text DEFAULT NULL::text, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, format text, title_de text, title_en text, description_de text, description_en text, language text, access_mode text, capacity integer, publish_status text, format_details jsonb, starts_at timestamp with time zone, ends_at timestamp with time zone, stage_name text, day_label_de text, applications_total integer, applications_accepted integer, is_host boolean)
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
    select se.id, se.format, se.title_de, se.title_en, se.description_de, se.description_en,
           se.language, se.access_mode, se.capacity, se.publish_status, se.format_details,
           sl.start_at, sl.end_at, st.name, ed.label_de,
           (select count(*)::integer from application a where a.session_id = se.id),
           (select count(*)::integer from application a where a.session_id = se.id and a.status in ('accepted','confirmed')),
           (se.host_org_id = p_org_id)
      from session se
      join event ev on ev.id = se.event_id
      left join slot sl on sl.id = se.slot_id
      left join stage st on st.id = sl.stage_id
      left join event_day ed on ed.id = sl.event_day_id
     where se.partner_org_id = p_org_id
       and (ev.id = v_oe.edition_id or ev.edition_id = v_oe.edition_id)
       and se.publish_status <> 'cancelled'
       and (p_format is null or se.format = p_format)
     order by sl.start_at nulls last, se.title_de;
end $$;
