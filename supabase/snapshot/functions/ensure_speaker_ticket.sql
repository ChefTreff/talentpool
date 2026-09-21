create or replace function ensure_speaker_ticket(p_profile_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null and not can_manage_speaker(p_profile_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  return speaker_ticket_create(p_profile_id);
end $$;
