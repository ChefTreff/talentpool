create or replace function resync_deliverables(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare r record; v_n integer := 0;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  for r in select oe.id from org_edition oe where p_edition_id is null or oe.edition_id = p_edition_id loop
    perform sync_deliverables(r.id); v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
