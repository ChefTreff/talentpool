create or replace function partner_stage_guest_files(p_profile_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_manages_stage_guest(p_profile_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  return coalesce((select array_agg(a.storage_path order by a.created_at) from speaker_asset a where a.profile_id = p_profile_id),
                  '{}'::text[]);
end $$;
