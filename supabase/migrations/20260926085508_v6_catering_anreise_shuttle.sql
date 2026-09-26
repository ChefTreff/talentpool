-- 0211 · Kein Speaker-Catering für Gäste, Anreise mit Shuttle-Stand statt Abhol-Haken (SPK-073, SPK-069)
-- Angewendet von der Architektur-Session am 26.09.2026 als 20260926085508.
--
-- Vorschlag der Build-Session Speaker-Domäne. Nummer, Anwenden, Umbenennen und
-- der Eintrag ins Entscheidungslog gehören der Architektur-Session.
--
-- SPK-073 (K-39, Konrad 25.09.): Gäste der Standbühne (`stage_guest`, 0188)
-- laufen über das Partner-Kontingent — kein Speaker-Catering, keine Lounge.
-- `catering_people` nimmt sie heraus; damit auch `catering_summary`,
-- `catering_coverage` und `catering_notes`, die darauf aufbauen. Die Lounge
-- ist schon dicht: die CHECK-Regel aus 0188 hält `lounge_access` für Gäste auf
-- `false`, alle Lounge-Wege lesen dieses Feld. Speaker der Leistung Talk sind
-- reguläre Profile und behalten beides.
--
-- SPK-069: Speaker setzen „abgeholt/weggebracht werden“ seit SPK-058 nicht mehr
-- (`speaker_travel.needs_pickup/needs_dropoff` stehen nur noch mit Altwerten).
-- Die Anreise zeigt stattdessen, was wirklich gebucht ist: `speaker_travel_list`
-- bekommt hinten die Zahl der angefragten und bestätigten Shuttle-Fahrten
-- (drop + create, danach wieder `grant execute … to authenticated`; die alten
-- Spalten bleiben für den Rückgabetyp stehen, die Oberfläche liest sie nicht
-- mehr). `speaker_detail` gibt dasselbe als `shuttle` aus — das Admin-Detail
-- ersetzt damit „Abholung ja/nein“.
--
-- Funktionen aus `supabase/snapshot/functions/`: `catering_people`,
-- `speaker_travel_list`, `speaker_detail`. Fehlerschlüssel unverändert.

set search_path = public, extensions;

