create or replace function speaker_activities(p_profile_id uuid)
 RETURNS TABLE(id uuid, kind text, body text, occurred_at timestamp with time zone, due_on date, assignee_person_id uuid, assignee_name text, done_at timestamp with time zone, author_person_id uuid, author_name text, can_edit boolean, can_complete boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_team boolean; v_owner uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not coalesce(can_manage_speaker(p_profile_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select is_speaker_team(sp.edition_id), sp.owner_person_id into v_team, v_owner
    from speaker_profile sp where sp.id = p_profile_id;
  return query
    select a.id, a.kind, a.body, a.occurred_at, a.due_on, a.assignee_person_id,
           (select nullif(btrim(coalesce(z.first_name, '') || ' ' || coalesce(z.last_name, '')), '') from person z where z.id = a.assignee_person_id),
           a.done_at, a.author_person_id,
           (select nullif(btrim(coalesce(w.first_name, '') || ' ' || coalesce(w.last_name, '')), '') from person w where w.id = a.author_person_id),
           coalesce(a.author_person_id = v_me or v_team, false),
           coalesce(a.kind = 'task' and (a.author_person_id = v_me or a.assignee_person_id = v_me or v_owner = v_me or v_team), false)
      from speaker_activity a
     where a.profile_id = p_profile_id
     order by (a.kind = 'task' and a.done_at is null) desc, a.due_on nulls last, a.occurred_at desc;
end $$;
