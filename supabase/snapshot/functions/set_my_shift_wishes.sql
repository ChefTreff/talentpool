create or replace function set_my_shift_wishes(p_shift_ids uuid[], p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_pid uuid := current_person_id(); v_ed uuid; v_ids uuid[]; v_n integer;
begin
  if v_pid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := volunteer_edition(p_edition_id);
  if not exists (select 1 from volunteer_profile v where v.person_id = v_pid and v.edition_id = v_ed and v.status = 'accepted') then
    raise exception 'not_accepted' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(x.id order by x.o), '{}') into v_ids
    from (select u.id, min(u.o) as o from unnest(coalesce(p_shift_ids, '{}')) with ordinality as u(id, o) group by u.id) x;
  if cardinality(v_ids) = 0 then raise exception 'wish_required' using errcode = 'P0001'; end if;
  if cardinality(v_ids) > 5 then raise exception 'too_many_wishes' using errcode = 'P0001'; end if;
  select count(*) into v_n from shift s where s.id = any (v_ids) and s.edition_id = v_ed and s.active;
  if v_n <> cardinality(v_ids) then raise exception 'shift_not_found' using errcode = 'P0002'; end if;
  delete from shift_wish w where w.person_id = v_pid;
  insert into shift_wish (person_id, shift_id, rank)
  select v_pid, u.id, u.o::integer from unnest(v_ids) with ordinality as u(id, o);
end $$;
