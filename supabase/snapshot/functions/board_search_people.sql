create or replace function board_search_people(p_event_id uuid, p_query text, p_limit integer DEFAULT 10, p_moderation boolean DEFAULT false)
 RETURNS TABLE(id uuid, display_name text, organization text, is_stage_lead boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid; v_q text; v_editor boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not can_search_board(p_event_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_query, ''))) < 2 then return; end if;
  -- PORT3 / L3 (F2): wer nicht das Programm bearbeitet, findet nur Speaker, die
  -- er verwaltet — die eigene Bühne und eigene Einträge.
  v_editor := is_programme_editor(p_event_id);
  select coalesce(ev.edition_id, ev.id) into v_ed from event ev where ev.id = p_event_id;
  v_q := board_like_pattern(p_query);
  return query
    select x.pid, x.name, x.org, x.lead
      from (
        select p.id as pid,
               nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') as name,
               sp.organization_name as org,
               false as lead,
               p.last_name as ln, p.first_name as fn
          from speaker_profile sp
          join person p on p.id = sp.person_id
         where sp.edition_id = v_ed
           and p.deleted_at is null
           and (v_editor or can_manage_speaker(sp.id))
           and (p.first_name ilike v_q or p.last_name ilike v_q
                or (coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) ilike v_q
                or coalesce(sp.organization_name, '') ilike v_q)
        union all
        -- LEAD-042: Stage Leads der Edition, nur für die Moderation und nur,
        -- wer nicht schon als Speaker oben steht.
        select p.id, nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
               null::text, true, p.last_name, p.first_name
          from person p
         where coalesce(p_moderation, false)
           and p.deleted_at is null
           and not exists (select 1 from speaker_profile sp2 where sp2.person_id = p.id and sp2.edition_id = v_ed)
           -- PORT3: Stage Leads der Edition über ihre Bühnen, Tage oder Slots —
           -- eine Edition-Zeile (Altbestand) macht niemanden mehr zum Stage Lead.
           and exists (
             select 1 from role_assignment ra
              join stage st on st.id = scope_stage_id(ra.scope_type, ra.scope_id)
              join event ev on ev.id = st.event_id
              where ra.person_id = p.id
                and ra.role = 'speaker_manager'
                and ra.valid_from <= now()
                and (ra.valid_to is null or ra.valid_to > now())
                and (ev.id = v_ed or ev.edition_id = v_ed))
           and (p.first_name ilike v_q or p.last_name ilike v_q
                or (coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) ilike v_q)
      ) x
     order by x.ln nulls last, x.fn nulls last
     limit least(greatest(coalesce(p_limit, 10), 1), 25);
end $$;
