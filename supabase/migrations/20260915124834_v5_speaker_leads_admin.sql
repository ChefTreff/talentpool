-- =============================================================================
-- 0104 · Welle 5 · Speaker-Leads als Personen verwalten
--     angewendet am 15.09.2026 als 20260915124834
--
-- Setzt 0103 voraus (`is_speaker_manager`, `handover_speaker`).
--
-- Konrad: im Admin-Bereich werden „Slots, Speaker, Hospitality und Speaker
-- Leads (Personen)" verwaltet. Für die ersten drei gibt es Seiten, für die
-- Leads bisher nur die allgemeine Rollenverwaltung — dort steht `speaker_manager`
-- zwischen dreissig anderen Rollen, und man sieht nicht, **wen** diese Person
-- eigentlich betreut. Genau das ist aber die Frage, die man an dieser Stelle hat:
-- wer ist Lead, wie viele Speaker hängen an ihr, und wer hat noch niemanden.
--
-- `speaker_leads_admin()` beantwortet das in einer Abfrage: je Person ihre
-- aktiven Speaker-Rollen (mit Zuweisungs-ID, damit man sie von hier entziehen
-- kann), die Zahl der betreuten Speaker, wie viele davon zugesagt haben und
-- wie viele offene Schritte insgesamt bei ihr liegen.
--
-- Die offenen Schritte sind bewusst dabei: eine Lead-Person mit zwei Speakern
-- und vierzehn offenen Schritten braucht Hilfe, eine mit zwölf Speakern und
-- keinem offenen Schritt nicht. Die reine Anzahl sagt das nicht.
--
-- `unassigned_speakers()` ist die Gegenliste: wer betreut **niemanden**. Ohne
-- sie müsste man die Speaker-Liste nach „ohne Betreuung" filtern und von dort
-- einzeln ins Detail springen; zugeordnet wird aber am Stück.
--
-- Dazu eine Zeile am Lead-Portal: `my_manager_scope()` nennt jetzt auch die
-- eigene Personen-ID, damit die Übergabe dort nur angeboten wird, wo sie
-- erlaubt ist (0103: weiterreichen darf nur, wer heute selbst betreut).
--
-- Fehlerschlüssel: 42501 ohne Recht.
--
-- Test: supabase/tests/v5_speaker_leads_admin.sql
-- =============================================================================
set search_path = public, extensions;

/** Zugriff auf die Lead-Verwaltung: Admin, Program Lead, Programm-Team. */
create or replace function can_manage_speaker_leads() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select has_role('admin') or has_role('area_lead_speaker') or has_role('programme_team')
$$;

/**
 * Alle Speaker-Leads mit ihrer Last.
 *
 * `assignments` nennt jede aktive Rolle mit ihrer ID — das ist der Griff zum
 * Entziehen. Ohne die ID müsste die Oberfläche die Rolle über Person + Scope
 * suchen und würde bei zwei gleichartigen Zuweisungen die falsche treffen.
 */
create or replace function speaker_leads_admin(p_edition_id uuid default null)
returns table (
  person_id uuid, display_name text, email text,
  assignments jsonb, speakers integer, confirmed integer, declined integer, open_steps integer
)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid;
begin
  if not can_manage_speaker_leads() then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;
  return query
    select p.id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           (select pe.email::text from person_email pe where pe.person_id = p.id and pe.is_primary),
           coalesce((select jsonb_agg(jsonb_build_object(
                              'id', ra.id, 'role', ra.role, 'scope_type', ra.scope_type,
                              'scope_id', ra.scope_id, 'edition_id', ra.edition_id,
                              'valid_to', ra.valid_to)
                            order by ra.role, ra.scope_type)
                     from role_assignment ra
                    where ra.person_id = p.id
                      and ra.role in ('speaker_manager', 'area_lead_speaker')
                      and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())), '[]'::jsonb),
           (select count(*)::integer from speaker_profile sp
             where sp.owner_person_id = p.id and sp.edition_id = v_ed),
           (select count(*)::integer from speaker_profile sp
             where sp.owner_person_id = p.id and sp.edition_id = v_ed
               and sp.confirmed_at is not null and sp.declined_at is null),
           (select count(*)::integer from speaker_profile sp
             where sp.owner_person_id = p.id and sp.edition_id = v_ed and sp.declined_at is not null),
           coalesce((select sum(jsonb_array_length(speaker_next_steps(sp.id)->'open'))::integer
                       from speaker_profile sp
                      where sp.owner_person_id = p.id and sp.edition_id = v_ed), 0)
      from person p
     where p.deleted_at is null and is_speaker_manager(p.id)
     order by 2 nulls last;
