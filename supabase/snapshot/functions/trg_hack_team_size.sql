create or replace function trg_hack_team_size()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_n integer;
begin
  select count(*) into v_n from hack_team_member where team_id = new.team_id;
  if v_n >= 8 then
    raise exception 'team_full' using errcode = 'P0001', detail = '8';
  end if;
  return new;
end $$;
