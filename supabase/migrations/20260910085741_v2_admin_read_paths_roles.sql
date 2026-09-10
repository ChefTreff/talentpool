-- =============================================================================
-- 0022 · v2 Admin-Lesewege für B6: Bewerbungs-Queue, Rollenverwaltung, Personensuche
-- Entscheider sehen die Bewerbungen ihrer Sessions, Admins lesen, vergeben und
-- entziehen Rollen, das Team sucht Personen — alles per RPC mit Prüfung im
-- Backend, kein service_role im Frontend mehr.
-- Regeln: Gastgeber (host_org, nicht Team) sehen Name, Profil und Antworten nur
-- bei consent_share · Rollen-Entzug ist ein Ablaufdatum (Historie bleibt) · der
-- letzte aktive globale Admin lässt sich nicht entziehen · Audit unter dem Actor
-- der Session (log_audit) · E-Mail-Adressen in der Suche nur für Admins.
-- =============================================================================
set search_path = public, extensions;

-- Team im Sinne der Bewerbungsentscheidung (Gastgeber-Org zählt nicht dazu)
create or replace function is_application_team(p_session_id uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from session se join event ev on ev.id = se.event_id
    where se.id = p_session_id
      and (has_role('admin')
           or has_role('programme_team', 'edition', null, ev.edition_id)
           or has_role('programme_team', 'edition', null, ev.id)
           or has_role('area_lead_talent'))
  )
$$;

-- === Bewerbungs-Queue je Session =============================================
create or replace function applications_for_session(p_session_id uuid)
returns table (
  id uuid, person_id uuid, display_name text, status text, rank integer, answers jsonb,
  consent_share boolean, confirm_by timestamptz, confirmed_at timestamptz, decided_at timestamptz,
  created_at timestamptz, profile jsonb
)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_team boolean;
begin
  if not can_decide_session(p_session_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_team := is_application_team(p_session_id);
  return query
    select a.id, a.person_id,
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

-- Überblick: Sessions mit Bewerbung, die der Aufrufer entscheiden darf, mit Zählern je Status
create or replace function applications_overview(p_event_id uuid default null)
returns table (
  session_id uuid, event_id uuid, title_de text, title_en text, start_at timestamptz, end_at timestamptz,
  stage_name text, capacity integer, publish_status text, application_deadline timestamptz,
  released boolean, counts jsonb
)
language sql stable security definer set search_path = public, extensions as $$
  select se.id, se.event_id, se.title_de, se.title_en, sl.start_at, sl.end_at, st.name, se.capacity,
         se.publish_status, se.application_deadline,
         exists (select 1 from decision_release d where d.session_id = se.id),
         coalesce((select jsonb_object_agg(x.status, x.n)
                   from (select a.status, count(*) as n from application a where a.session_id = se.id group by a.status) x),
                  '{}'::jsonb)
  from session se
  left join slot sl on sl.id = se.slot_id
  left join stage st on st.id = sl.stage_id
  where se.access_mode = 'application'
    and (p_event_id is null or se.event_id = p_event_id)
    and can_decide_session(se.id)
  order by sl.start_at nulls last, se.title_de
$$;

-- === Rollen ==================================================================
create or replace function roles_of_person(p_person_id uuid)
returns table (
  id uuid, role text, scope_type text, scope_id uuid, edition_id uuid, portal text, scope_label text,
  valid_from timestamptz, valid_to timestamptz, active boolean, note text, granted_by uuid, created_at timestamptz
)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not has_role('admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select ra.id, ra.role, ra.scope_type, ra.scope_id, ra.edition_id, ra.portal,
           case ra.scope_type
             when 'edition'   then (select e.name from event e where e.id = ra.edition_id)
             when 'portal'    then ra.portal
             when 'org'       then (select o.name from organization o where o.id = ra.scope_id)
             when 'stage'     then (select s.name from stage s where s.id = ra.scope_id)
             when 'stage_day' then (select s.name || ' · ' || d.day_date::text
                                    from stage_day sd join stage s on s.id = sd.stage_id join event_day d on d.id = sd.event_day_id
                                    where sd.id = ra.scope_id)
             when 'slot'      then (select s.name || ' · ' || to_char(sl.start_at at time zone 'Europe/Berlin', 'DD.MM. HH24:MI')
                                    from slot sl join stage s on s.id = sl.stage_id where sl.id = ra.scope_id)
             else null end,
           ra.valid_from, ra.valid_to,
           (ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())),
           ra.note, ra.granted_by, ra.created_at
    from role_assignment ra
    where ra.person_id = p_person_id
    order by (ra.valid_to is null or ra.valid_to > now()) desc, ra.role, ra.created_at;
end $$;

-- Rolle vergeben (idempotent: gleiche Rolle im gleichen Scope wird reaktiviert/verlängert)
create or replace function assign_role(
  p_person_id uuid, p_role text, p_scope_type text,
  p_scope_id uuid default null, p_edition_id uuid default null, p_portal text default null,
  p_valid_from timestamptz default null, p_valid_to timestamptz default null, p_note text default null
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_actor uuid := current_person_id();
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
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, portal, valid_from, valid_to, granted_by, note)
  values (p_person_id, p_role, p_scope_type, p_scope_id, p_edition_id, p_portal,
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
                       'scope_id', p_scope_id, 'edition_id', p_edition_id, 'portal', p_portal,
                       'valid_from', coalesce(p_valid_from, now()), 'valid_to', p_valid_to));
  return v_id;
