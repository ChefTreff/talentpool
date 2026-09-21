create or replace function purge_diet_data(p_days integer DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_n integer;
begin
  -- Wie das übrige Housekeeping: aus dem Cron (ohne JWT) oder von Hand durch
  -- Admin/Programm-Team.
  if not (auth.uid() is null or has_role('admin') or has_role('programme_team')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update person p
     set diet = null, diet_note = null
   where (p.diet is not null or p.diet_note is not null)
     and not exists (
       select 1
         from (select sp.person_id, sp.edition_id from speaker_profile sp
               union all
               select vp.person_id, vp.edition_id from volunteer_profile vp) x
         join event e on e.id = x.edition_id
        where x.person_id = p.id
          and (e.end_date is null or e.end_date > current_date - p_days));
  get diagnostics v_n = row_count;

  -- Ohne Werte, wie überall bei dieser Angabe: die Zahl reicht als Nachweis,
  -- dass gelöscht wurde.
  if v_n > 0 then
    perform log_audit('person.diet_purged', 'system', 'housekeeping', null,
                      jsonb_build_object('count', v_n, 'days', p_days));
  end if;
  return v_n;
end $$;
