-- 0238 · Bewerbungsliste im Admin über alle Sessions, skalierbar, Sammelentscheidung (ADM-003)
-- Angewendet von der Architektur-Session am 01.10.2026 als 20261001125248.
-- Bewerbungen im Admin: Liste über alle Sessions mit Filtern, seitenweise, Sammelentscheidungen (ADM-003)
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: ADM-003 (Konrad 25.09.): „bis zu 50 Masterclasses mit je 500 und mehr Bewerbungen" — Liste je
-- Format und Session mit Filtern, seitenweise, Sammelaktionen. Heute lädt `/admin/bewerbungen/<Session>`
-- alle Bewerbungen einer Session auf einmal, eine Liste über alle Sessions gibt es nicht.
--
-- * `applications_overview` (aus dem Snapshot) bekommt hinten die Spalte `format` — für die Gruppierung
--   und den Filter je Format. Rückgabetyp ändert sich → drop + create + grant; die Aufrufer lesen nach Namen.
-- * `applications_admin_list(event, format, session, status, einwilligung, suche, limit, offset)` — für das
--   **Team** (`is_application_team` je Session: Admin, Programm-Team der Edition, Bereichsleitung Talent).
--   Gefiltert und geblättert wird in der Datenbank; die Rechte werden je **Session** einmal geprüft, nicht je
--   Zeile. Jede Zeile trägt `total_count` (Treffer gesamt) für das Blättern und die Antworten mit Fragetext
--   (`label_de`/`label_en`) wie `export_tour_applications`. Partner bekommen hier nichts — sie haben
--   `partner_applications` und sehen dort nur, was sie sehen dürfen; eine Suche nach Namen über
--   Bewerbungen ohne Einwilligung bliebe sonst ein Weg, Teilnahmen abzufragen. Höchstens 200 Zeilen je Abruf.
-- * `decide_applications(ids, status)` — Sammelentscheidung: ruft je Bewerbung `decide_application` auf.
--   Damit gelten dieselbe Rechteprüfung (`can_decide_session`), dieselben Regeln (nicht mehr nach
--   Bestätigung) und **dasselbe Audit je Bewerbung** wie beim Einzelklick. Gibt je Kennung zurück, ob es
--   geklappt hat, und den Fehlerschlüssel, statt beim ersten Fehler alles zurückzurollen. Feste
--   Reihenfolge (Sperren immer gleich herum), höchstens 200 je Aufruf (`too_many_applications`).
--   Achtung, wie beim Einzelklick: ist eine Session schon freigegeben, gehen die Mails sofort raus.
-- Endet mit `select harden_definer_functions();`.

set search_path = public, extensions;

drop function if exists applications_overview(uuid);

create or replace function applications_overview(p_event_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(session_id uuid, event_id uuid, title_de text, title_en text, start_at timestamp with time zone, end_at timestamp with time zone, stage_name text, capacity integer, publish_status text, application_deadline timestamp with time zone, released boolean, counts jsonb, format text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select se.id, se.event_id, se.title_de, se.title_en, sl.start_at, sl.end_at, st.name, se.capacity,
         se.publish_status, se.application_deadline,
         exists (select 1 from decision_release d where d.session_id = se.id),
         coalesce((select jsonb_object_agg(x.status, x.n)
                   from (select a.status, count(*) as n from application a where a.session_id = se.id group by a.status) x),
                  '{}'::jsonb),
         se.format
  from session se
  left join slot sl on sl.id = se.slot_id
  left join stage st on st.id = sl.stage_id
  where se.access_mode = 'application'
    and (p_event_id is null or se.event_id = p_event_id)
    and can_decide_session(se.id)
  order by sl.start_at nulls last, se.title_de
$$;

grant execute on function applications_overview(uuid) to authenticated;

create or replace function applications_admin_list(
  p_event_id uuid default null, p_format text default null, p_session_id uuid default null,
  p_status text default null, p_consent boolean default null, p_query text default null,
  p_limit integer default 50, p_offset integer default 0)
 returns table (id uuid, session_id uuid, session_title_de text, session_title_en text, format text,
                start_at timestamptz, released boolean, person_id uuid, display_name text, email text,
                status text, rank integer, consent_share boolean, decided_at timestamptz,
                created_at timestamptz, profile jsonb, answers jsonb, total_count bigint)
 language plpgsql
 stable security definer
 set search_path = public, extensions
as $$
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

comment on function applications_admin_list(uuid, text, uuid, text, boolean, text, integer, integer) is
  'ADM-003: Bewerbungen über alle Sessions für das Team (is_application_team je Session), gefiltert nach Edition, Format, Session, Status, Einwilligung und Suche, seitenweise (höchstens 200), mit total_count und Antworten samt Fragetext.';

create or replace function decide_applications(p_application_ids uuid[], p_status text)
 returns table (application_id uuid, ok boolean, error_key text)
 language plpgsql
 security definer
 set search_path = public, extensions
as $$
declare v_id uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  -- Einmal vorab statt je Zeile: ein falscher Status ist kein Fehler einzelner Bewerbungen.
  if p_status is null or p_status not in ('shortlisted','accepted','waitlisted','declined') then
    raise exception 'invalid_decision' using errcode = '22023', detail = coalesce(p_status, 'null');
  end if;
  if coalesce(cardinality(p_application_ids), 0) > 200 then
    raise exception 'too_many_applications' using errcode = '22023', detail = cardinality(p_application_ids)::text;
  end if;

  -- Je Bewerbung der Weg des Einzelklicks: Rechte, Regeln und Audit stehen in decide_application.
  -- Sortiert, damit zwei gleichzeitige Sammelaktionen die Zeilen in derselben Reihenfolge sperren.
  for v_id in select distinct u from unnest(coalesce(p_application_ids, '{}'::uuid[])) as u where u is not null order by u loop
    begin
      perform decide_application(v_id, p_status, null);
      application_id := v_id; ok := true; error_key := null;
      return next;
    exception
      when sqlstate '42501' then
        application_id := v_id; ok := false; error_key := 'not_allowed';
        return next;
      when sqlstate 'P0001' or sqlstate 'P0002' or sqlstate '22023' then
        application_id := v_id; ok := false; error_key := sqlerrm;
        return next;
    end;
  end loop;
end $$;

comment on function decide_applications(uuid[], text) is
  'ADM-003: Sammelentscheidung — je Bewerbung decide_application (Rechte, Regeln und Audit wie beim Einzelklick), Ergebnis je Kennung statt Abbruch beim ersten Fehler; höchstens 200 je Aufruf.';

grant execute on function applications_admin_list(uuid, text, uuid, text, boolean, text, integer, integer) to authenticated;
grant execute on function decide_applications(uuid[], text) to authenticated;

select harden_definer_functions();
