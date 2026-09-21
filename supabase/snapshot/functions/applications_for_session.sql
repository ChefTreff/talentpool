create or replace function applications_for_session(p_session_id uuid)
 RETURNS TABLE(id uuid, person_id uuid, display_name text, status text, rank integer, answers jsonb, consent_share boolean, confirm_by timestamp with time zone, confirmed_at timestamp with time zone, decided_at timestamp with time zone, created_at timestamp with time zone, profile jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_team boolean;
begin
  if not can_decide_session(p_session_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_team := is_application_team(p_session_id);
  return query
    select a.id,
           case when v_team or a.consent_share then a.person_id end,
           case when v_team or a.consent_share
                then nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') end,
           a.status, a.rank,
           case when v_team or a.consent_share then a.answers end,
           a.consent_share, a.confirm_by, a.confirmed_at, a.decided_at, a.created_at,
           case when v_team or a.consent_share then jsonb_strip_nulls(jsonb_build_object(
             'occupation_status', p.occupation_status, 'career_level', p.career_level,
             'employer_name', p.employer_name, 'university', p.university,
             'study_field', p.study_field, 'city', p.city, 'linkedin_url', p.linkedin_url)) end
    from application a
    join person p on p.id = a.person_id
    where a.session_id = p_session_id
    order by case a.status when 'confirmed' then 0 when 'accepted' then 1 when 'promoted' then 1
                           when 'shortlisted' then 2 when 'applied' then 3 when 'waitlisted' then 4 else 5 end,
             a.rank nulls last, a.created_at;
end $$;
