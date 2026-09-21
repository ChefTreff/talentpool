create or replace function withdraw_application(p_application_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_pid uuid := current_person_id(); v_old text;
begin
  select status into v_old from application where id = p_application_id and person_id = v_pid for update;
  if not found then
    raise exception 'application_not_found' using errcode = 'P0002';
  end if;
  if v_old in ('attended','no_show','declined','expired','withdrawn') then
    raise exception 'cannot_withdraw' using errcode = 'P0001', detail = v_old;
  end if;
  update application set status = 'withdrawn' where id = p_application_id;
end $$;
