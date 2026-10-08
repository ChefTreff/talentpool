create or replace function hack_event_info(p_edition_id uuid DEFAULT NULL::uuid, p_language text DEFAULT 'en'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid; e event; c edition_contact; v_acc integer; v_teams integer; v_de boolean := coalesce(p_language, 'en') = 'de';
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := hack_edition(p_edition_id);
  -- Dasselbe Gate wie das Portal (requireArea hackathon): Teilnehmende, Partner, Bereichsleitung, Hack-Team.
  -- Der Kontakt gehört in die bestehende Beziehung, nie in eine Liste für alle Angemeldeten.
  if not (has_role('hackathon_participant') or has_role('hackathon_partner') or has_role('area_lead_hackathon') or is_hack_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into e from event x where x.format_tag = 'hackathon' and x.edition_id = v_ed limit 1;
  if e.id is null then return null; end if;
  select * into c from edition_contact k where k.edition_id = v_ed and k.type = 'hackathon_lead'
   order by k.is_default desc, k.sort_order, k.created_at limit 1;
  select count(*)::integer into v_acc from hack_application a where a.edition_id = v_ed and a.status = 'accepted';
  select count(*)::integer into v_teams from hack_team t where t.edition_id = v_ed;
  return jsonb_build_object(
    'start_date', e.start_date, 'end_date', e.end_date, 'start_time', e.start_time, 'end_time', e.end_time,
    'starts_at', case when e.start_date is not null and e.start_time is not null then (e.start_date + e.start_time) at time zone e.timezone end,
    'ends_at', case when e.end_date is not null and e.end_time is not null then (e.end_date + e.end_time) at time zone e.timezone end,
    'timezone', e.timezone, 'venue', e.venue, 'location', e.location,
    'note', case when v_de then coalesce(e.schedule_note_de, e.schedule_note_en) else coalesce(e.schedule_note_en, e.schedule_note_de) end,
    'contact', case when c.id is null then null else jsonb_build_object(
      'name', c.display_name,
      'role', case when v_de then coalesce(c.role_label_de, c.role_label_en) else coalesce(c.role_label_en, c.role_label_de) end,
      'email', c.email::text, 'phone', c.phone, 'photo_path', c.photo_path) end,
    -- Zahlen erst ab 20 angenommenen Bewerbungen (K-59): darunter wirkt die Zahl dünn und verrät fast Einzelne.
    'accepted', case when v_acc >= 20 then v_acc else null end,
    'teams', case when v_acc >= 20 then v_teams else null end);
end $$;
