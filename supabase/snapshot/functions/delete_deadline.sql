create or replace function delete_deadline(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v deadline%rowtype; v_n integer;
begin
  select * into v from deadline d where d.id = p_id for update;
  if not found then raise exception 'deadline_not_found' using errcode = 'P0002', detail = coalesce(p_id::text, ''); end if;
  if not can_edit_deadline(v.audience) then raise exception 'not allowed' using errcode = '42501'; end if;
  if not v.custom then raise exception 'deadline_is_system' using errcode = 'P0001'; end if;
  v_n := deadline_usage_count(v.edition_id, v.key);
  if v_n > 0 then raise exception 'deadline_in_use' using errcode = 'P0001', detail = v_n::text; end if;
  delete from deadline where id = p_id;
  perform log_audit('deadline.delete', 'deadline', p_id::text,
                    jsonb_build_object('key', v.key, 'audience', v.audience, 'due_at', v.due_at, 'label_de', v.label_de, 'label_en', v.label_en), null);
end $$;
