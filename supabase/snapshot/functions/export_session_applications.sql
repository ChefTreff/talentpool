create or replace function export_session_applications(p_session_id uuid)
 RETURNS TABLE(bewerbung_id uuid, name text, email text, linkedin text, status text, beworben_am timestamp with time zone, entschieden_am timestamp with time zone, bestaetigt_am timestamp with time zone, taetigkeit text, karrierestufe text, arbeitgeber text, hochschule text, studienfach text, stadt text, antworten jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_se session; v_n integer;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  -- Dieselbe Grenze wie in der Bewerberliste: wer entscheiden darf, darf exportieren.
  if not can_decide_session(p_session_id) then raise exception 'not allowed' using errcode = '42501'; end if;

  select count(*)::integer into v_n from application a
   where a.session_id = p_session_id and a.consent_share;
  -- Jeder Export steht im Protokoll: wer, wann, welches Format, wie viele Zeilen.
  perform log_audit('partner.application_export', 'session', p_session_id::text, null,
                    jsonb_build_object('org_id', v_se.partner_org_id, 'rows', v_n, 'format', v_se.format));

  return query
    select a.id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           pe.email::text,
           p.linkedin_url,
           a.status, a.created_at, a.decided_at, a.confirmed_at,
           p.occupation_status, p.career_level, p.employer_name, p.university, p.study_field, p.city,
           a.answers
      from application a
      join person p on p.id = a.person_id
      left join person_email pe on pe.person_id = p.id and pe.is_primary
     where a.session_id = p_session_id
       and a.consent_share          -- ohne Einwilligung keine Zeile
     order by a.created_at;
end $$;
