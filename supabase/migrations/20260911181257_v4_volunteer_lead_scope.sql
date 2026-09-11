-- 0070 · Volunteer-Leads sehen keine Bewerbungen (Entscheidung Konrad, 11.09.2026, zu PR #22).
-- Ein `volunteer_lead` ist Bereichsleitung vor Ort: er sieht die **bestätigten** Volunteers seiner eigenen Schichten,
-- nachdem das Team die Schichten verteilt hat — nicht die Bewerbungen, nicht Mailadressen, nicht Geburtsdaten.
-- Deshalb zwei Dinge: `is_volunteer_team()` umfasst nur noch Admin und `area_lead_volunteers` (damit greifen
-- `volunteer_admin_overview`, `shift_plan`, `set_volunteer_status`, `upsert_shift`, `assign_shift` und `unassign_shift`
-- für Leads nicht mehr), und `my_lead_shifts()` gibt ihnen genau das, was sie brauchen.
-- Abweichungen: der Arbeitsauftrag nannte `is_volunteer_team()` = admin oder volunteer_lead; Konrads Entscheidung engt das ein.
set search_path = public, extensions;

/** Volunteer-Team: Admin und Bereichsleitung Volunteers. Schichtleads gehören nicht dazu. */
create or replace function is_volunteer_team() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select has_role('admin') or has_role('area_lead_volunteers')
$$;

/**
 * Die eigenen Schichten einer Leitung mit den Menschen darauf.
 *
 * Sichtbar ist nur, wer **zugeteilt oder bestätigt** ist — die Warteliste und
 * Absagen gehen die Leitung nichts an, solange das Team nicht nachgerückt hat.
 * Ausgegeben werden Name und Stand, sonst nichts: keine Mailadresse, kein
 * Geburtsdatum, keine Wünsche aus der Bewerbung.
 */
create or replace function my_lead_shifts(p_edition_id uuid default null)
returns table (id uuid, event_day_id uuid, area text, "position" text, start_at timestamptz, end_at timestamptz,
               location text, briefing_md text, capacity integer, overbook integer, taken integer, people jsonb)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_ed uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := volunteer_edition(p_edition_id);
  return query
    select s.id, s.event_day_id, s.area, s.position, s.start_at, s.end_at, s.location, s.briefing_md,
           s.capacity, s.overbook, shift_taken(s.id),
           coalesce((select jsonb_agg(jsonb_build_object('name', trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
                                                          'status', a.status) order by a.created_at)
                       from shift_assignment a join person p on p.id = a.person_id
                      where a.shift_id = s.id and a.status in ('assigned', 'confirmed')), '[]'::jsonb)
      from shift s
     where s.edition_id = v_ed and s.active and s.lead_person_id = v_me
     order by s.start_at;
end $$;

select harden_definer_functions();
