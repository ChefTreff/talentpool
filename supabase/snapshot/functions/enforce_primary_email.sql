create or replace function enforce_primary_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $$
declare
  pids uuid[];
  pid  uuid;
  n    int;
begin
  if tg_table_name = 'person' then
    pids := array[new.id];
  else
    pids := array(
      select distinct x from unnest(array[
        case when tg_op <> 'INSERT' then old.person_id end,
        case when tg_op <> 'DELETE' then new.person_id end
      ]) as x where x is not null
    );
  end if;
  foreach pid in array pids loop
    if exists (select 1 from person where id = pid) then
      select count(*) into n from person_email
        where person_id = pid and is_primary;
      if n <> 1 then
        raise exception 'person % muss genau eine primäre E-Mail haben (gefunden: %)', pid, n
          using errcode = 'check_violation';
      end if;
    end if;
  end loop;
  return null;
end $$;
