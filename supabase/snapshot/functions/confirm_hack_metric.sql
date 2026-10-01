create or replace function confirm_hack_metric(p_team_id uuid, p_confirm boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  update hack_metric_result
     set confirmed_by = case when p_confirm then current_person_id() end,
         confirmed_at = case when p_confirm then now() end
   where team_id = p_team_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform log_audit('hack.metric_confirmed', 'hack_team', p_team_id::text, null,
                    jsonb_build_object('confirmed', coalesce(p_confirm, false)));
end $$;
