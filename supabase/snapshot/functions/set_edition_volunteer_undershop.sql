create or replace function set_edition_volunteer_undershop(p_edition_id uuid, p_undershop_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null and not is_volunteer_team() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update event set vivenu_volunteer_undershop_id = nullif(btrim(p_undershop_id), '')
   where id = p_edition_id and is_edition;
  if not found then raise exception 'edition_not_found' using errcode = 'P0002'; end if;
end $$;