-- ---- 1 · SPK-073: Catering ohne Gäste
create or replace function catering_people(p_edition_id uuid)
 RETURNS TABLE(person_id uuid, audience text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select sp.person_id, 'speaker'
    from speaker_profile sp join person p on p.id = sp.person_id and p.deleted_at is null
   where sp.edition_id = p_edition_id and speaker_is_confirmed(sp.pipeline_status)
     -- SPK-073 (K-39): Gäste der Standbühne laufen über das Partner-Kontingent.
     and not sp.stage_guest
  union
  select vp.person_id, 'volunteer'
    from volunteer_profile vp join person p on p.id = vp.person_id and p.deleted_at is null
   where vp.edition_id = p_edition_id and vp.status = 'accepted'
$$;

-- ---- 2 · SPK-069: Anreise mit Shuttle-Stand (Rückgabetyp wächst hinten)
drop function if exists speaker_travel_list(uuid);
create function speaker_travel_list(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(profile_id uuid, person_id uuid, first_name text, last_name text, job_title text, organization_name text, pipeline_status text, owner_person_id uuid, owner_name text, arrival_date date, arrival_time time without time zone, arrival_mode text, arrival_ref text, departure_date date, departure_time time without time zone, departure_mode text, departure_ref text, needs_pickup boolean, needs_dropoff boolean, note text, hotel_label text, updated_at timestamp with time zone, shuttle_requested integer, shuttle_confirmed integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not (has_role('speaker_manager') or has_role('admin') or has_role('area_lead_speaker')
          or has_role('programme_team') or is_production_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select sp.id, sp.person_id, p.first_name, p.last_name, sp.job_title, sp.organization_name,
           sp.pipeline_status, sp.owner_person_id,
           (select btrim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, ''))
              from person o where o.id = sp.owner_person_id),
           t.arrival_date, t.arrival_time, t.arrival_mode, t.arrival_ref,
           t.departure_date, t.departure_time, t.departure_mode, t.departure_ref,
           coalesce(t.needs_pickup, false), coalesce(t.needs_dropoff, false), t.note,
           (select q.label_de from hospitality_booking b join hospitality_quota q on q.id = b.quota_id
             where b.profile_id = sp.id and b.kind = 'hotel' and b.status = 'confirmed'
             order by b.confirmed_at desc limit 1),
           t.updated_at,
           -- SPK-069: was wirklich gebucht ist, statt des alten Abhol-Hakens.
           (select count(*)::integer from shuttle_booking b where b.profile_id = sp.id and b.status = 'requested'),
           (select count(*)::integer from shuttle_booking b where b.profile_id = sp.id and b.status = 'confirmed')
      from speaker_profile sp
      join person p on p.id = sp.person_id and p.deleted_at is null
      left join speaker_travel t on t.profile_id = sp.id
     where (p_edition_id is null or sp.edition_id = p_edition_id)
       -- Die Produktion braucht die Liste, ohne je Speaker zuständig zu sein.
       and (is_production_team() or can_manage_speaker(sp.id))
       -- SPK-070: Gäste des Partners reisen nicht über uns.
       and not sp.stage_guest
     order by t.arrival_date nulls last, t.arrival_time nulls last,
              p.last_name nulls last, p.first_name nulls last;
end $$;
grant execute on function speaker_travel_list(uuid) to authenticated;


-- ---- 3 · SPK-069: Admin-Detail mit Shuttle-Stand
create or replace function speaker_detail(p_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_p person%rowtype; v_team boolean;
begin
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not can_manage_speaker(p_profile_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_p from person where id = v_sp.person_id;
  v_team := is_speaker_team(v_sp.edition_id);

  return jsonb_build_object(
    -- Der Kontakt ohne Portalzugang (0127) ist genau fuer das Team da: es
    -- soll wissen, wen es statt der Speakerin anschreibt.
    'contact', case when v_sp.contact_first_name is null and v_sp.contact_last_name is null
                     and v_sp.contact_email is null and v_sp.contact_phone is null
                    then null
                    else jsonb_build_object(
                      'first_name', v_sp.contact_first_name, 'last_name', v_sp.contact_last_name,
                      'email', v_sp.contact_email, 'phone', v_sp.contact_phone,
                      'kind', v_sp.contact_kind, 'consent_at', v_sp.contact_consent_at) end,
    'id', v_sp.id,
    'edition_id', v_sp.edition_id,
    'person', jsonb_build_object(
      'id', v_p.id, 'first_name', v_p.first_name, 'last_name', v_p.last_name, 'title', v_p.title,
      'email', (select pe.email::text from person_email pe where pe.person_id = v_p.id and pe.is_primary),
      'preferred_language', v_p.preferred_language,
      'salutation_de', v_p.salutation_de, 'salutation_en', v_p.salutation_en,
      'has_account', v_p.auth_user_id is not null),
    'speaker_type', v_sp.speaker_type,
    'pipeline_status', v_sp.pipeline_status,
    'confirmed_at', v_sp.confirmed_at,
    'declined_at', v_sp.declined_at,
    'decline_reason', v_sp.decline_reason,
    'invited_at', v_sp.invited_at,
    'owner_person_id', v_sp.owner_person_id,
    'owner_name', (select nullif(btrim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, '')), '')
                     from person o where o.id = v_sp.owner_person_id),
    'assistant_person_id', v_sp.assistant_person_id,
    'assistant_name', (select nullif(btrim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), '')
                         from person a where a.id = v_sp.assistant_person_id),
    'job_title', v_sp.job_title,
    'organization_name', v_sp.organization_name,
    'org_id', v_sp.org_id,
    'org_name', (select coalesce(og.communication_name, og.legal_name) from organization og where og.id = v_sp.org_id),
    'bio_short_de', v_sp.bio_short_de, 'bio_short_en', v_sp.bio_short_en,
    'bio_long_de', v_sp.bio_long_de, 'bio_long_en', v_sp.bio_long_en,
    'socials', v_sp.socials,
    'tech_rider', v_sp.tech_rider,
    'photo_asset_id', v_sp.photo_asset_id,
    'reception_eligible', v_sp.reception_eligible,
    'lounge_access', v_sp.lounge_access,
    'pass_type', v_sp.pass_type,
    'hotel_tier', v_sp.hotel_tier,
    'hospitality_status', v_sp.hospitality_status,
    'travel_costs_covered', v_sp.travel_costs_covered,
    'expense_mode', v_sp.expense_mode,
    'expense_lump_sum_cents', v_sp.expense_lump_sum_cents,
    'travel_costs_approved_at', v_sp.travel_costs_approved_at,
    'travel_costs_approved_by', (select nullif(btrim(coalesce(b.first_name, '') || ' ' || coalesce(b.last_name, '')), '')
                                   from person b where b.id = v_sp.travel_costs_approved_by),
    'lead_contact_id', v_sp.lead_contact_id,
    'buddy_contact_id', v_sp.buddy_contact_id,
    'contacts', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'type', c.type, 'display_name', c.display_name)
                                           order by c.type), '[]'::jsonb)
                   from edition_contact c
                  where c.id in (v_sp.lead_contact_id, v_sp.buddy_contact_id)),
    'travel', (select to_jsonb(tr) - 'updated_by' from speaker_travel tr where tr.profile_id = v_sp.id),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object(
                                   'session_id', se.id, 'title_de', se.title_de, 'title_en', se.title_en,
                                   'publish_status', se.publish_status, 'start_at', sl.start_at, 'stage_name', st.name)
                                 order by sl.start_at nulls last)
                          from session_speaker ss
                          join session se on se.id = ss.session_id
                          join event e on e.id = se.event_id
                          left join slot sl on sl.id = se.slot_id
                          left join stage st on st.id = sl.stage_id
                          where ss.person_id = v_sp.person_id
                            and (e.edition_id = v_sp.edition_id or e.id = v_sp.edition_id)), '[]'::jsonb),
    'speaker_contacts', (select coalesce(jsonb_agg(jsonb_build_object(
                                   'id', c.id, 'kind', c.kind, 'first_name', c.first_name,
                                   'last_name', c.last_name, 'email', c.email, 'phone', c.phone,
                                   'has_access', c.has_access, 'consent_at', c.consent_at)
                                 order by c.kind, c.created_at), '[]'::jsonb)
                           from speaker_contact c where c.profile_id = v_sp.id),
    'internal_notes_visible', v_team,
    'created_at', v_sp.created_at,
    'updated_at', v_sp.updated_at
  )
  -- LEAD-039: als zweites Objekt — das erste hat 44 Paare, und
  -- `jsonb_build_object` nimmt höchstens 100 Argumente.
  || jsonb_build_object(
    'category', v_sp.category,
    'topic_cluster', v_sp.topic_cluster,
    'topic_role', v_sp.topic_role,
    'priority', v_sp.priority,
    'recommended_format', v_sp.recommended_format,
    'contact_via', v_sp.contact_via,
    'outreach_channel', v_sp.outreach_channel,
    -- SPK-070: Gast des Partners (0188) — das Detail bietet dann keine Einladung an.
    'stage_guest', v_sp.stage_guest,
    -- SPK-069: gebuchte Shuttle-Fahrten statt des alten Abhol-Hakens.
    'shuttle', jsonb_build_object(
      'requested', (select count(*) from shuttle_booking b where b.profile_id = v_sp.id and b.status = 'requested'),
      'confirmed', (select count(*) from shuttle_booking b where b.profile_id = v_sp.id and b.status = 'confirmed')),
    -- PART-091: über wen die Speaker-Mails gehen, wenn der Partner alles verwaltet.
    'mail_via', (select jsonb_build_object(
                          'contact_id', c.id,
                          'name', coalesce(nullif(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''),
                                           (select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
                                              from person p where p.id = c.person_id)),
                          'has_access', c.has_access)
                   from speaker_contact c where c.id = v_sp.mail_via_contact_id),
    'stage_candidates', coalesce((select jsonb_agg(jsonb_build_object('stage_id', st.id, 'name', st.name)
                                                   order by st.sort_order, st.name)
                                    from speaker_stage_candidate c join stage st on st.id = c.stage_id
                                   where c.profile_id = v_sp.id), '[]'::jsonb))
  || case when v_team then jsonb_build_object('internal_notes', v_sp.internal_notes) else '{}'::jsonb end;
end $$;

select harden_definer_functions();
