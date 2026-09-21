create or replace function set_initiative_stage(p_org_edition_id uuid, p_stage text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_vorher text; v_org uuid;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_stage is not null and p_stage not in
     ('outreach','gespraech','agreement','onboarding','aktiv','abgelehnt') then
    raise exception 'invalid_stage' using errcode = '22023', detail = coalesce(p_stage, 'null');
  end if;
  select oe.pipeline_stage, oe.org_id into v_vorher, v_org
    from org_edition oe where oe.id = p_org_edition_id;
  if not found then
    raise exception 'org_edition_not_found' using errcode = 'P0002', detail = p_org_edition_id::text;
  end if;

  update org_edition set pipeline_stage = p_stage, updated_at = now() where id = p_org_edition_id;

  perform log_audit('initiative.stage', 'org_edition', p_org_edition_id::text,
                    jsonb_build_object('pipeline_stage', v_vorher),
                    jsonb_build_object('pipeline_stage', p_stage, 'org_id', v_org));
end $$;
