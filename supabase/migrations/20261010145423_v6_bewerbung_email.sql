-- 0311 · E-Mail-Adresse einer Bewerbung nur mit Weitergabe (PART-147)
-- Angewendet von der Architektur-Session am 10.10.2026 als 20261010145423.
-- Vorschlag des Partner-Chats (angewendet, siehe Zeile 2).
--
-- Anlass: Der Pflichthaken der Bewerbung (PART-129, Weg B, Version `partner_share_2027-1`, K-72) sagt der Person ausdrücklich, dass ChefTreff ihre Bewerbungsdaten
-- „(Name, E-Mail-Adresse, die Profilangaben, die ich zur Weitergabe freigegeben habe, und meine Antworten in dieser Bewerbung)“ an den Partner des Formats weitergibt,
-- damit er über die Teilnahme entscheiden und sie **einmalig** zu diesem Format kontaktieren kann. Die Partner-Ansichten lieferten das Profil bisher ohne Adresse
-- (Nebenfund Talent-Chat, #403) — der Partner konnte die Person, die er einladen darf, nicht erreichen. PART-147 schließt die Lücke an genau einer Stelle.
--
-- Was die Migration tut (zwei bestehende Funktionen, je eine Zeile — keine Tabelle, keine Spalte, kein neues Recht, kein neuer Schreibweg)
--   1  `applications_for_session` (Bewerbungen einer Session; dahinter `partner_applications` für Masterclass, Side Event und Interview Table) und
--   2  `partner_tour_applications` (Bewerbungen der Tour-Session für den Partner eines Stopps) geben im `profile` zusätzlich `email` zurück — die **primäre** Adresse der Person
--      (`person_email.is_primary`; `enforce_primary_email` hält genau eine je Person) — **nur wenn `application.consent_share`**. Ohne Einwilligung bleibt `profile` wie bisher
--      leer (Partner) bzw. ohne `email` (`applications_for_session` zeigt dem Team Profilfelder auch ohne Einwilligung; die Adresse gehört **nicht** dazu). Nimmt die Person die
--      Einwilligung zurück (`revoke_application_share`), liefert die nächste Abfrage keine Adresse mehr. `jsonb_strip_nulls` lässt den Schlüssel weg, wo es keine gibt.
--
-- Was bewusst nicht geändert wird: die Zeilenform (`profile` bleibt jsonb, kein neuer Spaltentyp, die Oberfläche liest einen Schlüssel); `partner_applications` (reicht durch);
-- die CSV-Ausgaben (`export_session_applications`, `export_tour_applications`) — Massenausgabe ist ein anderer Fall, die Adresse steht nur im Schubfach; das Audit
-- (`application.partner_view` mit Zeilenzahl schreibt jeder Abruf schon, auch jetzt, ohne Adresse im Eintrag).
--
-- Basis ist der Snapshot (db-konventionen §1): die beiden Funktionen sind die Live-Fassung, geändert sind genau die zwei Zeilen mit `email` samt Kommentar.
-- Fehlerschlüssel: keine neuen.
set search_path = public, extensions;

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
             'study_field', p.study_field, 'city', p.city, 'linkedin_url', p.linkedin_url,
             -- PART-147: die E-Mail-Adresse nur mit Weitergabe — auch dem Team zeigt diese Sicht sie ohne Einwilligung nicht.
             'email', case when a.consent_share then (select pe.email::text from person_email pe where pe.person_id = p.id and pe.is_primary) end)) end
    from application a
    join person p on p.id = a.person_id
    where a.session_id = p_session_id
    order by case a.status when 'confirmed' then 0 when 'accepted' then 1 when 'promoted' then 1
                           when 'shortlisted' then 2 when 'applied' then 3 when 'waitlisted' then 4 else 5 end,
             a.rank nulls last, a.created_at;
end $$;

create or replace function partner_tour_applications(p_stop_id uuid)
 RETURNS TABLE(id uuid, person_id uuid, display_name text, status text, rank integer, answers jsonb, consent_share boolean, confirm_by timestamp with time zone, confirmed_at timestamp with time zone, decided_at timestamp with time zone, created_at timestamp with time zone, profile jsonb, wished boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
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
             'study_field', p.study_field, 'city', p.city, 'linkedin_url', p.linkedin_url,
             -- PART-147: die E-Mail-Adresse der Person, die der Weitergabe zugestimmt hat (dieser Zweig gilt nur dann).
             'email', (select pe.email::text from person_email pe where pe.person_id = p.id and pe.is_primary))) end,
           -- PART-092: vom Partner dieses Stopps gewünscht (höchstens fünf).
           exists (select 1 from company_tour_wish w where w.stop_id = p_stop_id and w.application_id = a.id)
      from application a
      join person p on p.id = a.person_id
     where a.session_id = v_session
     order by case a.status when 'confirmed' then 0 when 'accepted' then 1 when 'promoted' then 1
                            when 'shortlisted' then 2 when 'applied' then 3 when 'waitlisted' then 4 else 5 end,
              a.rank nulls last, a.created_at;
end $$;

select harden_definer_functions();
