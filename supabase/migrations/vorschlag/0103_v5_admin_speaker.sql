-- =============================================================================
-- 0103 · Welle 5 · Admin-Speaker: Detailblatt, Weiterreichen statt Ansichziehen
--
-- Liegt unter `vorschlag/`, bis die Architektur-Session sie anwendet.
--
-- Konrad zur Struktur der Speaker-Domäne: der Admin-Bereich verwaltet **alle**
-- Daten, das Lead-Portal ist der eingeschränkte Blick. An zwei Stellen fehlte
-- dafür etwas.
--
-- 1. **Es gab kein Detailblatt.** `manager_speakers` liefert die Liste; Biografien,
--    Socials, Tech-Rider, interne Notizen, Assistenz, Reisekosten-Freigabe und
--    Ansprechpartner stehen dort nicht drin. Ein Admin, der einen Speaker
--    prüfen will, hätte sie nirgends gesehen. `speaker_detail()` gibt den
--    ganzen Datensatz in einem Zug zurück — **`internal_notes` nur fürs Team**,
--    denn die Notiz „will mehr Honorar" ist nichts, was jede Lead-Person liest.
--
-- 2. **`owner_person_id` war kein Team-Feld.** `update_speaker` liess das Feld
--    für jeden zu, der den Speaker verwalten darf — also auch für eine
--    Lead-Person. Damit konnte sie sich einen fremden Speaker **zuschreiben**,
--    nicht nur den eigenen abgeben. Wer wen betreut, entscheidet aber die
--    Programmleitung. Das Feld wandert in dieselbe Liste wie `pass_type` und
--    `hotel_tier`; wer nicht zum Team gehört, bekommt `team_only_fields`.
--
--    Dafür gibt es `handover_speaker()`: **weiterreichen, was man hat.** Eine
--    Lead-Person darf einen Speaker abgeben, den sie heute selbst betreut; das
--    Team darf jeden zuordnen. Als eigene Funktion und nicht als Sonderfall in
--    `update_speaker`, weil die Regel dort zwischen zwanzig Feldern stünde und
--    beim nächsten Umbau verloren ginge.
--
--    Die zweite Bedingung ist die, an die man nicht denkt: **der Empfänger muss
--    Speaker-Lead sein.** Sonst zeigt `owner_person_id` auf jemanden, der das
--    Lead-Portal gar nicht öffnen kann — der Speaker hätte eine Betreuung, die
--    ihn nie sieht. `speaker_managers()` bietet deshalb nur solche Personen zur
--    Auswahl an; die Prüfung in der RPC ist die Grenze, die Auswahl nur die
--    Bequemlichkeit.
--
-- 3. **`manager_speakers` hatte die interne Notiz verloren.** 0099 hat den
--    Rückgabetyp erweitert und dabei die Spalte aus 0037 vergessen; im
--    Lead-Portal stand das Notizfeld seither leer. Hier wieder eingesetzt.
--
-- Fehlerschlüssel: 42501 ohne Recht · 42501 `team_only_fields` ·
-- 22023 `invalid_owner` (Empfänger ist kein Speaker-Lead) ·
-- P0002 `speaker_not_found` · P0002 `person_not_found`.
--
-- Test: supabase/tests/v5_admin_speaker.sql
-- =============================================================================
set search_path = public, extensions;

-- ---------------------------------------------------------------- Empfänger

/**
 * Ist diese Person heute als Speaker-Lead eingetragen?
 *
 * Dieselbe Gültigkeitsprüfung wie `has_role`, aber für eine **fremde** Person —
 * `roles_of_person` verlangt Admin und wäre hier zu eng.
 */
create or replace function is_speaker_manager(p_person_id uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from role_assignment ra
     where ra.person_id = p_person_id
       and ra.role in ('speaker_manager', 'area_lead_speaker', 'admin')
       and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now()))
