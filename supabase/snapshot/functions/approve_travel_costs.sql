create or replace function approve_travel_costs(p_profile_id uuid, p_approved boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not (has_role('admin') or has_role('area_lead_speaker')) then raise exception 'not allowed' using errcode = '42501'; end if;
  update speaker_profile
     set travel_costs_covered     = case when p_approved then true else travel_costs_covered end,
         travel_costs_approved_by = case when p_approved then current_person_id() else null end,
         travel_costs_approved_at = case when p_approved then now() else null end
   where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  perform log_audit('speaker.travel_costs', 'speaker_profile', p_profile_id::text, null, jsonb_build_object('approved', p_approved));
end $$;
