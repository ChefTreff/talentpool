-- 0305 · Speaker-Prio nur fürs Team, Spalten-Grants auf speaker_profile (LEAD-053)
-- Angewendet von der Architektur-Session am 10.10.2026 als 20261010145417.
-- Vorschlag der Build-Session Speaker-Domäne. Nummer, Zeitstempel, Anwenden und der Eintrag ins Entscheidungslog gehören der Architektur-Session.
--
-- Anlass: Feedbackrunde Konrad & Paulina 05.10.2026 (LEAD-053). Paulina: „welche Prio Henny und ich der Person dann am Ende wirklich gegeben haben, hat die ja eigentlich nicht zu
-- interessieren“ — die A-/B-/C-Einstufung (`speaker_profile.priority`, im Bildschirm „Prio“, Werte „A-Tier“ …) ist eine interne Bewertung der Programmleitung. LEAD-055 hat sie im Kopf
-- des Fensters schon weggelassen; Stage Leads sahen sie aber weiter in der Pipeline-Liste (Spalte und Filter) und im Block „Pipeline“ — und konnten sie setzen (K-36 F1: Einordnung für alle
-- mit `can_manage_speaker`). Gelesen werden konnte sie über jeden Weg: `manager_speakers`, `speaker_detail` und **direkt über die Tabelle** (`authenticated` hatte Tabellen-SELECT, Policy
-- `sp_manage_sel` lässt Manager ihre Zeilen lesen — `GET /rest/v1/speaker_profile?select=priority` genügte). Plan 10.10.2026: ja zu allen drei Wegen und die Restlücke schließen
-- („Sicherheit ist Backbone: Spalten-Grants“, Muster wie `ticket`, `product`, `stage`, `slot`).
--
-- Was die Migration tut (Rechteänderung)
--   1  manager_speakers — `priority` nur für `is_speaker_team(sp.edition_id)`, sonst NULL. Eine Zeile gegen den Snapshot.
--   2  speaker_detail — dasselbe (`case when v_team`). Eine Zeile.
--   3  update_speaker — `priority` ist ein **Team-Feld**: von Nicht-Team geschickt ⇒ 42501 `team_only_fields`, wie Lounge, Pass, Hotel-Tier, Hospitality, Organisation, Reisekosten-
--      Freigabe und Betreuung. Eine Zeile (das Feld steht in der Liste, die der Schlüsselvergleich `?|` prüft — es zählt, ob der Schlüssel **mitgeschickt** wird, nicht sein Wert).
--      Das nimmt K-36 F1 für **genau dieses Feld** zurück; Kategorie, Cluster, Thema, Format, „Kontakt via“, Ansprache und Bühnen in Frage bleiben für alle Manager, ebenso `internal_notes`.
--   4  Spalten-Grants auf `speaker_profile`: `revoke select … from authenticated` (nimmt auch alle Spaltenrechte) und `grant select (<50 ausgeschriebene Spalten>)`. Gewährt ist, was
--      `manager_speakers` oder `speaker_detail` einem Manager **ohne Team-Rolle** ohnehin geben (roh oder abgeleitet) — die Tabelle zeigt ihm nichts, was die Funktionen ihm vorenthalten.
--
-- Inventar der Spalten (live gelesen am 10.10.2026, 56 Spalten)
--   * Gewährt (50): id, person_id, edition_id, speaker_type, pipeline_status, owner_person_id, job_title, organization_name, org_id, bio_short_en, bio_short_de, bio_long_en, bio_long_de,
--     socials, photo_asset_id, reception_eligible, lounge_access, pass_type, hotel_tier, hospitality_status, travel_costs_covered, travel_costs_approved_by, travel_costs_approved_at,
--     tech_rider, assistant_person_id, internal_notes, invited_at, created_at, updated_at, lead_contact_id, buddy_contact_id, confirmed_at, declined_at, decline_reason, contact_first_name,
--     contact_last_name, contact_email, contact_phone, contact_kind, contact_consent_at, expense_mode, expense_lump_sum_cents, category, topic_cluster, topic_role, recommended_format,
--     contact_via, outreach_channel, stage_guest, mail_via_contact_id.
--       - `manager_speakers` liefert Managern roh: id, person_id, speaker_type, pipeline_status, owner_person_id, job_title, organization_name, reception_eligible, travel_costs_covered,
--         hospitality_status, hotel_tier, pass_type, lounge_access, invited_at, confirmed_at, declined_at, decline_reason, updated_at, internal_notes, category, topic_cluster, topic_role,
--         recommended_format, contact_via, outreach_channel, stage_guest — und abgeleitet travel_costs_approved_at (als Ja/Nein) und assistant_person_id (als Name).
--       - `speaker_detail` liefert Managern zusätzlich: edition_id, org_id, die vier Bios, socials, tech_rider, photo_asset_id, expense_mode, expense_lump_sum_cents, travel_costs_approved_at
--         und travel_costs_approved_by (als Name), assistant_person_id, lead_contact_id, buddy_contact_id, created_at, die sechs Kontaktfelder contact_*, mail_via_contact_id (als „mail_via“).
--       - Policies anderer Tabellen werten Unterabfragen auf `speaker_profile` **mit den Rechten des Nutzers** aus und brauchen id, person_id, assistant_person_id: `expense_claim` (ec_read),
--         `hospitality_booking` (hb_read), `speaker_asset` (sa_read). Die App liest die Tabelle mit dem Nutzer-Client nur in `lib/speaker/praesentationen.ts` (id, person_id; Filter edition_id)
--         und `lib/speaker/foto.ts` (edition_id; Filter id); `lib/expenses/store-invoice.ts` nimmt den Admin-Schlüssel (Spaltenrechte gelten dort nicht).
--   * Nicht gewährt (6): `priority` (diese Migration) und die fünf Spalten, die weder `manager_speakers` noch `speaker_detail` einem Nicht-Team-Manager geben und die kein direkter Leser
--     braucht: `created_by`, `created_by_org_id`, `partner_editable_until_login` (Herkunft über einen Partner), `stage_guest_consent_at`, `companion_quota`. Intern lesen sie die
--     DEFINER-Funktionen (`can_manage_speaker` nutzt created_by) — mit den Rechten des Eigentümers.
--   * Keine Views und keine Funktionen mit Aufruferrechten lesen `speaker_profile` (live geprüft: `pg_depend`/`pg_rewrite`, `pg_policy`, `pg_proc` ohne SECURITY DEFINER); Trigger laufen
--     in den DEFINER-Funktionen, die schreiben, als Eigentümer.
--   * **Folge für Leser:** `select *` und jede Spalte außerhalb der Liste ergeben für `authenticated` 42501 (PostgREST: nie `select=*` auf diese Tabelle). Neue Spalten brauchen ihren
--     eigenen `grant select (spalte)`, wenn ein direkter Lesezugriff sie braucht (`docs/db-konventionen.md` §5); schreiben tut `authenticated` hier ohnehin nie (nur per RPC).
--
-- Rechte danach: Team (admin, `area_lead_speaker`, `programme_team`) sieht und setzt `priority` über die Funktionen; Manager ohne Team-Rolle sehen NULL und bekommen beim Setzen 42501;
-- direkt über die Tabelle liest `priority` **niemand** mit Nutzerrechten (auch das Team nicht — es braucht den Umweg über die Funktionen); die Speakerin sieht wie bisher keine Zeile
-- (Policy), `anon` nichts. `service_role` und die Eigentümerrolle sind von Spaltenrechten nicht berührt.
-- Fehlerschlüssel: `team_only_fields` (42501, steht schon in `BUSINESS_KEYS`).
set search_path = public, extensions;

