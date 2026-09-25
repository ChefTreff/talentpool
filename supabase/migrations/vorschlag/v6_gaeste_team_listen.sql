-- 00NN · SPK-070: Standbühnen- und Talk-Gäste in den Team-Listen kennzeichnen, keine Speaker-Mails an Gäste
--
-- Vorschlag der Build-Session Speaker-Domäne. Nummer, Anwenden, Umbenennen und
-- der Eintrag ins Entscheidungslog gehören der Architektur-Session.
--
-- Anlass: SPK-070 (Folge aus PART-081/088, 0188, #204): Gäste sind
-- `speaker_profile` mit `stage_guest = true`, zugesagt, ohne Rolle, Ticket und
-- Lounge. Die Team-Listen zeigten sie als zugesagte Speaker, `unassigned_speakers`
-- als „ohne Betreuung“, und zwei Mails des Team-Wegs hätten sie erreicht.
--
-- Neu:
--   * `manager_speakers` gibt `stage_guest` aus (drop + create, der Rückgabetyp
--     wächst hinten — alle alten Spalten bleiben). Die Oberfläche kennzeichnet
--     Gäste mit „Gast“ und blendet sie auf Wunsch aus.
--   * `speaker_detail` gibt `stage_guest` aus — das Admin-Detail kennzeichnet den
--     Gast und bietet keine Einladung an (`invite_speaker` weist ihn ohnehin ab).
--   * `unassigned_speakers` zählt Gäste nicht mehr: der Partner pflegt sie.
--   * `speaker_leads_admin` zählt je Lead nur Speaker des Teams — ein Gast mit
--     Owner verfälschte sonst Zusagen und offene Schritte (Onboarding, das er
--     nie macht).
--   * `speaker_travel_list` (Anreise unter `/speaker-leads/anreise` und
--     `/admin/anreise`) führt keine Gäste: sie reisen nicht über uns und haben
--     kein Portal für Reisedaten — sie stünden dort nur als Lücke.
--   * `send_presentation_reminders` erinnert keine Gäste.
--   * `register_session_asset` schickt „Bühnenfotos bereit“ nur an Speaker mit
--     Profil der Edition — nicht an Gäste und nicht an eine Moderation ohne
--     Profil (LEAD-042, 0187): die Mail führt ins Speaker-Portal, das beide nicht
--     haben.
--
-- Nicht Teil dieses Vorschlags: der Website-Export (SPK-046) ist noch nicht
-- gebaut; er filtert beim Bau `not stage_guest` (Vermerk im Backlog). Das
-- Catering der Produktion (`catering_people`) zählt Gäste weiter als Speaker —
-- ob sie Speaker-Catering bekommen, entscheidet Konrad (PROD-011).
--
-- Funktionen aus `supabase/snapshot/functions/`: `manager_speakers`,
-- `speaker_detail`, `unassigned_speakers`, `speaker_leads_admin`,
-- `speaker_travel_list`, `send_presentation_reminders`, `register_session_asset`.
-- Fehlerschlüssel unverändert.

set search_path = public, extensions;

-- ---- 1 · Team-Liste: Gäste kennzeichnen (Rückgabetyp wächst)
drop function if exists manager_speakers(uuid);
create function manager_speakers(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, person_id uuid, first_name text, last_name text, title text, email text, job_title text, organization_name text, speaker_type text, pipeline_status text, owner_person_id uuid, owner_name text, reception_eligible boolean, travel_costs_covered boolean, travel_costs_approved boolean, hospitality_status text, hotel_tier text, pass_type text, lounge_access boolean, invited_at timestamp with time zone, confirmed_at timestamp with time zone, declined_at timestamp with time zone, decline_reason text, assistant_name text, sessions jsonb, next_open jsonb, updated_at timestamp with time zone, internal_notes text, category text, topic_cluster text, topic_role text, priority text, recommended_format text, contact_via text, outreach_channel text, stage_candidates jsonb, open_tasks integer, next_task jsonb, last_activity_at timestamp with time zone, stage_guest boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not (has_role('speaker_manager') or has_role('admin') or has_role('area_lead_speaker') or has_role('programme_team')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select sp.id, sp.person_id, p.first_name, p.last_name, p.title,
           (select pe.email::text from person_email pe where pe.person_id = p.id and pe.is_primary),
           sp.job_title, sp.organization_name, sp.speaker_type, sp.pipeline_status,
           sp.owner_person_id, (select btrim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, '')) from person o where o.id = sp.owner_person_id),
           sp.reception_eligible, sp.travel_costs_covered, (sp.travel_costs_approved_at is not null),
           sp.hospitality_status, sp.hotel_tier, sp.pass_type, sp.lounge_access, sp.invited_at,
           sp.confirmed_at, sp.declined_at, sp.decline_reason,
           (select string_agg(x.name, ', ' order by x.name) from (
              select nullif(btrim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), '') as name
                from person a where a.id = sp.assistant_person_id
              union
              select nullif(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '')
                from speaker_contact c where c.profile_id = sp.id and c.has_access
            ) x where x.name is not null),
           coalesce((select jsonb_agg(jsonb_build_object('session_id', se.id, 'title_de', se.title_de, 'title_en', se.title_en,
                                                          'publish_status', se.publish_status, 'start_at', sl.start_at, 'stage_name', st.name)
                                       order by sl.start_at nulls last)
                     from session_speaker ss join session se on se.id = ss.session_id join event e on e.id = se.event_id
                     left join slot sl on sl.id = se.slot_id left join stage st on st.id = sl.stage_id
                     where ss.person_id = sp.person_id and (e.edition_id = sp.edition_id or e.id = sp.edition_id)), '[]'::jsonb),
           speaker_next_steps(sp.id)->'open',
           sp.updated_at, sp.internal_notes,
           -- LEAD-039: Einordnung und Bühnen in Frage.
           sp.category, sp.topic_cluster, sp.topic_role, sp.priority, sp.recommended_format,
           sp.contact_via, sp.outreach_channel,
           coalesce((select jsonb_agg(jsonb_build_object('stage_id', st.id, 'name', st.name)
                                      order by st.sort_order, st.name)
                       from speaker_stage_candidate c join stage st on st.id = c.stage_id
                      where c.profile_id = sp.id), '[]'::jsonb),
           -- LEAD-039 Schnitt 2: Verlauf — offene Aufgaben, die früheste als
           -- nächster Schritt, und wann zuletzt etwas geschah (eine Aufgabe zählt
           -- erst, wenn sie erledigt ist).
           (select count(*)::integer from speaker_activity a
             where a.profile_id = sp.id and a.kind = 'task' and a.done_at is null),
           (select jsonb_build_object('id', a.id, 'body', a.body, 'due_on', a.due_on,
                                      'assignee_person_id', a.assignee_person_id,
                                      'assignee_name', (select nullif(btrim(coalesce(z.first_name, '') || ' ' || coalesce(z.last_name, '')), '')
                                                          from person z where z.id = a.assignee_person_id))
              from speaker_activity a
             where a.profile_id = sp.id and a.kind = 'task' and a.done_at is null
             order by a.due_on, a.created_at
             limit 1),
           (select max(case when a.kind = 'task' then a.done_at else a.occurred_at end)
              from speaker_activity a where a.profile_id = sp.id),
           -- SPK-070: vom Partner angelegter Gast (0188) — die Listen kennzeichnen
           -- ihn und blenden ihn auf Wunsch aus.
           sp.stage_guest
    from speaker_profile sp
    join person p on p.id = sp.person_id
    left join vocab_term v on v.vocabulary = 'speaker_pipeline' and v.key = sp.pipeline_status
    where (p_edition_id is null or sp.edition_id = p_edition_id)
      and p.deleted_at is null
      and can_manage_speaker(sp.id)
    order by v.sort_order nulls last, p.last_name nulls last, p.first_name nulls last;
