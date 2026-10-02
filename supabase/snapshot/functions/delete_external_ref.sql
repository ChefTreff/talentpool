create or replace function delete_external_ref(p_system text, p_object_type text, p_object_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_n integer;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from external_ref r
   where r.system = p_system and r.object_type = p_object_type and r.object_id = p_object_id;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;
