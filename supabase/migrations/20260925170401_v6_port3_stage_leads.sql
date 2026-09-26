-- 0210 · PORT3: Stage Leads nur mit Bühnen-Scope, Lücken L1–L7 geschlossen (Variante A)
-- Angewendet von der Architektur-Session am 25.09.2026 als 20260925170401.
--
-- Vorschlag der Build-Session Speaker-Domäne. Nummer, Anwenden, Umbenennen und
-- der Eintrag ins Entscheidungslog gehören der Architektur-Session.
--
-- Anlass: PORT3 (Arbeitsauftrag Welle 6), Variante A (Entscheidungslog 25.09.):
-- keine neue Rolle — `speaker_manager` ist seit #161 (0162) die Rolle der
-- externen Stage Leads, ohne Admin-Zugang. Das Rechte-Review
-- (`docs/rechte-review-speaker-leads-2026-09-25.md`, #231) fand sieben Lücken
-- L1–L7; dieser Vorschlag schließt sie. Entscheidungen F1–F3 (25.09., Pause
-- Teil 2): F1 fremdes, bestehendes Profil → 42501 für Nicht-Team; F2 Stage
-- Leads finden nur Speaker der eigenen Bühne und eigene Einträge; F3 Slot- und
-- Tag-Scope bleiben, `is_stage_lead_of(stage)` meint die ganze Bühne.
--
-- Neu:
--   * `is_stage_lead_of(stage)`: aktive Rolle `speaker_manager` mit Scope `stage`
--     dieser Bühne. `scope_stage_id(scope_type, scope_id)` (intern): die Bühne
--     hinter einem Bühnen-, Tag- oder Slot-Scope.
--   * L5 `upsert_speaker`: Nicht-Team legt nur über die Adresse an (kein
--     `person_id`), und ein bestehendes Profil ohne `can_manage_speaker` bricht
--     mit 42501 ab (keine Existenzauskunft) — vorher überschrieb jeder
--     `speaker_manager` fremde Profile der Edition.
--   * L1 `can_manage_speaker`: kein Edition-Zweig mehr für `speaker_manager`;
--     Bühne über `is_stage_lead_of`; die Session muss zur Edition des Profils
--     gehören.
--   * L2 `can_search_board`: `speaker_manager` nur mit Bühnen-, Tag- oder
--     Slot-Scope im Event (kein global, keine Edition).
--   * L3 `board_search_people`: Nicht-Programm-Editoren finden nur Speaker mit
--     `can_manage_speaker` (eigene Bühne, eigene Einträge); die Moderation zeigt
--     Stage Leads der Edition über ihre Bühnen, nicht über Edition-Zeilen.
--   * L4 `speaker_managers`: die E-Mail nur für das Team.
--   * L6 `my_manager_scope`: Editionen aus Bühnen, Tagen und Slots; „alle“ nur
--     für das Team.
--   * L7 `assign_role`: `speaker_manager` nur mit Bühnen-, Tag- oder Slot-Scope
--     und vorhandener Bühne (22023 `stage_scope_required`), die Edition folgt
--     der Bühne; dazu die CHECK-Regel `role_assignment_stage_lead_scope_chk`
--     als `not valid` — die abgelaufene echte Edition-Zeile bleibt Historie.
--
-- Funktionen aus `supabase/snapshot/functions/`: `upsert_speaker`,
-- `can_manage_speaker`, `can_search_board`, `board_search_people`,
-- `speaker_managers`, `my_manager_scope`, `assign_role`.
-- Neuer Fehlerschlüssel: `stage_scope_required` (22023).

set search_path = public, extensions;

-- ---- 1 · Wer ist Stage Lead welcher Bühne
create or replace function scope_stage_id(p_scope_type text, p_scope_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select case p_scope_type
           when 'stage'     then (select st.id from stage st where st.id = p_scope_id)
           when 'stage_day' then (select sd.stage_id from stage_day sd where sd.id = p_scope_id)
           when 'slot'      then (select sl.stage_id from slot sl where sl.id = p_scope_id)
         end
$$;
revoke execute on function scope_stage_id(text, uuid) from public, anon, authenticated;

create or replace function is_stage_lead_of(p_stage_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  -- Die ganze Bühne (F3): Tag- und Slot-Scope zählen hier nicht — die Wege, die
  -- sie kennen, prüfen sie selbst.
  select coalesce(p_stage_id is not null and exists (
           select 1 from active_roles() ra
            where ra.role = 'speaker_manager' and ra.scope_type = 'stage' and ra.scope_id = p_stage_id), false)
$$;

-- ---- 2 · L5: Anlegen überschreibt keine fremden Profile
create or replace function upsert_speaker(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_actor uuid := current_person_id();
  v_edition uuid := nullif(p_data->>'edition_id', '')::uuid;
  v_pid uuid := nullif(p_data->>'person_id', '')::uuid;
  v_email citext := nullif(btrim(p_data->>'email'), '')::citext;
  v_type text := coalesce(nullif(p_data->>'speaker_type', ''), 'other');
  v_team boolean; v_id uuid; v_existing uuid; v_guest boolean;
begin
  if v_actor is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if v_edition is null or not exists (select 1 from event where id = v_edition and is_edition) then
    raise exception 'edition_required' using errcode = '22023';
  end if;
  v_team := is_speaker_team(v_edition);
  if not (v_team or has_role('speaker_manager')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not v_team and (p_data ?| array['lounge_access', 'pass_type', 'hotel_tier', 'hospitality_status', 'org_id', 'owner_person_id']) then
    raise exception 'team_only_fields' using errcode = '42501';
  end if;
  -- PORT3 / L5: Nicht-Team legt nur über die Adresse an — eine fremde
  -- Person-ID öffnete sonst jedes Profil der Person.
  if not v_team and v_pid is not null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_pid is null then
    if v_email is null then raise exception 'email_or_person_required' using errcode = '22023'; end if;
    if is_suppressed(v_email::text) then raise exception 'suppressed' using errcode = 'P0001'; end if;
    select pe.person_id into v_pid from person_email pe join person p on p.id = pe.person_id
     where pe.email = v_email and p.deleted_at is null limit 1;
    if v_pid is null then
      insert into person (first_name, last_name, title, preferred_language, source_first, tier)
      values (nullif(btrim(p_data->>'first_name'), ''), nullif(btrim(p_data->>'last_name'), ''), nullif(btrim(p_data->>'title'), ''),
              case when p_data->>'preferred_language' in ('de', 'en') then p_data->>'preferred_language' end, 'speaker_leads', 'lead')
      returning id into v_pid;
      insert into person_email (person_id, email, is_primary, verified) values (v_pid, v_email, true, false);
    end if;
  elsif not exists (select 1 from person where id = v_pid and deleted_at is null) then
    raise exception 'person_not_found' using errcode = 'P0002';
  end if;

  select id into v_existing from speaker_profile where person_id = v_pid and edition_id = v_edition;
  -- PORT3 / L5: ein bestehendes Profil, das die Person nicht verwaltet, bleibt
  -- unberührt — vorher überschrieb `on conflict` es für jeden `speaker_manager`.
  -- 42501 ohne Hinweis, ob es die Adresse schon gibt (F1).
  if v_existing is not null and not v_team and not can_manage_speaker(v_existing) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, owner_person_id, job_title, organization_name, org_id,
                               internal_notes, reception_eligible, travel_costs_covered, pass_type, lounge_access, hotel_tier, hospitality_status, created_by)
  values (v_pid, v_edition, v_type, coalesce(nullif(p_data->>'pipeline_status', ''), 'lead'),
          coalesce(nullif(p_data->>'owner_person_id', '')::uuid, v_actor),
          nullif(btrim(p_data->>'job_title'), ''), nullif(btrim(p_data->>'organization_name'), ''), nullif(p_data->>'org_id', '')::uuid,
          nullif(btrim(p_data->>'internal_notes'), ''),
          coalesce((p_data->>'reception_eligible')::boolean, false), coalesce((p_data->>'travel_costs_covered')::boolean, false),
          coalesce(nullif(p_data->>'pass_type', ''), case when v_type = 'masterclass_host' then 'professional' else 'speaker' end),
          coalesce((p_data->>'lounge_access')::boolean, v_type <> 'masterclass_host'),
          coalesce(nullif(p_data->>'hotel_tier', ''), 'standard'),
          coalesce(nullif(p_data->>'hospitality_status', ''), 'none'),
          v_actor)
  on conflict (person_id, edition_id) do update set
    speaker_type         = case when p_data ? 'speaker_type'         then v_type else speaker_profile.speaker_type end,
    pipeline_status      = coalesce(nullif(p_data->>'pipeline_status', ''), speaker_profile.pipeline_status),
    job_title            = case when p_data ? 'job_title'            then nullif(btrim(p_data->>'job_title'), '') else speaker_profile.job_title end,
    organization_name    = case when p_data ? 'organization_name'    then nullif(btrim(p_data->>'organization_name'), '') else speaker_profile.organization_name end,
    internal_notes       = case when p_data ? 'internal_notes'       then nullif(btrim(p_data->>'internal_notes'), '') else speaker_profile.internal_notes end,
    reception_eligible   = coalesce((p_data->>'reception_eligible')::boolean, speaker_profile.reception_eligible),
    travel_costs_covered = coalesce((p_data->>'travel_costs_covered')::boolean, speaker_profile.travel_costs_covered),
    owner_person_id      = coalesce(nullif(p_data->>'owner_person_id', '')::uuid, speaker_profile.owner_person_id),
    org_id               = case when p_data ? 'org_id' then nullif(p_data->>'org_id', '')::uuid else speaker_profile.org_id end,
    pass_type            = coalesce(nullif(p_data->>'pass_type', ''), speaker_profile.pass_type),
    lounge_access        = coalesce((p_data->>'lounge_access')::boolean, speaker_profile.lounge_access),
    hotel_tier           = coalesce(nullif(p_data->>'hotel_tier', ''), speaker_profile.hotel_tier),
    hospitality_status   = coalesce(nullif(p_data->>'hospitality_status', ''), speaker_profile.hospitality_status)
  returning id, stage_guest into v_id, v_guest;

  -- PART-081: ein Gastprofil bekommt keinen Speaker-Zugang (die Leistungen verhindert der CHECK).
  if not v_guest then
    insert into role_assignment (person_id, role, scope_type, edition_id, granted_by, note)
    values (v_pid, 'speaker', 'edition', v_edition, v_actor, 'speaker_profile')
    on conflict (person_id, role, scope_type,
                 coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 coalesce(edition_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 coalesce(portal, ''))
    do update set valid_to = null, granted_by = v_actor;
  end if;

  perform log_audit(case when v_existing is null then 'speaker.create' else 'speaker.update' end, 'speaker_profile', v_id::text, null, (p_data - 'email') || jsonb_build_object('person_id', v_pid));
  return v_id;
end $$;

-- ---- 3 · L1: Speaker verwalten nur auf der eigenen Bühne
create or replace function can_manage_speaker(p_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select exists (
    select 1 from speaker_profile sp
    where sp.id = p_profile_id
      and (
        is_speaker_team(sp.edition_id)
        or (has_role('speaker_manager') and (
              sp.owner_person_id = current_person_id()
              or sp.created_by = current_person_id()
              -- PORT3 / L1: kein Edition-Zweig mehr — Stage Leads verwalten
              -- die Speaker ihrer Bühnen (Sessions der Edition des Profils).
              or exists (
                select 1
                from session_speaker ss
                join session se on se.id = ss.session_id
                join event ev on ev.id = se.event_id and coalesce(ev.edition_id, ev.id) = sp.edition_id
                join slot sl on sl.id = se.slot_id
                left join stage_day sd on sd.stage_id = sl.stage_id and sd.event_day_id = sl.event_day_id
                where ss.person_id = sp.person_id
                  and (is_stage_lead_of(sl.stage_id)
                       or has_role('speaker_manager', 'slot', sl.id)
                       or (sd.id is not null and has_role('speaker_manager', 'stage_day', sd.id)))
              )))
      )
  )
$$;

-- ---- 4 · L2: Suche nur im Event der eigenen Bühne
create or replace function can_search_board(p_event_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(
    is_programme_editor(p_event_id)
    -- PORT3 / L2: Stage Leads suchen nur, wo sie eine Bühne, einen Tag oder
    -- einen Slot im Event haben — nicht mehr global oder für die Edition.
    or exists (
      select 1
        from active_roles() ra
        join stage st on st.id = scope_stage_id(ra.scope_type, ra.scope_id)
       where ra.role = 'speaker_manager'
         and st.event_id = p_event_id),
    false)
$$;

-- ---- 5 · L3: Personensuche im Board
create or replace function board_search_people(p_event_id uuid, p_query text, p_limit integer DEFAULT 10, p_moderation boolean DEFAULT false)
 RETURNS TABLE(id uuid, display_name text, organization text, is_stage_lead boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid; v_q text; v_editor boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not can_search_board(p_event_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_query, ''))) < 2 then return; end if;
  -- PORT3 / L3 (F2): wer nicht das Programm bearbeitet, findet nur Speaker, die
  -- er verwaltet — die eigene Bühne und eigene Einträge.
  v_editor := is_programme_editor(p_event_id);
  select coalesce(ev.edition_id, ev.id) into v_ed from event ev where ev.id = p_event_id;
  v_q := board_like_pattern(p_query);
  return query
    select x.pid, x.name, x.org, x.lead
      from (
        select p.id as pid,
               nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') as name,
               sp.organization_name as org,
               false as lead,
               p.last_name as ln, p.first_name as fn
          from speaker_profile sp
          join person p on p.id = sp.person_id
         where sp.edition_id = v_ed
           and p.deleted_at is null
           and (v_editor or can_manage_speaker(sp.id))
           and (p.first_name ilike v_q or p.last_name ilike v_q
                or (coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) ilike v_q
                or coalesce(sp.organization_name, '') ilike v_q)
        union all
        -- LEAD-042: Stage Leads der Edition, nur für die Moderation und nur,
        -- wer nicht schon als Speaker oben steht.
        select p.id, nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
               null::text, true, p.last_name, p.first_name
          from person p
         where coalesce(p_moderation, false)
           and p.deleted_at is null
           and not exists (select 1 from speaker_profile sp2 where sp2.person_id = p.id and sp2.edition_id = v_ed)
           -- PORT3: Stage Leads der Edition über ihre Bühnen, Tage oder Slots —
           -- eine Edition-Zeile (Altbestand) macht niemanden mehr zum Stage Lead.
           and exists (
             select 1 from role_assignment ra
              join stage st on st.id = scope_stage_id(ra.scope_type, ra.scope_id)
              join event ev on ev.id = st.event_id
              where ra.person_id = p.id
                and ra.role = 'speaker_manager'
                and ra.valid_from <= now()
                and (ra.valid_to is null or ra.valid_to > now())
                and (ev.id = v_ed or ev.edition_id = v_ed))
           and (p.first_name ilike v_q or p.last_name ilike v_q
                or (coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) ilike v_q)
      ) x
     order by x.ln nulls last, x.fn nulls last
     limit least(greatest(coalesce(p_limit, 10), 1), 25);
end $$;

-- ---- 6 · L4: Adressen der Leads nur für das Team
create or replace function speaker_managers()
 RETURNS TABLE(person_id uuid, display_name text, email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not (has_role('admin') or has_role('area_lead_speaker') or has_role('programme_team')
          or has_role('speaker_manager')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select p.id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           -- PORT3 / L4: die Adresse nur für das Team — die Übergabe braucht den Namen.
           case when has_role('admin') or has_role('area_lead_speaker') or has_role('programme_team')
                then (select pe.email::text from person_email pe where pe.person_id = p.id and pe.is_primary) end
      from person p
     where p.deleted_at is null and is_speaker_manager(p.id)
     order by 2 nulls last;
end $$;

-- ---- 7 · L6: der Scope im Portal
create or replace function my_manager_scope()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_team boolean; v_any boolean;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_team   := is_speaker_team(null);
  -- PORT3 / L6: `speaker_manager` gilt nur noch für Bühnen, Tage und Slots —
  -- Edition- und globale Zeilen (Altbestand) geben weder „alle“ noch Editionen.
  v_any    := exists (select 1 from role_assignment ra where ra.person_id = v_me and ra.role = 'speaker_manager'
                      and ra.scope_type in ('stage', 'stage_day', 'slot')
                      and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now()));
  return jsonb_build_object(
    'person_id', v_me,
    'team', v_team,
    'all', v_team,
    'is_manager', v_team or v_any,
    -- Die Editionen folgen den Bühnen — für „Speaker anlegen“ und die Board-Vorauswahl.
    'editions', coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from (
        select distinct e.id, e.name, e.slug
          from role_assignment ra
          join stage st on st.id = scope_stage_id(ra.scope_type, ra.scope_id)
          join event ev on ev.id = st.event_id
          join event e on e.id = coalesce(ev.edition_id, ev.id)
        where ra.person_id = v_me and ra.role = 'speaker_manager'
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

-- ---- 8 · L7: Vergabe nur für Bühnen, Tage und Slots
create or replace function assign_role(p_person_id uuid, p_role text, p_scope_type text, p_scope_id uuid DEFAULT NULL::uuid, p_edition_id uuid DEFAULT NULL::uuid, p_portal text DEFAULT NULL::text, p_valid_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_valid_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid; v_actor uuid := current_person_id(); v_edition uuid := p_edition_id;
begin
  if not has_role('admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from vocab_term where vocabulary = 'role' and key = p_role and active) then
    raise exception 'invalid_role' using errcode = '22023', detail = p_role;
  end if;
  if not exists (select 1 from person where id = p_person_id and deleted_at is null) then
    raise exception 'person_not_found' using errcode = 'P0002';
  end if;
  -- PORT3 / L7: `speaker_manager` sind die externen Stage Leads — nur für eine
  -- Bühne, einen Tag einer Bühne oder einen Slot, nie für die Edition oder global.
  -- Die Edition folgt der Bühne.
  if p_role = 'speaker_manager' then
    if coalesce(p_scope_type, '') not in ('stage', 'stage_day', 'slot')
       or scope_stage_id(p_scope_type, p_scope_id) is null then
      raise exception 'stage_scope_required' using errcode = '22023', detail = coalesce(p_scope_type, 'null');
    end if;
    select coalesce(ev.edition_id, ev.id) into v_edition
      from stage st join event ev on ev.id = st.event_id
     where st.id = scope_stage_id(p_scope_type, p_scope_id);
  end if;
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, portal, valid_from, valid_to, granted_by, note)
  values (p_person_id, p_role, p_scope_type, p_scope_id, v_edition, p_portal,
          coalesce(p_valid_from, now()), p_valid_to, v_actor, p_note)
  on conflict (person_id, role, scope_type,
               coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(edition_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(portal, ''))
  do update set valid_from = coalesce(p_valid_from, now()), valid_to = p_valid_to,
                granted_by = v_actor, note = coalesce(p_note, role_assignment.note)
  returning id into v_id;
  perform log_audit('role.assign', 'role_assignment', v_id::text, null,
    jsonb_build_object('person_id', p_person_id, 'role', p_role, 'scope_type', p_scope_type,
                       'scope_id', p_scope_id, 'edition_id', v_edition, 'portal', p_portal,
                       'valid_from', coalesce(p_valid_from, now()), 'valid_to', p_valid_to));
  return v_id;
end $$;

-- Die Regel auch für direkte Schreibwege. `not valid`: die abgelaufene echte
-- Edition-Zeile bleibt als Historie stehen (nie löschen).
alter table role_assignment
  add constraint role_assignment_stage_lead_scope_chk
  check (role <> 'speaker_manager' or scope_type in ('stage', 'stage_day', 'slot')) not valid;

select harden_definer_functions();
