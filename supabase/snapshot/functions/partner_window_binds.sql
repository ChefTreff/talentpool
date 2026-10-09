create or replace function partner_window_binds(p_stage_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select exists (select 1 from stage st
                  where st.id = p_stage_id and st.kind in ('booth', 'branded') and st.partner_org_id is not null)
     and not exists (
       select 1
         from stage st
         join event ev on ev.id = st.event_id
         join active_roles() ra on true
        where st.id = p_stage_id
          and ra.role in ('admin', 'programme_team')
          and (ra.scope_type = 'global'
               or (ra.scope_type = 'edition' and ra.edition_id in (ev.id, ev.edition_id))))
     -- K-84: die Bühnenleitung arbeitet auf einer gebrandeten Hauptbühne als Bühnenleitung, nicht als Partner — sie bleibt am Tagesrahmen
     -- (`outside_stage_day`) gebunden, legt weiter jede Slot-Art an und löscht nicht.
     and not exists (
       select 1
         from active_roles() ra
        where ra.role = 'speaker_manager'
          and ra.scope_type in ('stage', 'stage_day', 'slot')
          and scope_stage_id(ra.scope_type, ra.scope_id) = p_stage_id)
$$;
