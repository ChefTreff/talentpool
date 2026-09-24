-- 00NN · Admin-Sicht „Community-Events" (TAL-008, D12 Hybrid).
--
-- Anlass: TAL-008 (Konrad 24.09.2026) — Sektion „Community-Events" im Admin; bei Luma-Hybrid
-- „Zuordnung und Sicht statt Pflege": Events werden in Luma gepflegt, das Portal zeigt, wer aus
-- dem Talent-Pool angemeldet ist und teilgenommen hat. Setzt `v6_luma_events` voraus (#175:
-- `event` mit `format_tag = community`, `external_ref` system `luma`, `registration` mit
-- `source = luma`); hängt nur lesend daran.
--
-- Rechte: `can_view_community_events()` = admin, area_lead_talent, talent_team (Rollenmodell 0162),
-- marketing_team — dieselbe
-- Liste wie der Admin-Abschnitt `communityEvents` in `lib/admin-sections.ts`. Herausgegeben
-- werden Name und Status, **keine E-Mail**: der Weg zu Kontaktdaten führt über die
-- Personenansicht, die nur `admin` öffnet.
--
-- Fehlerschlüssel: 28000, 42501. Test: supabase/tests/v6_community_events_admin.sql
set search_path = public, extensions;

create or replace function can_view_community_events()
returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(has_role('admin') or has_role('area_lead_talent') or has_role('talent_team')
                  or has_role('marketing_team'), false)
$$;

/** Alle Community-Events aus Luma mit Zählern je Status, neueste zuerst. */
create or replace function community_events_admin()
returns table (event_id uuid, luma_event_id text, name text, start_date date, location text, url text,
               registered integer, pending integer, waitlisted integer, attended integer, total integer)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not can_view_community_events() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select e.id, r.external_id, e.name, e.start_date, e.location, r.meta->>'url',
           count(g.id) filter (where g.status = 'confirmed')::int,
           count(g.id) filter (where g.status = 'applied')::int,
           count(g.id) filter (where g.status = 'waitlisted')::int,
           count(g.id) filter (where g.status = 'attended')::int,
           count(g.id)::int
      from event e
      join external_ref r on r.system = 'luma' and r.object_type = 'event' and r.object_id = e.id
      left join registration g on g.event_id = e.id and g.source = 'luma'
     where e.format_tag = 'community'
     group by e.id, r.external_id, r.meta
     order by e.start_date desc nulls last, e.name;
end $$;

/** Die Teilnehmenden eines Community-Events: Name und Status, keine Kontaktdaten. */
create or replace function community_event_guests_admin(p_event_id uuid)
returns table (person_id uuid, first_name text, last_name text, status text, registered_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not can_view_community_events() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select p.id, p.first_name, p.last_name, g.status, g.registered_at
      from registration g join person p on p.id = g.person_id
     where g.event_id = p_event_id and g.source = 'luma' and p.deleted_at is null
     order by g.status, p.last_name nulls last, p.first_name;
end $$;

select harden_definer_functions();
