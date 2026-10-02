create or replace function wishable_shifts(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, event_day_id uuid, day_label_de text, day_label_en text, area text, "position" text, start_at timestamp with time zone, end_at timestamp with time zone, location text, wish_rank integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_pid uuid := current_person_id(); v_ed uuid;
begin
  if v_pid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := volunteer_edition(p_edition_id);
  if not exists (select 1 from volunteer_profile v where v.person_id = v_pid and v.edition_id = v_ed and v.status = 'accepted') then
    raise exception 'not_accepted' using errcode = 'P0001';
  end if;
  return query
    select s.id, s.event_day_id, d.label_de, d.label_en, s.area, s.position, s.start_at, s.end_at, s.location, w.rank
      from shift s
      left join event_day d on d.id = s.event_day_id
      left join shift_wish w on w.shift_id = s.id and w.person_id = v_pid
     where s.edition_id = v_ed and s.active
     order by s.start_at, s.area, s.position;
end $$;