end $$;

/**
 * Speaker ohne Betreuung.
 *
 * Absagen bleiben draussen: wer abgesagt hat, braucht keine Betreuung mehr,
 * und die Liste soll die sein, an der man wirklich arbeitet.
 */
create or replace function unassigned_speakers(p_edition_id uuid default null)
returns table (
  profile_id uuid, display_name text, job_title text, organization_name text,
  speaker_type text, pipeline_status text, created_at timestamptz
)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid;
begin
  if not can_manage_speaker_leads() then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;
  return query
    select sp.id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           sp.job_title, sp.organization_name, sp.speaker_type, sp.pipeline_status, sp.created_at
      from speaker_profile sp
      join person p on p.id = sp.person_id
     where sp.edition_id = v_ed
       and sp.owner_person_id is null
       and sp.declined_at is null
       and p.deleted_at is null
     order by sp.created_at;
end $$;

-- ---------------------------------------------------------------- Lead-Portal

/**
 * `my_manager_scope` nennt zusätzlich die eigene Personen-ID.
 *
 * Das Lead-Portal soll die Übergabe nur dort anbieten, wo sie auch erlaubt ist
 * — also wenn die aufrufende Person heute selbst betreut. Dafür muss sie
 * wissen, wer sie ist. Ohne diese Zeile bliebe der Oberfläche nur, den Knopf
 * allen zu zeigen und die RPC ablehnen zu lassen; ein Knopf, der bei der
 * Hälfte der Zeilen in einen Fehler führt, ist kein Angebot.
 *
 * Nur ein zusätzlicher Schlüssel; alles Bisherige bleibt unverändert stehen.
 */
create or replace function my_manager_scope() returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_team boolean; v_global boolean; v_any boolean;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_team   := is_speaker_team(null);
  v_global := exists (select 1 from role_assignment ra where ra.person_id = v_me and ra.role = 'speaker_manager' and ra.scope_type = 'global'
                      and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now()));
  v_any    := exists (select 1 from role_assignment ra where ra.person_id = v_me and ra.role = 'speaker_manager'
                      and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now()));
  return jsonb_build_object(
    'person_id', v_me,
    'team', v_team,
    'all', v_team or v_global,
    'is_manager', v_team or v_any,
    'editions', coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from (
        select distinct e.id, e.name, e.slug from role_assignment ra join event e on e.id = ra.edition_id
        where ra.person_id = v_me and ra.role = 'speaker_manager' and ra.scope_type = 'edition'
          and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())) x), '[]'::jsonb),
    'stages', coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from (
        select distinct st.id, st.name, st.event_id, coalesce(e.edition_id, e.id) as edition_id
        from role_assignment ra join stage st on st.id = ra.scope_id join event e on e.id = st.event_id
        where ra.person_id = v_me and ra.role = 'speaker_manager' and ra.scope_type = 'stage'
          and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())) x), '[]'::jsonb),
    'stage_days', coalesce((select jsonb_agg(to_jsonb(x) order by x.day_date, x.stage_name) from (
        select distinct sd.id, sd.stage_id, st.name as stage_name, sd.event_day_id, ed.day_date, coalesce(e.edition_id, e.id) as edition_id
        from role_assignment ra join stage_day sd on sd.id = ra.scope_id join stage st on st.id = sd.stage_id
        join event_day ed on ed.id = sd.event_day_id join event e on e.id = st.event_id
        where ra.person_id = v_me and ra.role = 'speaker_manager' and ra.scope_type = 'stage_day'
          and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())) x), '[]'::jsonb),
    'slots', coalesce((select jsonb_agg(to_jsonb(x) order by x.start_at) from (
        select distinct sl.id, sl.stage_id, st.name as stage_name, sl.start_at, sl.end_at, se.id as session_id, coalesce(e.edition_id, e.id) as edition_id
        from role_assignment ra join slot sl on sl.id = ra.scope_id join stage st on st.id = sl.stage_id join event e on e.id = st.event_id
        left join session se on se.slot_id = sl.id
        where ra.person_id = v_me and ra.role = 'speaker_manager' and ra.scope_type = 'slot'
          and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())) x), '[]'::jsonb),
    'owned_profiles', (select count(*) from speaker_profile sp where sp.owner_person_id = v_me or sp.created_by = v_me)
  );
end $$;

select harden_definer_functions();
