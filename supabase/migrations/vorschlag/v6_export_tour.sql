-- Company Tour: Export der Bewerbungen für den Partner eines Stopps (PART-051)
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: PART-051 (Konrad 18.09., D3) — „Export aller Bewerbungsdaten … nur Bewerbungen mit
-- consent_share, DSGVO-Hinweis in der Datei, jeder Export im Audit“. Für die eigenen Formate gibt es
-- `export_session_applications` seit 0133; es verlangt `can_decide_session` und greift bei einer Tour
-- deshalb nicht (die Tour-Session gehört keiner Organisation, entschieden wird vom Team, PART-046).
--
-- `export_tour_applications(p_stop_id)` — dieselben Spalten wie `export_session_applications`, dazu
-- hinten `wunsch` (PART-092, 0208: vom Partner dieses Stopps gewünscht):
-- * Recht wie beim Lesen der Liste: `partner_can_edit` der Organisation, die den Stopp hält;
-- * **nur Bewerbungen mit Einwilligung** (`consent_share`) — ohne sie keine Zeile;
-- * Antworten wie in `partner_tour_applications` mit Fragetext (`label_de`/`label_en`), weil die
--   Fragen einer unveröffentlichten Tour-Session für den Partner nicht lesbar sind;
-- * jeder Export steht im Audit (`partner.application_export`, wie beim Formatexport, mit `tour`);
-- * ohne verknüpfte Session keine Zeilen, kein Fehler.
-- Keine Art.-9-Felder, kein Geburtsdatum, kein Telefon, keine internen Notizen — dieselbe Auswahl wie
-- der Formatexport (D3).

set search_path = public, extensions;

create or replace function export_tour_applications(p_stop_id uuid)
 returns table (bewerbung_id uuid, name text, email text, linkedin text, status text, beworben_am timestamptz,
                entschieden_am timestamptz, bestaetigt_am timestamptz, taetigkeit text, karrierestufe text,
                arbeitgeber text, hochschule text, studienfach text, stadt text, antworten jsonb, wunsch boolean)
 language plpgsql
 security definer
 set search_path = public, extensions
as $$
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

comment on function export_tour_applications(uuid) is
  'PART-051: Export der Bewerbungen auf die Session einer Company Tour für den Partner eines Stopps (partner_can_edit). Nur mit consent_share, Antworten mit Fragetext, jeder Export im Audit; dieselben Spalten wie export_session_applications, dazu wunsch (PART-092).';

grant execute on function export_tour_applications(uuid) to authenticated;

select harden_definer_functions();
