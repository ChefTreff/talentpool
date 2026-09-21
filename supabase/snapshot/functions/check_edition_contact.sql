create or replace function check_edition_contact(p_contact uuid, p_edition uuid, p_type text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if p_contact is null then return; end if;
  if not exists (select 1 from edition_contact c where c.id = p_contact and c.edition_id = p_edition and c.type = p_type) then
    raise exception 'invalid_contact' using errcode = '22023',
      detail = format('%s ist kein %s dieser Edition', p_contact, p_type);
  end if;
end $$;
