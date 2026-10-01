create or replace function applications_admin_list(p_event_id uuid DEFAULT NULL::uuid, p_format text DEFAULT NULL::text, p_session_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_consent boolean DEFAULT NULL::boolean, p_query text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, session_id uuid, session_title_de text, session_title_en text, format text, start_at timestamp with time zone, released boolean, person_id uuid, display_name text, email text, status text, rank integer, consent_share boolean, decided_at timestamp with time zone, created_at timestamp with time zone, profile jsonb, answers jsonb, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_q text := nullif(btrim(coalesce(p_query, '')), '');
  v_like text;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_status is not null and p_status not in ('applied','shortlisted','accepted','promoted','confirmed','attended',
                                               'waitlisted','declined','expired','no_show','withdrawn') then
    raise exception 'invalid_status' using errcode = '22023', detail = p_status;
  end if;
  -- Die Suche ist Text, kein Muster: % und _ gelten wörtlich.
  v_like := case when v_q is null then null
                 else '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%' end;

  return query
  with erlaubt as materialized (
    -- Rechte je Session einmal, nicht je Bewerbung: bei 50 Sessions mit je 500 Bewerbungen sind das 50
    -- Prüfungen statt 25 000.
    select se.id as s_id, se.title_de as s_title_de, se.title_en as s_title_en, se.format as s_format,
           sl.start_at as s_start,
           exists (select 1 from decision_release d where d.session_id = se.id) as s_released
      from session se
      left join slot sl on sl.id = se.slot_id
     where se.access_mode = 'application'
       and (p_event_id is null or se.event_id = p_event_id)
       and (p_format is null or se.format = p_format)
       and (p_session_id is null or se.id = p_session_id)
       and is_application_team(se.id)
  ), treffer as (
    select a.id as a_id, a.session_id as a_session, a.person_id as a_person, a.status as a_status,
           a.rank as a_rank, a.consent_share as a_consent, a.decided_at as a_decided, a.created_at as a_created,
           a.answers as a_answers, e.s_title_de, e.s_title_en, e.s_format, e.s_start, e.s_released,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') as a_name,
           pe.email::text as a_email,
           jsonb_strip_nulls(jsonb_build_object(
             'occupation_status', p.occupation_status, 'career_level', p.career_level,
             'employer_name', p.employer_name, 'university', p.university,
             'study_field', p.study_field, 'city', p.city, 'linkedin_url', p.linkedin_url)) as a_profile,
           count(*) over () as a_total
      from application a
      join erlaubt e on e.s_id = a.session_id
      join person p on p.id = a.person_id
      left join person_email pe on pe.person_id = p.id and pe.is_primary
     where (p_status is null or a.status = p_status)
       and (p_consent is null or a.consent_share = p_consent)
       and (v_like is null
            or coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '') ilike v_like
            or pe.email::text ilike v_like)
     order by e.s_start nulls last, e.s_title_de, e.s_id,
              case a.status when 'confirmed' then 0 when 'accepted' then 1 when 'promoted' then 1
                            when 'shortlisted' then 2 when 'applied' then 3 when 'waitlisted' then 4 else 5 end,
              a.rank nulls last, a.created_at, a.id
     limit v_limit offset v_offset
  )
  select t.a_id, t.a_session, t.s_title_de, t.s_title_en, t.s_format, t.s_start, t.s_released,
         t.a_person, t.a_name, t.a_email, t.a_status, t.a_rank, t.a_consent, t.a_decided, t.a_created,
         t.a_profile,
         -- Antworten mit Fragetext, nur für die Zeilen dieser Seite.
         (select coalesce(jsonb_agg(jsonb_build_object(
                    'key', x.key,
                    'label_de', coalesce(qc.label_de, sq.label_de, x.key),
                    'label_en', coalesce(qc.label_en, sq.label_en, qc.label_de, sq.label_de, x.key),
                    'value', x.value)
                  order by coalesce(sq.sort_order, 999), x.key), '[]'::jsonb)
            from jsonb_each(coalesce(t.a_answers, '{}'::jsonb)) x
            left join session_question sq
                   on sq.session_id = t.a_session and coalesce(sq.question_id::text, sq.id::text) = x.key
            left join question_catalog qc on qc.id = sq.question_id),
         t.a_total
    from treffer t
   order by t.s_start nulls last, t.s_title_de, t.a_session,
            case t.a_status when 'confirmed' then 0 when 'accepted' then 1 when 'promoted' then 1
                            when 'shortlisted' then 2 when 'applied' then 3 when 'waitlisted' then 4 else 5 end,
            t.a_rank nulls last, t.a_created, t.a_id;
end $$;