$$;
revoke execute on function is_speaker_manager(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- Weitergeben

/**
 * Einen Speaker an eine andere Lead-Person übergeben.
 *
 * `p_to_person_id = null` gibt ihn frei. Das darf nur das Team: eine Lead-Person,
 * die ihren Speaker einfach ablegt, hinterlässt jemanden ohne Betreuung.
 */
create or replace function handover_speaker(p_profile_id uuid, p_to_person_id uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_team boolean;
begin
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not can_manage_speaker(p_profile_id) then raise exception 'not allowed' using errcode = '42501'; end if;

  v_team := is_speaker_team(v_sp.edition_id);
  -- Weiterreichen, was man hat: wer nicht zum Team gehört, muss heute selbst
  -- die Betreuung haben. Sonst wäre es ein Zugriff, keine Übergabe.
  if not v_team and (v_sp.owner_person_id is distinct from v_me or p_to_person_id is null) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_to_person_id is not null then
    if not exists (select 1 from person p where p.id = p_to_person_id and p.deleted_at is null) then
      raise exception 'person_not_found' using errcode = 'P0002', detail = p_to_person_id::text;
    end if;
    if not is_speaker_manager(p_to_person_id) then
      raise exception 'invalid_owner' using errcode = '22023', detail = p_to_person_id::text;
    end if;
  end if;

  update speaker_profile set owner_person_id = p_to_person_id where id = p_profile_id;
  perform log_audit('speaker.handover', 'speaker_profile', p_profile_id::text,
                    jsonb_build_object('owner_person_id', v_sp.owner_person_id),
                    jsonb_build_object('owner_person_id', p_to_person_id));
end $$;

/** Die Lead-Personen zur Auswahl — für das Feld „betreut von". */
create or replace function speaker_managers()
returns table (person_id uuid, display_name text, email text)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not (has_role('admin') or has_role('area_lead_speaker') or has_role('programme_team')
          or has_role('speaker_manager')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select p.id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           (select pe.email::text from person_email pe where pe.person_id = p.id and pe.is_primary)
      from person p
     where p.deleted_at is null and is_speaker_manager(p.id)
     order by 2 nulls last;
end $$;

-- ---------------------------------------------------------------- update_speaker

/**
 * Wie in 0026, mit einem Unterschied: `owner_person_id` steht jetzt in der
 * Team-Liste. Der Rumpf ist sonst unverändert — bewusst vollständig wiederholt,
 * damit die Whitelist an genau einer Stelle steht.
 */
create or replace function update_speaker(p_profile_id uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_sp speaker_profile%rowtype; v_team boolean; v_before jsonb;
begin
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not can_manage_speaker(p_profile_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_team := is_speaker_team(v_sp.edition_id);
  if not v_team and (p_data ?| array['lounge_access', 'pass_type', 'hotel_tier', 'hospitality_status',
                                     'org_id', 'travel_costs_approved', 'owner_person_id']) then
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

-- ---------------------------------------------------------------- Detailblatt

/**
 * Ein Speaker mit allem, was zu ihm gespeichert ist — Person, Profil, Reise,
 * Ansprechpartner, Sessions.
 *
 * Ein Aufruf statt sieben: die Detailseite soll nicht aus einem Dutzend
 * Einzelabfragen zusammengesetzt werden, die jede für sich eine Rechteprüfung
 * mitbringt und bei der nächsten Änderung auseinanderläuft.
 *
 * `internal_notes` kommt nur fürs Team mit. Wer sie nicht sehen darf, bekommt
 * das Feld gar nicht erst — nicht leer, sondern `internal_notes_visible: false`,
 * damit die Oberfläche den Unterschied zwischen „keine Notiz" und „nicht für
 * dich" benennen kann statt ein leeres Feld anzubieten, dessen Speichern
 * fremden Text löschen würde.
 */
create or replace function speaker_detail(p_profile_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_sp speaker_profile%rowtype; v_p person%rowtype; v_team boolean;
begin
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not can_manage_speaker(p_profile_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_p from person where id = v_sp.person_id;
  v_team := is_speaker_team(v_sp.edition_id);

  return jsonb_build_object(
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
    'internal_notes_visible', v_team,
    'created_at', v_sp.created_at,
    'updated_at', v_sp.updated_at
  ) || case when v_team then jsonb_build_object('internal_notes', v_sp.internal_notes) else '{}'::jsonb end;
end $$;

-- ---------------------------------------------------------------- Nachtrag 0099

/**
 * `manager_speakers` gibt die interne Notiz wieder heraus.
 *
 * 0099 hat den Rückgabetyp um Zusagedatum, Absagedatum und Absagegrund
 * erweitert und dabei `internal_notes` verloren — die Spalte stand seit 0037
 * drin. Folge: im Lead-Portal stand das Notizfeld leer da, und wer hineinschrieb,
 * überschrieb eine Notiz, die er nie gesehen hatte. Dasselbe Muster, das beim
 * Ernährungsfeld vermieden wurde: ein Formular darf nichts speichern, was es
 * nicht anzeigen kann.
 */
drop function if exists manager_speakers(uuid);

create or replace function manager_speakers(p_edition_id uuid default null)
returns table (
  id uuid, person_id uuid, first_name text, last_name text, title text, email text,
  job_title text, organization_name text, speaker_type text, pipeline_status text,
  owner_person_id uuid, owner_name text, reception_eligible boolean, travel_costs_covered boolean, travel_costs_approved boolean,
  hospitality_status text, hotel_tier text, pass_type text, lounge_access boolean, invited_at timestamptz,
  confirmed_at timestamptz, declined_at timestamptz, decline_reason text,
  assistant_name text, sessions jsonb, next_open jsonb, updated_at timestamptz, internal_notes text
)
language plpgsql stable security definer set search_path = public, extensions as $$
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
           (select btrim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')) from person a where a.id = sp.assistant_person_id),
           coalesce((select jsonb_agg(jsonb_build_object('session_id', se.id, 'title_de', se.title_de, 'title_en', se.title_en,
                                                          'publish_status', se.publish_status, 'start_at', sl.start_at, 'stage_name', st.name)
                                       order by sl.start_at nulls last)
                     from session_speaker ss join session se on se.id = ss.session_id join event e on e.id = se.event_id
                     left join slot sl on sl.id = se.slot_id left join stage st on st.id = sl.stage_id
                     where ss.person_id = sp.person_id and (e.edition_id = sp.edition_id or e.id = sp.edition_id)), '[]'::jsonb),
           speaker_next_steps(sp.id)->'open',
           sp.updated_at, sp.internal_notes
    from speaker_profile sp
    join person p on p.id = sp.person_id
    left join vocab_term v on v.vocabulary = 'speaker_pipeline' and v.key = sp.pipeline_status
    where (p_edition_id is null or sp.edition_id = p_edition_id)
      and p.deleted_at is null
      and can_manage_speaker(sp.id)
    order by v.sort_order nulls last, p.last_name nulls last, p.first_name nulls last;
end $$;

select harden_definer_functions();
