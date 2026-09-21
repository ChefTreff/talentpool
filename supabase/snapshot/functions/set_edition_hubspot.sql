create or replace function set_edition_hubspot(p_edition_id uuid, p_pipeline_id text, p_stage_id text, p_done_stage_id text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  update event set hubspot_pipeline_id = nullif(btrim(coalesce(p_pipeline_id, '')), ''),
                   hubspot_onboarding_stage_id = nullif(btrim(coalesce(p_stage_id, '')), ''),
                   hubspot_done_stage_id = nullif(btrim(coalesce(p_done_stage_id, '')), '')
   where id = p_edition_id and is_edition;
  if not found then raise exception 'edition_not_found' using errcode = 'P0002'; end if;
  perform log_audit('edition.hubspot', 'event', p_edition_id::text, null,
                    jsonb_build_object('pipeline_id', p_pipeline_id, 'stage_id', p_stage_id, 'done_stage_id', p_done_stage_id));
end $$;
