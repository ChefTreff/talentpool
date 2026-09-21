create or replace function my_applications()
 RETURNS TABLE(id uuid, session_id uuid, status text, answers jsonb, consent_share boolean, confirm_by timestamp with time zone, confirmed_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select a.id, a.session_id,
         case
           when a.status in ('applied','shortlisted') then 'applied'
           when a.status in ('accepted','promoted','waitlisted','declined')
                and not decisions_released(a.session_id) then 'applied'
           when a.status = 'promoted' then 'accepted'
           else a.status
         end as status,
         a.answers, a.consent_share, a.confirm_by, a.confirmed_at, a.created_at, a.updated_at
  from application a
  where a.person_id = current_person_id()
$$;
