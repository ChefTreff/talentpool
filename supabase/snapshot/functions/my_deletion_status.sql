create or replace function my_deletion_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_r profile_deletion_request%rowtype;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_r from profile_deletion_request r
   where r.person_id = v_me and r.status = 'pending' limit 1;
  return jsonb_build_object(
    'blockers', to_jsonb(my_deletion_blockers()),
    'pending_since', v_r.requested_at);
end $$;
