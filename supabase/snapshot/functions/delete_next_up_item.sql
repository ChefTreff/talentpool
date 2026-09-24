create or replace function delete_next_up_item(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_before jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not can_edit_next_up() then raise exception 'not allowed' using errcode = '42501'; end if;
  select to_jsonb(n) into v_before from next_up_item n where n.id = p_id;
  if v_before is null then
    raise exception 'next_up_not_found' using errcode = 'P0002', detail = coalesce(p_id::text, 'null');
  end if;
  delete from next_up_item where id = p_id;
  perform log_audit('next_up.delete', 'next_up_item', p_id::text, v_before, null);
end $$;
