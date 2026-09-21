create or replace function hubspot_editions()
 RETURNS TABLE(edition_id uuid, slug text, name text, pipeline_id text, stage_id text, done_stage_id text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null and not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select e.id, e.slug, e.name, e.hubspot_pipeline_id, e.hubspot_onboarding_stage_id, e.hubspot_done_stage_id
    from event e where e.is_edition and e.hubspot_pipeline_id is not null and e.hubspot_onboarding_stage_id is not null
    order by e.start_date desc nulls last;
end $$;