-- ----------------------------------------------------- 1 · manager_speakers (eine Zeile: priority)
create or replace function manager_speakers(p_edition_id uuid DEFAULT NULL::uuid)
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
           sp.category, sp.topic_cluster, sp.topic_role, case when is_speaker_team(sp.edition_id) then sp.priority end, sp.recommended_format,
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

-- ----------------------------------------------------- 2 · speaker_detail (eine Zeile: priority)
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
    'priority', case when v_team then v_sp.priority end,
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

-- ----------------------------------------------------- 3 · update_speaker (eine Zeile: priority ist ein Team-Feld)
create or replace function update_speaker(p_profile_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_team boolean; v_before jsonb;
begin
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not can_manage_speaker(p_profile_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_team := is_speaker_team(v_sp.edition_id);
  if not v_team and (p_data ?| array['lounge_access', 'pass_type', 'hotel_tier', 'hospitality_status',
                                     'org_id', 'travel_costs_approved', 'owner_person_id', 'priority']) then
    raise exception 'team_only_fields' using errcode = '42501';
  end if;
  v_before := to_jsonb(v_sp) - 'internal_notes';

  update speaker_profile set
    speaker_type         = coalesce(nullif(p_data->>'speaker_type', ''), speaker_type),
    pipeline_status      = coalesce(nullif(p_data->>'pipeline_status', ''), pipeline_status),
    owner_person_id      = case when p_data ? 'owner_person_id' then nullif(p_data->>'owner_person_id', '')::uuid else owner_person_id end,
    job_title            = case when p_data ? 'job_title'         then nullif(btrim(p_data->>'job_title'), '')         else job_title end,
    organization_name    = case when p_data ? 'organization_name' then nullif(btrim(p_data->>'organization_name'), '') else organization_name end,
    bio_short_en         = case when p_data ? 'bio_short_en'      then nullif(btrim(p_data->>'bio_short_en'), '')      else bio_short_en end,
    bio_short_de         = case when p_data ? 'bio_short_de'      then nullif(btrim(p_data->>'bio_short_de'), '')      else bio_short_de end,
    bio_long_en          = case when p_data ? 'bio_long_en'       then nullif(btrim(p_data->>'bio_long_en'), '')       else bio_long_en end,
    bio_long_de          = case when p_data ? 'bio_long_de'       then nullif(btrim(p_data->>'bio_long_de'), '')       else bio_long_de end,
    socials              = case when p_data ? 'socials'    and jsonb_typeof(p_data->'socials') = 'object'    then p_data->'socials'    else socials end,
    tech_rider           = case when p_data ? 'tech_rider' and jsonb_typeof(p_data->'tech_rider') = 'object' then p_data->'tech_rider' else tech_rider end,
    internal_notes       = case when p_data ? 'internal_notes'    then nullif(btrim(p_data->>'internal_notes'), '')    else internal_notes end,
    -- LEAD-039: Einordnung, für alle mit `can_manage_speaker` (K-36 F1). Geprüft
    -- im Trigger `speaker_profile_check`.
    category             = case when p_data ? 'category'           then nullif(btrim(p_data->>'category'), '')           else category end,
    topic_cluster        = case when p_data ? 'topic_cluster'      then nullif(btrim(p_data->>'topic_cluster'), '')      else topic_cluster end,
    topic_role           = case when p_data ? 'topic_role'         then nullif(btrim(p_data->>'topic_role'), '')         else topic_role end,
    priority             = case when p_data ? 'priority'           then nullif(btrim(p_data->>'priority'), '')           else priority end,
    recommended_format   = case when p_data ? 'recommended_format' then nullif(btrim(p_data->>'recommended_format'), '') else recommended_format end,
    contact_via          = case when p_data ? 'contact_via'        then nullif(btrim(p_data->>'contact_via'), '')        else contact_via end,
    outreach_channel     = case when p_data ? 'outreach_channel'   then nullif(btrim(p_data->>'outreach_channel'), '')   else outreach_channel end,
    reception_eligible   = coalesce((p_data->>'reception_eligible')::boolean, reception_eligible),
    travel_costs_covered = coalesce((p_data->>'travel_costs_covered')::boolean, travel_costs_covered),
    lounge_access        = coalesce((p_data->>'lounge_access')::boolean, lounge_access),
    pass_type            = coalesce(nullif(p_data->>'pass_type', ''), pass_type),
    hotel_tier           = coalesce(nullif(p_data->>'hotel_tier', ''), hotel_tier),
    hospitality_status   = coalesce(nullif(p_data->>'hospitality_status', ''), hospitality_status),
    org_id               = case when p_data ? 'org_id' then nullif(p_data->>'org_id', '')::uuid else org_id end
  where id = p_profile_id;

  perform log_audit('speaker.update', 'speaker_profile', p_profile_id::text, v_before, p_data);
  return p_profile_id;
end $$;

-- ----------------------------------------------------- 4 · Spalten-Grants auf speaker_profile
-- Erst alles weg (auch Spaltenrechte), dann nur die ausgeschriebene Liste. Kein dynamisches SQL: was gewährt ist, steht hier im Review.
revoke select on speaker_profile from authenticated;
grant select (
  id, person_id, edition_id, speaker_type, pipeline_status, owner_person_id,
  job_title, organization_name, org_id, bio_short_en, bio_short_de, bio_long_en,
  bio_long_de, socials, photo_asset_id, reception_eligible, lounge_access, pass_type,
  hotel_tier, hospitality_status, travel_costs_covered, travel_costs_approved_by, travel_costs_approved_at, tech_rider,
  assistant_person_id, internal_notes, invited_at, created_at, updated_at, lead_contact_id,
  buddy_contact_id, confirmed_at, declined_at, decline_reason, contact_first_name, contact_last_name,
  contact_email, contact_phone, contact_kind, contact_consent_at, expense_mode, expense_lump_sum_cents,
  category, topic_cluster, topic_role, recommended_format, contact_via, outreach_channel,
  stage_guest, mail_via_contact_id
) on speaker_profile to authenticated;

comment on table speaker_profile is
  'Speaker je Edition: Pipeline, Staff-Flags (Reception, Lounge, Pass, Hospitality, Reisekosten), Tech-Rider, Assistenz. Schreiben nur per RPC. Lesen mit Nutzerrechten nur über eine ausgeschriebene Spaltenliste (LEAD-053): priority, created_by, created_by_org_id, partner_editable_until_login, stage_guest_consent_at und companion_quota sind nur über die Funktionen lesbar; neue Spalten brauchen ihren eigenen grant select (spalte), wenn ein direkter Lesezugriff sie braucht.';

select harden_definer_functions();
