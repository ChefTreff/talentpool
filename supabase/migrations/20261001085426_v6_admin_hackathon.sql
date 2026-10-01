-- 0229 · Admin-Abschnitt Hackathon für area_lead_hackathon und hackathon_team, is_hack_team ohne Admin-Sonderweg (ADM-055)
-- Angewendet von der Architektur-Session am 01.10.2026 als 20261001085426.
--
-- Anlass: ADM-055 (Befund beim Rollenmodell ADM-053, Konrad 25.09.: „passt, so bauen“;
-- Runde 01.10. an den Talent-Chat). Der Hackathon hatte keinen Admin-Abschnitt — Challenges
-- freigeben, Teams verteilen und Bewerbungen entscheiden ging nur in der Teilnehmer-App
-- (`/hackathon/teams`). Verstoß gegen „Admin-Vollständigkeit“ und „Admin zuerst“.
--
-- 1. `admin_section_role`: Abschnitt `hackathon` für admin, area_lead_hackathon,
--    hackathon_team (Spiegel von lib/admin-sections.ts, Test hält beide gleich).
-- 2. **`is_hack_team()` fragt den Abschnitt** (`has_admin_section('hackathon')`) statt
--    `admin`/`area_lead_hackathon` abzuschreiben. Befund: die Rolle `hackathon_team` (0162)
--    stand in keiner Hackathon-Funktion — sie hätte die Admin-Seite geöffnet, aber jede
--    Aktion mit 42501 abgewiesen. Mit dem Abschnitt gelten auch Ausnahmen aus der
--    Verwaltung (`admin_section_override`). Basis: Snapshot; alle sieben Funktionen, die
--    `is_hack_team()` rufen, bleiben unverändert und erben die Regel.
-- 3. `hack_applications_admin(p_edition_id)` — Bewerbungen für die Auswahl: Name, Status,
--    Skills, Motivation, Team-Wunsch, Portfolio-Links (HACK-007), Team, Zeitpunkte. **Keine
--    E-Mail** — Kontakt über die Personenansicht (Verwaltung).
--    **Setzt `v6_hack_portfolio` (#270) voraus** (Spalten github_url/website_url/behance_url).
-- 4. `hack_open_challenges(p_edition_id)` — eingereichte, noch nicht freigegebene
--    Challenge-Formulare; bisher las die Seite `deliverable` direkt, was für das
--    Hackathon-Team an der RLS gescheitert wäre.
--
-- Fehlerschlüssel: 42501. Test: supabase/tests/v6_admin_hackathon.sql
set search_path = public, extensions;

insert into admin_section_role (section, role) values
  ('hackathon', 'admin'),
  ('hackathon', 'area_lead_hackathon'),
  ('hackathon', 'hackathon_team')
on conflict do nothing;

create or replace function is_hack_team()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  -- Vorher: has_role('admin') or has_role('area_lead_hackathon') — ohne hackathon_team.
  select coalesce(has_admin_section('hackathon'), false)
$$;

create or replace function hack_applications_admin(p_edition_id uuid default null)
returns table (application_id uuid, person_id uuid, first_name text, last_name text, status text,
               skills text[], motivation text, team_pref text, github_url text, website_url text,
               behance_url text, team_name text, applied_at timestamptz, decided_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid := hack_edition(p_edition_id);
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select a.id, p.id, p.first_name, p.last_name, a.status, a.skills, a.motivation, a.team_pref,
           a.github_url, a.website_url, a.behance_url, t.name, a.applied_at, a.decided_at
      from hack_application a
      join person p on p.id = a.person_id
      left join hack_team_member m on m.person_id = a.person_id
      left join hack_team t on t.id = m.team_id and t.edition_id = a.edition_id
     where a.edition_id = v_ed and p.deleted_at is null
     order by case a.status when 'applied' then 0 when 'accepted' then 1 else 2 end, a.applied_at;
end $$;

create or replace function hack_open_challenges(p_edition_id uuid default null)
returns table (deliverable_id uuid, org_name text, title text, submitted_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid := hack_edition(p_edition_id);
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select d.id, coalesce(o.communication_name, o.legal_name),
           coalesce(nullif(d.answers->>'title_en', ''), nullif(d.answers->>'title_de', '')),
           d.submitted_at
      from deliverable d
      join deliverable_template tp on tp.id = d.template_id and tp.key = 'hackathon_challenge'
      join org_edition oe on oe.id = d.org_edition_id and oe.edition_id = v_ed
      join organization o on o.id = oe.org_id
     where d.status = 'submitted'
     order by d.submitted_at nulls last;
end $$;

select harden_definer_functions();
