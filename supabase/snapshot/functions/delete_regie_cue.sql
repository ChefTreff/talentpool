create or replace function delete_regie_cue(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_stage uuid;
begin
  select c.stage_id into v_stage from regie_cue c where c.id = p_id;
  if v_stage is null then raise exception 'cue_not_found' using errcode = 'P0002'; end if;
  if not can_edit_regie(v_stage) then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from regie_cue where id = p_id;
  perform log_audit('regie.cue_deleted', 'regie_cue', p_id::text, null, null);
end $$;
