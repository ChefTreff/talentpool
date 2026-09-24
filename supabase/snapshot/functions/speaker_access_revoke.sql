create or replace function speaker_access_revoke(p_person_id uuid, p_edition_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if p_person_id is null then return; end if;
  if exists (select 1 from speaker_profile s
              where s.assistant_person_id = p_person_id and s.edition_id = p_edition_id)
     or exists (select 1 from speaker_contact c
                join speaker_profile s on s.id = c.profile_id
                where c.person_id = p_person_id and c.has_access and s.edition_id = p_edition_id) then
    return;
  end if;
  update role_assignment set valid_to = greatest(now(), valid_from + interval '1 second')
   where person_id = p_person_id and role = 'speaker_assistant' and scope_type = 'edition'
     and edition_id = p_edition_id and (valid_to is null or valid_to > now());
end $$;
