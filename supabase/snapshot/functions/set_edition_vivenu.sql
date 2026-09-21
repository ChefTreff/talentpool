create or replace function set_edition_vivenu(p_edition_id uuid, p_vivenu_event_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  update event set vivenu_event_id = nullif(btrim(coalesce(p_vivenu_event_id, '')), '') where id = p_edition_id and is_edition;
  if not found then raise exception 'edition_not_found' using errcode = 'P0002'; end if;
  perform log_audit('edition.vivenu', 'event', p_edition_id::text, null, jsonb_build_object('vivenu_event_id', p_vivenu_event_id));
end $$;