end $$;

-- Rolle entziehen = Ablaufdatum setzen (Historie bleibt). Letzter aktiver globaler Admin ist geschützt.
create or replace function revoke_role(p_assignment_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_ra role_assignment%rowtype;
begin
  if not has_role('admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_ra from role_assignment where id = p_assignment_id for update;
  if not found then
    raise exception 'assignment_not_found' using errcode = 'P0002';
  end if;
  if v_ra.role = 'admin' and v_ra.scope_type = 'global' and not exists (
       select 1 from role_assignment r
       where r.role = 'admin' and r.scope_type = 'global' and r.id <> v_ra.id
         and r.valid_from <= now() and (r.valid_to is null or r.valid_to > now())) then
    raise exception 'last_admin' using errcode = 'P0001';
  end if;
  update role_assignment
     set valid_to = greatest(now(), valid_from + interval '1 second'), note = coalesce(p_note, note)
   where id = p_assignment_id and (valid_to is null or valid_to > now());
  perform log_audit('role.revoke', 'role_assignment', p_assignment_id::text,
    jsonb_build_object('person_id', v_ra.person_id, 'role', v_ra.role, 'scope_type', v_ra.scope_type, 'scope_id', v_ra.scope_id),
    jsonb_build_object('valid_to', now()));
end $$;

-- === Personensuche (Team; E-Mail nur für Admins) ==============================
create or replace function search_people(p_query text, p_limit integer default 10)
returns table (id uuid, display_name text, email text, tier text, city text)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_q text; v_admin boolean;
begin
  if not is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_q := btrim(coalesce(p_query, ''));
  if length(v_q) < 2 then return; end if;
  v_q := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_admin := has_role('admin');
  return query
    select p.id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           case when v_admin then (select pe.email::text from person_email pe where pe.person_id = p.id and pe.is_primary) end,
           p.tier, p.city
    from person p
    where p.deleted_at is null
      and (p.first_name ilike v_q or p.last_name ilike v_q
           or (coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) ilike v_q
           or (v_admin and exists (select 1 from person_email pe where pe.person_id = p.id and pe.email::text ilike v_q)))
    order by p.last_name nulls last, p.first_name nulls last
    limit least(greatest(coalesce(p_limit, 10), 1), 25);
end $$;

select harden_definer_functions();
