create or replace function partner_set_onboarding_status(p_org_id uuid, p_status text, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('none', 'invited', 'filled', 'call_done') then raise exception 'invalid_status' using errcode = '22023'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  update org_edition set onboarding_status = p_status,
                         invited_at = case when p_status = 'invited' then coalesce(invited_at, now()) else invited_at end,
                         onboarding_filled_at = case when p_status in ('filled', 'call_done') then coalesce(onboarding_filled_at, now()) else onboarding_filled_at end
   where id = v_oe.id;
  perform log_audit('partner.onboarding_status', 'organization', p_org_id::text, jsonb_build_object('status', v_oe.onboarding_status), jsonb_build_object('status', p_status));
end $$;
