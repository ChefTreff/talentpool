create or replace function speaker_activity_overview(p_edition_id uuid)
 RETURNS TABLE(id uuid, profile_id uuid, speaker_name text, pipeline_status text, kind text, body text, occurred_at timestamp with time zone, due_on date, done_at timestamp with time zone, assignee_name text, author_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not coalesce(is_speaker_team(p_edition_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select a.id, a.profile_id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           sp.pipeline_status, a.kind, a.body, a.occurred_at, a.due_on, a.done_at,
           (select nullif(btrim(coalesce(z.first_name, '') || ' ' || coalesce(z.last_name, '')), '') from person z where z.id = a.assignee_person_id),
           (select nullif(btrim(coalesce(w.first_name, '') || ' ' || coalesce(w.last_name, '')), '') from person w where w.id = a.author_person_id)
      from speaker_activity a
      join speaker_profile sp on sp.id = a.profile_id
      join person p on p.id = sp.person_id
     where sp.edition_id = p_edition_id
       and p.deleted_at is null
     order by a.occurred_at desc
     limit 1000;
end $$;
