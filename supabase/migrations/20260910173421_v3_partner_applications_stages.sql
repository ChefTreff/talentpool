-- 0047 · Welle 3 A7/A8: Bewerber-Auswahl für Partner-Formate (Masterclass, Company Tour = Session mit host_org_id) und Standbühne.
-- can_decide_session verlangt für die Host-Org eine aktive Rolle partner_contact mit primary_ops/additional/signing (Mitgliedschaft allein reicht nicht,
-- event_app_member sieht keine Bewerber). partner_sessions(org) liefert Sessions mit Zählern (keine Personendaten), partner_applications(session) die
-- Bewerberdaten mit demselben Consent-Filter wie applications_for_session und schreibt jeden Abruf ins Audit (Masterplan §4). Entscheidung weiter über
-- decide_application, Versand nur über release_decisions (Team). my_partner_stages(): Bühnen mit stage.partner_org_id für Bühnen-Editoren.
set search_path = public, extensions;

create or replace function can_decide_session(p_session_id uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1
    from session se
    join event ev on ev.id = se.event_id
    where se.id = p_session_id
      and (
           has_role('admin')
        or has_role('programme_team', 'edition', null, ev.edition_id)
        or has_role('programme_team', 'edition', null, ev.id)
        or has_role('area_lead_talent')
        or (se.host_org_id is not null and partner_roles(se.host_org_id) && '{primary_ops,additional,signing}'::text[])
      )
  )
$$;

create or replace function partner_sessions(p_org_id uuid)
returns table (id uuid, event_id uuid, event_slug text, title_de text, title_en text, format text, access_mode text, publish_status text, capacity integer,
               application_deadline timestamptz, start_at timestamptz, end_at timestamptz, stage_name text, released boolean, counts jsonb)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select se.id, se.event_id, ev.slug, se.title_de, se.title_en, se.format, se.access_mode, se.publish_status, se.capacity, se.application_deadline,
           sl.start_at, sl.end_at, st.name, decisions_released(se.id),
           (select jsonb_build_object(
              'total', count(*),
              'applied', count(*) filter (where a.status = 'applied'),
              'shortlisted', count(*) filter (where a.status = 'shortlisted'),
              'accepted', count(*) filter (where a.status in ('accepted', 'promoted')),
              'waitlisted', count(*) filter (where a.status = 'waitlisted'),
              'confirmed', count(*) filter (where a.status = 'confirmed'),
              'declined', count(*) filter (where a.status = 'declined'))
            from application a where a.session_id = se.id)
    from session se
    join event ev on ev.id = se.event_id
    left join slot sl on sl.id = se.slot_id
    left join stage st on st.id = sl.stage_id
    where se.host_org_id = p_org_id
    order by sl.start_at nulls last, se.created_at;
end $$;

-- Jeder Abruf von Bewerberdaten durch Partner wird protokolliert; deshalb VOLATILE (Audit-Insert) statt STABLE.
create or replace function partner_applications(p_session_id uuid)
returns table (id uuid, person_id uuid, display_name text, status text, rank integer, answers jsonb, consent_share boolean, confirm_by timestamptz,
               confirmed_at timestamptz, decided_at timestamptz, created_at timestamptz, profile jsonb)
language plpgsql security definer set search_path = public, extensions as $$
declare v_org uuid; v_n integer;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not can_decide_session(p_session_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  select se.host_org_id into v_org from session se where se.id = p_session_id;
  select count(*) into v_n from application a where a.session_id = p_session_id;
  perform log_audit('application.partner_view', 'session', p_session_id::text, null,
                    jsonb_build_object('org_id', v_org, 'rows', v_n, 'team', is_application_team(p_session_id)));
  return query select * from applications_for_session(p_session_id);
end $$;

create or replace function my_partner_stages()
returns table (stage_id uuid, stage_name text, stage_slug text, event_id uuid, event_slug text, event_name text, edition_id uuid, org_id uuid, org_name text)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select distinct st.id, st.name, st.slug, ev.id, ev.slug, ev.name, coalesce(ev.edition_id, ev.id), st.partner_org_id, coalesce(o.communication_name, o.legal_name)
    from stage st
    join event ev on ev.id = st.event_id
    left join organization o on o.id = st.partner_org_id
    join active_roles() ra on ra.role = 'standbuehne_editor'
      and ((ra.scope_type = 'org' and st.partner_org_id is not null and ra.scope_id = st.partner_org_id)
           or (ra.scope_type = 'stage' and ra.scope_id = st.id))
    where st.active
    order by ev.slug, st.name;
end $$;

select harden_definer_functions();