end $$;

-- ---- 1b · Detail: dasselbe Kennzeichen
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
    'stage_candidates', coalesce((select jsonb_agg(jsonb_build_object('stage_id', st.id, 'name', st.name)
                                                   order by st.sort_order, st.name)
                                    from speaker_stage_candidate c join stage st on st.id = c.stage_id
                                   where c.profile_id = v_sp.id), '[]'::jsonb))
  || case when v_team then jsonb_build_object('internal_notes', v_sp.internal_notes) else '{}'::jsonb end;
end $$;

-- ---- 2 · Ohne Betreuung: Gäste zählen nicht
create or replace function unassigned_speakers(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(profile_id uuid, display_name text, job_title text, organization_name text, speaker_type text, pipeline_status text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
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
       -- SPK-070: Gäste pflegt der Partner, sie brauchen keinen Speaker-Lead.
       and not sp.stage_guest
       and p.deleted_at is null
     order by sp.created_at;
end $$;

-- ---- 2b · Speaker-Leads im Admin: nur Speaker des Teams zählen
create or replace function speaker_leads_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(person_id uuid, display_name text, email text, assignments jsonb, speakers integer, confirmed integer, declined integer, open_steps integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not can_manage_speaker_leads() then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;
  -- SPK-070: Gäste des Partners (0188) zählen in keiner Spalte — auch nicht,
  -- wenn jemand einen als Owner übernommen hat.
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
             where sp.owner_person_id = p.id and sp.edition_id = v_ed and not sp.stage_guest),
           (select count(*)::integer from speaker_profile sp
             where sp.owner_person_id = p.id and sp.edition_id = v_ed and not sp.stage_guest
               and sp.confirmed_at is not null and sp.declined_at is null),
           (select count(*)::integer from speaker_profile sp
             where sp.owner_person_id = p.id and sp.edition_id = v_ed and not sp.stage_guest
               and sp.declined_at is not null),
           coalesce((select sum(jsonb_array_length(speaker_next_steps(sp.id)->'open'))::integer
                       from speaker_profile sp
                      where sp.owner_person_id = p.id and sp.edition_id = v_ed and not sp.stage_guest), 0)
      from person p
     where p.deleted_at is null and is_speaker_manager(p.id)
     order by 2 nulls last;
end $$;

-- ---- 2c · Anreise: keine Gäste
create or replace function speaker_travel_list(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(profile_id uuid, person_id uuid, first_name text, last_name text, job_title text, organization_name text, pipeline_status text, owner_person_id uuid, owner_name text, arrival_date date, arrival_time time without time zone, arrival_mode text, arrival_ref text, departure_date date, departure_time time without time zone, departure_mode text, departure_ref text, needs_pickup boolean, needs_dropoff boolean, note text, hotel_label text, updated_at timestamp with time zone)
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
           t.updated_at
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

-- ---- 3 · Keine Präsentations-Erinnerung an Gäste
create or replace function send_presentation_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare r record; v_n integer := 0;
begin
  if not (auth.uid() is null or has_role('admin') or has_role('programme_team')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  for r in
    select ss.person_id, se.id as session_id, e.timezone,
           least(d.due_at, sl.start_at - interval '48 hours') as effective_due,
           coalesce(p.preferred_language, 'en') as locale
    from session se
    join slot sl on sl.id = se.slot_id
    join event e on e.id = se.event_id
    join session_speaker ss on ss.session_id = se.id
    join person p on p.id = ss.person_id
    join speaker_profile sp on sp.person_id = ss.person_id and sp.edition_id = coalesce(e.edition_id, e.id)
    left join deadline d on d.key = 'presentation_upload' and d.edition_id = coalesce(e.edition_id, e.id)
    where se.publish_status <> 'cancelled'
      and sl.start_at > now()
      and speaker_is_confirmed(sp.pipeline_status)
      -- SPK-070: Gäste laden keine Präsentation im Portal hoch, sie haben keins.
      and not sp.stage_guest
      and now() >= least(d.due_at, sl.start_at - interval '48 hours') - make_interval(hours => coalesce(d.reminder_lead_hours, 48))
      and not exists (select 1 from speaker_asset a
                      where a.profile_id = sp.id and a.kind = 'presentation' and a.is_current
                        and (a.session_id = se.id or a.session_id is null))
      and not exists (select 1 from mail_log m
                      where m.template_key = 'presentation_reminder' and m.person_id = ss.person_id
                        and m.related_type = 'session' and m.related_id = se.id)
    order by sl.start_at
  loop
    perform queue_mail('presentation_reminder', r.person_id,
                       session_mail_vars(r.session_id, r.locale) || jsonb_build_object('due_label', mail_fmt_ts(r.effective_due, r.timezone, r.locale)),
                       'session', r.session_id);
    v_n := v_n + 1;
  end loop;
  if v_n > 0 then
    insert into audit_log (action, object_type, object_id, after)
    values ('presentation.reminder', 'system', 'cron', jsonb_build_object('sent', v_n));
  end if;
  return v_n;
end $$;

-- ---- 4 · „Bühnenfotos bereit“ nur an Speaker mit Portal
create or replace function register_session_asset(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_session uuid := nullif(p_data->>'session_id', '')::uuid;
        v_kind text := nullif(p_data->>'kind', '');
        v_path text := nullif(btrim(p_data->>'storage_path'), '');
        v_id uuid; v_version integer; v_erstes boolean; r record;
begin
  if not is_marketing_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_kind not in ('stage_photo', 'slot_graphic') then
    raise exception 'invalid_kind' using errcode = '22023', detail = coalesce(v_kind, 'null');
  end if;
  if not exists (select 1 from session se where se.id = v_session) then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  if v_path is null or split_part(v_path, '/', 1) <> v_session::text
     or split_part(v_path, '/', 2) <> v_kind then
    raise exception 'invalid_path' using errcode = '22023', detail = coalesce(v_path, 'null');
  end if;

  v_erstes := not exists (select 1 from session_asset a
                           where a.session_id = v_session and a.kind = 'stage_photo');
  select coalesce(max(a.version), 0) + 1 into v_version
    from session_asset a where a.session_id = v_session and a.kind = v_kind;

  if v_kind = 'slot_graphic' then
    update session_asset set is_current = false
     where session_id = v_session and kind = 'slot_graphic' and is_current;
  end if;

  insert into session_asset (session_id, kind, storage_path, filename, mime, size_bytes,
                             width, height, cutout, credit, version, uploaded_by)
  values (v_session, v_kind, v_path, coalesce(nullif(btrim(p_data->>'filename'), ''), 'datei'),
          nullif(p_data->>'mime', ''), (p_data->>'size_bytes')::bigint,
          (p_data->>'width')::integer, (p_data->>'height')::integer,
          coalesce((p_data->>'cutout')::boolean, false),
          nullif(btrim(p_data->>'credit'), ''), v_version, current_person_id())
  returning id into v_id;

  if v_kind = 'stage_photo' and v_erstes then
    for r in
      select ss.person_id, coalesce(se.title_de, se.title_en) as titel
        from session_speaker ss join session se on se.id = ss.session_id
        join event ev on ev.id = se.event_id
       where ss.session_id = v_session
         -- SPK-070 / LEAD-042: die Mail führt ins Speaker-Portal. Sie geht deshalb
         -- nur an Speaker mit Profil dieser Edition — nicht an Gäste des Partners
         -- und nicht an eine Moderation ohne Profil (etwa einen Stage Lead).
         and exists (select 1 from speaker_profile sp
                      where sp.person_id = ss.person_id
                        and sp.edition_id = coalesce(ev.edition_id, ev.id)
                        and not sp.stage_guest)
    loop
      perform queue_mail('stage_photos_ready', r.person_id,
                         jsonb_build_object('session_title', coalesce(r.titel, '')),
                         'session', v_session);
    end loop;
  end if;

  perform log_audit('session_asset.register', 'session_asset', v_id::text, null,
                    jsonb_build_object('session_id', v_session, 'kind', v_kind, 'version', v_version));
  return v_id;
end $$;

select harden_definer_functions();
