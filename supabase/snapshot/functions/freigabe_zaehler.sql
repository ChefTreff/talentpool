create or replace function freigabe_zaehler()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_res     jsonb := '{}'::jsonb;
  v_n       integer;
  v_event   uuid;
  v_partner uuid[] := '{}';
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  -- Titel & Beschreibungen: Abschnitt und Speaker-Team bzw. Stage Lead mit Bühne (`pending_submissions` filtert die Zeilen).
  if has_admin_section('submissions') and coalesce((my_manager_scope() ->> 'is_manager')::boolean, false) then
    select count(*) into v_n from pending_submissions();
    v_res := v_res || jsonb_build_object('inhalte', v_n);
  end if;

  -- Slots: Standbühnen-Anfragen plus nicht veröffentlichte Hauptbühnen-Sessions des Summits (Board und Tabelle zeigen nur ihn).
  if has_admin_section('programme') then
    select e.id into v_event
      from event e
     where not e.is_edition
       and exists (select 1 from stage st where st.event_id = e.id)
     order by (e.format_tag is distinct from 'summit'), e.start_date
     limit 1;
    v_n := 0;
    if v_event is not null then
      begin
        select coalesce(array_agg(p.session_id), '{}') into v_partner from partner_sessions_pending(v_event) p;
      exception when insufficient_privilege then
        v_partner := '{}';
      end;
      select count(*) into v_n
        from programme_board b
       where b.event_id = v_event
         and b.session_id is not null
         and b.stage_type is distinct from 'partner_booth'
         and b.publish_status in ('draft', 'review')
         and b.session_id <> all (v_partner);
      v_n := v_n + cardinality(v_partner);
    end if;
    v_res := v_res || jsonb_build_object('slots', v_n);
  end if;

  -- Reisekosten: nur eingereichte Anträge; die Funktion verweigert allen außer admin und area_lead_speaker.
  if has_admin_section('expenses') then
    begin
      select count(*) into v_n from expense_queue() q where q.status = 'submitted';
      v_res := v_res || jsonb_build_object('reisekosten', v_n);
    exception when insufficient_privilege then
      null;
    end;
  end if;

  -- Hotel und Shuttle teilen sich den Abschnitt `hospitality`; jede Liste trägt ihr eigenes Tor.
  if has_admin_section('hospitality') then
    begin
      select count(*) into v_n
        from hospitality_admin_overview() o, jsonb_array_elements(o.bookings) b
       where b ->> 'status' in ('requested', 'waitlisted');
      v_res := v_res || jsonb_build_object('hotel', v_n);
    exception when insufficient_privilege then
      null;
    end;
    begin
      select count(*) into v_n from shuttle_bookings_admin() s where s.status = 'requested';
      v_res := v_res || jsonb_build_object('shuttle', v_n);
    exception when insufficient_privilege then
      null;
    end;
  end if;

  return v_res;
end $$;
