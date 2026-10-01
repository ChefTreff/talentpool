create or replace function delete_award_application(p_application_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_a award_application;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('initiatives') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_a from award_application where id = p_application_id for update;
  if not found then raise exception 'application_not_found' using errcode = 'P0002'; end if;
  insert into storage_purge_queue (bucket, path)
    select 'award-images', unnest(v_a.images)
  on conflict (bucket, path) do nothing;
  delete from award_application where id = p_application_id;
  perform log_audit('award.delete', 'award_application', p_application_id::text,
                    jsonb_build_object('name', v_a.name, 'status', v_a.status), null);
end $$;
