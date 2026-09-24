create or replace function speaker_contact_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_vocab_key('speaker_contact_kind', new.kind) then
    raise exception 'invalid_contact_kind' using errcode = '22023', detail = coalesce(new.kind, 'null');
  end if;
  if new.person_id is not null
     and exists (select 1 from speaker_profile sp
                  where sp.id = new.profile_id and sp.person_id = new.person_id) then
    raise exception 'contact_is_speaker' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
