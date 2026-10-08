create or replace function stage_blocked_times(p_event_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, event_id uuid, stage_id uuid, stage_name text, starts_at timestamp with time zone, ends_at timestamp with time zone, reason text, slots_affected integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ev uuid;
begin
  -- Wer ein Board vor sich hat (Admin, Programm-Team, Stage Leads, Standbühnen) **oder** den Abschnitt `programme` hält — wer
  -- Sperrzeiten pflegen darf, muss sie auch lesen können (die Leitungen Speaker und Produktion halten den Abschnitt, sind aber
  -- keine Board-Nutzer im Sinne von `is_programme_board_user`).
  if not (is_programme_board_user() or has_admin_section('programme')) then raise exception 'not allowed' using errcode = '42501'; end if;
  -- Ohne Angabe der Summit, den auch das Board wählt: Veranstaltungen mit Bühnen, Summit zuerst.
  v_ev := coalesce(p_event_id, (select e.id from event e
                                 where not e.is_edition and exists (select 1 from stage st where st.event_id = e.id)
                                 order by (e.format_tag is distinct from 'summit'), e.start_date
                                 limit 1));
  if v_ev is null then return; end if;
  return query
    select b.id, b.event_id, b.stage_id, st.name, b.starts_at, b.ends_at, b.reason,
           (select count(*)::integer
              from slot s join stage s2 on s2.id = s.stage_id
             where s2.event_id = b.event_id
               and (b.stage_id is null or s.stage_id = b.stage_id)
               and s.slot_type = 'content'
               and tstzrange(s.start_at, s.end_at, '[)') && tstzrange(b.starts_at, b.ends_at, '[)'))
      from stage_blocked_time b
      left join stage st on st.id = b.stage_id
     where b.event_id = v_ev
     order by b.starts_at, st.name nulls first, b.id;
end $$;
