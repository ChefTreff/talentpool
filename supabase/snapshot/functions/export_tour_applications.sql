create or replace function export_tour_applications(p_stop_id uuid)
 RETURNS TABLE(bewerbung_id uuid, name text, email text, linkedin text, status text, beworben_am timestamp with time zone, entschieden_am timestamp with time zone, bestaetigt_am timestamp with time zone, taetigkeit text, karrierestufe text, arbeitgeber text, hochschule text, studienfach text, stadt text, antworten jsonb, wunsch boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_st company_tour_stop; v_session uuid; v_n integer;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_st from company_tour_stop st where st.id = p_stop_id;
  if not found then raise exception 'stop_not_found' using errcode = 'P0002'; end if;
  if v_st.host_org_id is null or not partner_can_edit(v_st.host_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select ct.session_id into v_session from company_tour ct where ct.id = v_st.tour_id;
  if v_session is null then return; end if;

  select count(*)::integer into v_n from application a where a.session_id = v_session and a.consent_share;
  -- Jeder Export steht im Protokoll: wer, wann, welcher Stopp, wie viele Zeilen.
  perform log_audit('partner.application_export', 'session', v_session::text, null,
                    jsonb_build_object('org_id', v_st.host_org_id, 'stop_id', p_stop_id, 'rows', v_n,
                                       'format', 'company_tour', 'tour', true));

  return query
    select a.id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           pe.email::text,
           p.linkedin_url,
           a.status, a.created_at, a.decided_at, a.confirmed_at,
           p.occupation_status, p.career_level, p.employer_name, p.university, p.study_field, p.city,
           (select coalesce(jsonb_agg(jsonb_build_object(
                      'key', e.key,
                      'label_de', coalesce(qc.label_de, sq.label_de, e.key),
                      'label_en', coalesce(qc.label_en, sq.label_en, qc.label_de, sq.label_de, e.key),
                      'value', e.value)
                    order by coalesce(sq.sort_order, 999), e.key), '[]'::jsonb)
               from jsonb_each(coalesce(a.answers, '{}'::jsonb)) e
               left join session_question sq
                      on sq.session_id = v_session and coalesce(sq.question_id::text, sq.id::text) = e.key
               left join question_catalog qc on qc.id = sq.question_id),
           exists (select 1 from company_tour_wish w where w.stop_id = p_stop_id and w.application_id = a.id)
      from application a
      join person p on p.id = a.person_id
      left join person_email pe on pe.person_id = p.id and pe.is_primary
     where a.session_id = v_session
       and a.consent_share          -- ohne Einwilligung keine Zeile
     order by a.created_at;
end $$;
