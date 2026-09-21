create or replace function initiatives_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(org_edition_id uuid, org_id uuid, org_name text, slug text, website text, description_de text, pipeline_stage text, source text, onboarding_status text, lead_contact_id uuid, produkte integer, pflichten_offen integer, kontingente integer, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by e.start_date desc limit 1))
    into v_ed;
  return query
    select oe.id, o.id, coalesce(nullif(btrim(o.communication_name), ''), o.legal_name),
           o.slug, o.website, o.description_de, oe.pipeline_stage, oe.source,
           oe.onboarding_status, oe.lead_contact_id,
           (select count(*)::integer from org_product op
             where op.org_edition_id = oe.id and op.status = 'booked'),
           -- „Offen" heisst: da muss noch jemand ran. `submitted` wartet auf
           -- unsere Prüfung und zählt deshalb mit; `accepted` und
           -- `not_required` sind durch.
           (select count(*)::integer from deliverable d
             where d.org_edition_id = oe.id
               and d.status in ('open','overdue','rejected','submitted')),
           (select count(*)::integer from org_ticket_allocation a
             where a.org_edition_id = oe.id),
           oe.updated_at
      from org_edition oe
      join organization o on o.id = oe.org_id
     where oe.edition_id = v_ed and o.type = 'initiative'
     order by
       -- Was Arbeit macht, zuerst: der Funnel liest sich von oben nach unten.
       case oe.pipeline_stage
         when 'agreement' then 1 when 'onboarding' then 2 when 'gespraech' then 3
         when 'outreach' then 4 when 'aktiv' then 5 when 'abgelehnt' then 7 else 6 end,
       coalesce(nullif(btrim(o.communication_name), ''), o.legal_name);
end $$;
