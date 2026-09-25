-- Company Tour im Partner-Portal: Bewerbungen auf die Tour lesen (PART-046)
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: PART-046 (Konrad 17./18.09., D5) und die Reihenfolge vom 25.09.: „der Partner sieht seinen
-- Stopp und die Bewerbungen, die Verknüpfung pflegt das Team“. Stopp und Antworten gibt es seit 0133
-- (`partner_company_tour`, `partner_update_tour_stop`), die Session der Tour seit 0173
-- (`company_tour.session_id`, TAL-003), die Pflege im Admin seit 0189.
--
-- **Was fehlte:** ein Leseweg für die Bewerbungen. Die Session einer Tour gehört keiner Organisation
-- (`host_org_id` leer — eine Tour hat mehrere Stopps), also greifen `partner_applications` und
-- `can_decide_session` für den Partner nicht, und das ist richtig so: **entschieden wird für die ganze
-- Tour vom Team**, nicht je Stopp. Der Partner liest nur.
--
-- `partner_tour_applications(p_stop_id)`:
-- * Recht wie bei den eigenen Formaten: `partner_can_edit` der Organisation, die den Stopp hält
--   (Hauptkontakt, weitere Kontakte, Zeichnungsberechtigte; dazu das Partner-Team).
-- * Personenbezug nur mit `consent_share` — dieselbe Regel wie `applications_for_session` für Partner:
--   ohne Einwilligung bleibt die Zeile stehen (damit die Zahl stimmt), aber ohne Name, Antworten, Profil.
-- * Antworten kommen **mit Fragetext** (`label_de`/`label_en` je Antwort, Reihenfolge der Fragen): die
--   Fragen der Tour-Session sind für den Partner nicht lesbar, solange sie nicht veröffentlicht ist, und
--   ein Schlüssel wie eine UUID sagt niemandem etwas.
-- * Jeder Abruf steht im Audit (`application.partner_view`, wie `partner_applications`, mit `tour`).
-- * Ohne verknüpfte Session: keine Zeilen, kein Fehler.

set search_path = public, extensions;

create or replace function partner_tour_applications(p_stop_id uuid)
 returns table (id uuid, person_id uuid, display_name text, status text, rank integer, answers jsonb,
                consent_share boolean, confirm_by timestamptz, confirmed_at timestamptz,
                decided_at timestamptz, created_at timestamptz, profile jsonb)
 language plpgsql
 security definer
 set search_path = public, extensions
as $$
declare v_st company_tour_stop; v_session uuid; v_n integer;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_st from company_tour_stop where company_tour_stop.id = p_stop_id;
  if not found then raise exception 'stop_not_found' using errcode = 'P0002'; end if;
  if v_st.host_org_id is null or not partner_can_edit(v_st.host_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select ct.session_id into v_session from company_tour ct where ct.id = v_st.tour_id;
  if v_session is null then return; end if;

  select count(*)::integer into v_n from application a where a.session_id = v_session;
  perform log_audit('application.partner_view', 'session', v_session::text, null,
                    jsonb_build_object('org_id', v_st.host_org_id, 'stop_id', p_stop_id, 'rows', v_n, 'tour', true));

  return query
    select a.id,
           case when a.consent_share then a.person_id end,
           case when a.consent_share
                then nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') end,
           a.status, a.rank,
           case when a.consent_share then (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'key', e.key,
                      'label_de', coalesce(qc.label_de, sq.label_de, e.key),
                      'label_en', coalesce(qc.label_en, sq.label_en, qc.label_de, sq.label_de, e.key),
                      'value', e.value)
                    order by coalesce(sq.sort_order, 999), e.key), '[]'::jsonb)
               from jsonb_each(coalesce(a.answers, '{}'::jsonb)) e
               left join session_question sq
                      on sq.session_id = v_session and coalesce(sq.question_id::text, sq.id::text) = e.key
               left join question_catalog qc on qc.id = sq.question_id) end,
           a.consent_share, a.confirm_by, a.confirmed_at, a.decided_at, a.created_at,
           case when a.consent_share then jsonb_strip_nulls(jsonb_build_object(
             'occupation_status', p.occupation_status, 'career_level', p.career_level,
             'employer_name', p.employer_name, 'university', p.university,
             'study_field', p.study_field, 'city', p.city, 'linkedin_url', p.linkedin_url)) end
      from application a
      join person p on p.id = a.person_id
     where a.session_id = v_session
     order by case a.status when 'confirmed' then 0 when 'accepted' then 1 when 'promoted' then 1
                            when 'shortlisted' then 2 when 'applied' then 3 when 'waitlisted' then 4 else 5 end,
              a.rank nulls last, a.created_at;
end $$;

comment on function partner_tour_applications(uuid) is
  'PART-046: Bewerbungen auf die Session der Company Tour, für den Partner eines Stopps (partner_can_edit). Nur lesen — entschieden wird für die ganze Tour vom Team. Personenbezug nur mit consent_share, Antworten mit Fragetext, jeder Abruf im Audit.';

grant execute on function partner_tour_applications(uuid) to authenticated;

select harden_definer_functions();
