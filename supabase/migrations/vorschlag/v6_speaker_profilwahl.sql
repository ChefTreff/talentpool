-- 00NN · SPK-071: Profilwahl im Speaker-Portal für Konten mit mehreren Profilen
--
-- Vorschlag der Build-Session Speaker-Domäne. Nummer, Anwenden, Umbenennen und
-- der Eintrag ins Entscheidungslog gehören der Architektur-Session.
--
-- Anlass: SPK-071 (aus PART-091, #219): `my_speaker_profile_id` gibt einem
-- Konto genau ein Profil — das eigene zuerst, sonst das neueste. Ein
-- Operations-Kontakt, der mehrere Speaker eines Partners verwaltet, sah nur
-- einen, und Konrad (eigenes Profil plus verwaltete) immer nur sein eigenes.
--
-- Neu:
--   * `speaker_portal_selection` (Person → Profil): die gemerkte Wahl. RLS an,
--     keine Grants — gelesen und geschrieben nur über die Funktionen unten.
--   * `my_speaker_profiles()`: alle Profile, für die die Person im Portal
--     arbeiten darf (eigenes und als Assistenz oder Kontakt mit Zugang), mit
--     `selected` — daraus baut das Portal den Wechsler.
--   * `set_my_speaker_profile(profile)`: merkt die Wahl, nur für ein Profil,
--     für das die Person arbeiten darf.
--   * `my_speaker_profile_id`: nimmt die gemerkte Wahl, solange sie gilt (Recht
--     noch da, Edition passt) — sonst wie bisher das eigene, dann das neueste.
--     Damit folgen alle 18 Funktionen, die sie schon nutzen, der Wahl.
--   * `my_speaker_profile`, `update_my_speaker_profile` (ohne `id`) und
--     `my_sessions` wählten bisher selbst — sie gehen jetzt über
--     `my_speaker_profile_id`. `my_sessions` zeigt die Sessions der gewählten
--     Person (alle Editionen wie bisher), nicht mehr die aller Profile gemischt.
--
-- Funktionen aus `supabase/snapshot/functions/`: `my_speaker_profile_id`,
-- `my_speaker_profile`, `update_my_speaker_profile`, `my_sessions`.
-- Fehlerschlüssel unverändert (`speaker_not_found`, `not allowed`).

set search_path = public, extensions;

-- ---- 1 · Die gemerkte Wahl
create table if not exists speaker_portal_selection (
  person_id  uuid        primary key references person (id) on delete cascade,
  profile_id uuid        not null references speaker_profile (id) on delete cascade,
  updated_at timestamptz not null default now()
);
comment on table speaker_portal_selection is
  'SPK-071: welches Speaker-Profil eine Person im Speaker-Portal gerade bearbeitet (eigenes oder als Assistenz/Kontakt). Nur über set_my_speaker_profile und my_speaker_profile_id — keine Grants.';
alter table speaker_portal_selection enable row level security;
revoke all on speaker_portal_selection from public, anon, authenticated;

-- ---- 2 · Welches Profil gilt
create or replace function my_speaker_profile_id(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(
    -- SPK-071: die gemerkte Wahl — nur, solange das Recht noch besteht und die
    -- Edition passt. Sonst wie bisher.
    (select sp.id
       from speaker_portal_selection w
       join speaker_profile sp on sp.id = w.profile_id
      where w.person_id = current_person_id()
        and (sp.person_id = current_person_id() or is_speaker_assistant(sp.id, current_person_id()))
        and (p_edition_id is null or sp.edition_id = p_edition_id)),
    (select sp.id from speaker_profile sp
      where (sp.person_id = current_person_id() or is_speaker_assistant(sp.id, current_person_id()))
        and (p_edition_id is null or sp.edition_id = p_edition_id)
      order by (sp.person_id = current_person_id()) desc, sp.created_at desc limit 1))
$$;

create or replace function my_speaker_profiles()
 RETURNS TABLE(profile_id uuid, edition_id uuid, edition_name text, first_name text, last_name text, own boolean, selected boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select sp.id, sp.edition_id, e.name, p.first_name, p.last_name,
         sp.person_id = current_person_id(),
         sp.id is not distinct from my_speaker_profile_id()
    from speaker_profile sp
    join person p on p.id = sp.person_id and p.deleted_at is null
    join event e on e.id = sp.edition_id
   where current_person_id() is not null
     and (sp.person_id = current_person_id() or is_speaker_assistant(sp.id, current_person_id()))
   order by (sp.person_id = current_person_id()) desc, e.start_date desc nulls last,
            p.last_name nulls last, p.first_name nulls last
$$;

create or replace function set_my_speaker_profile(p_profile_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id();
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from speaker_profile sp where sp.id = p_profile_id) then
    raise exception 'speaker_not_found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from speaker_profile sp
                  where sp.id = p_profile_id
                    and (sp.person_id = v_me or is_speaker_assistant(sp.id, v_me))) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into speaker_portal_selection (person_id, profile_id, updated_at)
  values (v_me, p_profile_id, now())
  on conflict (person_id) do update set profile_id = excluded.profile_id, updated_at = now();
  return p_profile_id;
end $$;

-- ---- 3 · Portal-Funktionen folgen der Wahl
create or replace function my_speaker_profile(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_sp speaker_profile%rowtype; v_p person%rowtype;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  -- SPK-071: das Profil, das die Person im Portal gewählt hat (sonst wie bisher).
  select * into v_sp from speaker_profile sp where sp.id = my_speaker_profile_id(p_edition_id);
  if not found then return null; end if;
  select * into v_p from person where id = v_sp.person_id;
  return jsonb_build_object(
    -- Kontakt ohne Portalzugang (0127): Agentur oder Office, das die
    -- Speakerin angeschrieben haben moechte. Steht am Profil, nicht als
    -- eigene Person — sonst waechst die Personentabelle um Karteileichen.
    'contact', case when v_sp.contact_first_name is null and v_sp.contact_last_name is null
                     and v_sp.contact_email is null and v_sp.contact_phone is null
                    then null
                    else jsonb_build_object(
                      'first_name', v_sp.contact_first_name, 'last_name', v_sp.contact_last_name,
                      'email', v_sp.contact_email, 'phone', v_sp.contact_phone,
                      'kind', v_sp.contact_kind, 'consent_at', v_sp.contact_consent_at) end,
    'id', v_sp.id, 'edition_id', v_sp.edition_id, 'is_assistant', (v_sp.person_id <> v_me),
    'edition_name', (select e.name from event e where e.id = v_sp.edition_id),
    'speaker_type', v_sp.speaker_type, 'pipeline_status', v_sp.pipeline_status,
    'job_title', v_sp.job_title, 'organization_name', v_sp.organization_name,
    'bio_short_en', v_sp.bio_short_en, 'bio_short_de', v_sp.bio_short_de,
    'bio_long_en', v_sp.bio_long_en, 'bio_long_de', v_sp.bio_long_de,
    'socials', v_sp.socials, 'tech_rider', v_sp.tech_rider,
    'reception_eligible', v_sp.reception_eligible, 'lounge_access', v_sp.lounge_access,
    'pass_type', v_sp.pass_type, 'hotel_tier', v_sp.hotel_tier, 'hospitality_status', v_sp.hospitality_status,
    'travel_costs_covered', v_sp.travel_costs_covered, 'travel_costs_approved', (v_sp.travel_costs_approved_at is not null),
    'invited_at', v_sp.invited_at,
    'contacts', (select coalesce(jsonb_agg(jsonb_build_object(
                            'id', c.id, 'kind', c.kind, 'first_name', c.first_name,
                            'last_name', c.last_name, 'email', c.email, 'phone', c.phone,
                            'has_access', c.has_access, 'consent_at', c.consent_at)
                          order by c.kind, c.created_at), '[]'::jsonb)
                   from speaker_contact c where c.profile_id = v_sp.id),
    'assistant', case when v_sp.assistant_person_id is null then null else (
       select jsonb_build_object('person_id', a.id, 'first_name', a.first_name, 'last_name', a.last_name,
                                 'email', (select pe.email::text from person_email pe where pe.person_id = a.id and pe.is_primary))
       from person a where a.id = v_sp.assistant_person_id) end,
    'person', jsonb_build_object(
       'id', v_p.id, 'first_name', v_p.first_name, 'last_name', v_p.last_name, 'title', v_p.title,
       'linkedin_url', v_p.linkedin_url,
       'preferred_language', v_p.preferred_language, 'phone_e164', v_p.phone_e164,
       'email', (select pe.email::text from person_email pe where pe.person_id = v_p.id and pe.is_primary)),
    'photo_asset_id', v_sp.photo_asset_id,
    'consents', (select coalesce(jsonb_object_agg(c.consent_type, c.granted), '{}'::jsonb) from consent_current c
                 where c.person_id = v_p.id and c.consent_type in ('photo_video', 'speaker_release', 'slides_publication', 'hospitality_data')),
    'next_steps', speaker_next_steps(v_sp.id)
  );
end $$;

create or replace function update_my_speaker_profile(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id(); v_sp speaker_profile%rowtype;
  v_id uuid := nullif(p_data->>'id', '')::uuid;
  v_kontakt_vor text; v_kontakt_nach text; v_kontakt_mail text;
  v_kontakt_tel text; v_kontakt_art text; v_kontakt_ok date; v_hat_kontakt boolean;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  -- SPK-071: ohne `id` das gewählte Profil (sonst wie bisher).
  select * into v_sp from speaker_profile sp
   where sp.id = coalesce(v_id, my_speaker_profile_id())
     and (sp.person_id = v_me or is_speaker_assistant(sp.id, v_me))
   for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;

  -- Kontakt ohne Portalzugang (0127). Die sechs Felder gehoeren zusammen:
  -- erst wird ausgerechnet, was nach dem Schreiben dastuende, dann geprueft.
  -- Sonst scheitert eine reine Namenskorrektur an der Einwilligung (dieselbe
  -- Lehre wie bei `upsert_edition_contact`, 0114).
  v_kontakt_vor  := nullif(btrim(coalesce(case when p_data ? 'contact_first_name' then p_data->>'contact_first_name' else v_sp.contact_first_name end, '')), '');
  v_kontakt_nach := nullif(btrim(coalesce(case when p_data ? 'contact_last_name'  then p_data->>'contact_last_name'  else v_sp.contact_last_name  end, '')), '');
  v_kontakt_mail := nullif(btrim(coalesce(case when p_data ? 'contact_email'      then p_data->>'contact_email'      else v_sp.contact_email::text end, '')), '');
  v_kontakt_tel  := nullif(btrim(coalesce(case when p_data ? 'contact_phone'      then p_data->>'contact_phone'      else v_sp.contact_phone      end, '')), '');
  v_kontakt_art  := nullif(btrim(coalesce(case when p_data ? 'contact_kind'       then p_data->>'contact_kind'       else v_sp.contact_kind       end, '')), '');
  v_kontakt_ok   := case when p_data ? 'contact_consent_at'
                         then nullif(btrim(p_data->>'contact_consent_at'), '')::date
                         else v_sp.contact_consent_at end;
  v_hat_kontakt  := coalesce(v_kontakt_vor, v_kontakt_nach, v_kontakt_mail, v_kontakt_tel) is not null;

  if v_kontakt_art is not null and not is_vocab_key('speaker_contact_kind', v_kontakt_art) then
    raise exception 'invalid_contact_kind' using errcode = '22023', detail = v_kontakt_art;
  end if;
  if v_hat_kontakt and v_kontakt_ok is null then
    -- Die Daten gehoeren einem Menschen, der hier kein Konto hat und nicht
    -- gefragt wurde. Ohne die Bestaetigung der Speakerin speichern wir sie
    -- nicht (Art. 6 DSGVO; eigener Schluessel, siehe Kopf).
    raise exception 'speaker_contact_consent_required' using errcode = '22023', detail = 'speaker_contact';
  end if;
  -- Wer alle Felder leert, nimmt den Kontakt zurueck — dann geht auch das
  -- Einwilligungsdatum, sonst bliebe ein Beleg ohne Gegenstand stehen.
  if not v_hat_kontakt then v_kontakt_ok := null; v_kontakt_art := null; end if;

  update speaker_profile set
    contact_first_name = v_kontakt_vor,
    contact_last_name  = v_kontakt_nach,
    contact_email      = v_kontakt_mail::citext,
    contact_phone      = v_kontakt_tel,
    contact_kind       = v_kontakt_art,
    contact_consent_at = v_kontakt_ok,
    job_title         = case when p_data ? 'job_title'         then nullif(btrim(p_data->>'job_title'), '')         else job_title end,
    organization_name = case when p_data ? 'organization_name' then nullif(btrim(p_data->>'organization_name'), '') else organization_name end,
    bio_short_en      = case when p_data ? 'bio_short_en'      then nullif(btrim(p_data->>'bio_short_en'), '')      else bio_short_en end,
    bio_short_de      = case when p_data ? 'bio_short_de'      then nullif(btrim(p_data->>'bio_short_de'), '')      else bio_short_de end,
    bio_long_en       = case when p_data ? 'bio_long_en'       then nullif(btrim(p_data->>'bio_long_en'), '')       else bio_long_en end,
    bio_long_de       = case when p_data ? 'bio_long_de'       then nullif(btrim(p_data->>'bio_long_de'), '')       else bio_long_de end,
    socials           = case when p_data ? 'socials'    and jsonb_typeof(p_data->'socials') = 'object'    then p_data->'socials'    else socials end,
    tech_rider        = case when p_data ? 'tech_rider' and jsonb_typeof(p_data->'tech_rider') = 'object' then p_data->'tech_rider' else tech_rider end
  where id = v_sp.id;

  update person set
    first_name         = case when p_data ? 'first_name'         then nullif(btrim(p_data->>'first_name'), '')         else first_name end,
    last_name          = case when p_data ? 'last_name'          then nullif(btrim(p_data->>'last_name'), '')          else last_name end,
    title              = case when p_data ? 'title'              then nullif(btrim(p_data->>'title'), '')              else title end,
    linkedin_url       = case when p_data ? 'linkedin_url'       then nullif(btrim(p_data->>'linkedin_url'), '')       else linkedin_url end,
    phone_e164         = case when p_data ? 'phone_e164'         then nullif(btrim(p_data->>'phone_e164'), '')         else phone_e164 end,
    preferred_language = case when p_data ? 'preferred_language' and p_data->>'preferred_language' in ('de', 'en') then p_data->>'preferred_language' else preferred_language end
  where id = v_sp.person_id;

  if v_sp.person_id <> v_me then
    perform log_audit('speaker.assistant_update', 'speaker_profile', v_sp.id::text, null, p_data - 'id');
  end if;
  return v_sp.id;
end $$;

create or replace function my_sessions()
 RETURNS TABLE(session_id uuid, event_id uuid, event_name text, title_de text, title_en text, description_de text, description_en text, language text, format text, access_mode text, publish_status text, speaker_role text, confirmed boolean, start_at timestamp with time zone, end_at timestamp with time zone, stage_name text, room text, timezone text, co_speakers jsonb, latest_submission jsonb, on_behalf_of jsonb, tech jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select se.id, se.event_id, e.name, se.title_de, se.title_en, se.description_de, se.description_en,
         se.language, se.format, se.access_mode, se.publish_status, ss.role, ss.confirmed,
         sl.start_at, sl.end_at, st.name, st.room, e.timezone,
         coalesce((select jsonb_agg(jsonb_build_object('person_id', p2.id, 'first_name', p2.first_name, 'last_name', p2.last_name, 'role', ss2.role) order by ss2.sort_order)
                   from session_speaker ss2 join person p2 on p2.id = ss2.person_id
                   where ss2.session_id = se.id and ss2.person_id <> ss.person_id), '[]'::jsonb),
         (select to_jsonb(sub) from (
            select s.id, s.title, s.description, s.topics, s.language, s.notes, s.status, s.review_note, s.created_at, s.reviewed_at,
                   -- SPK-050: ob vor dieser Einreichung schon eine übernommen wurde.
                   exists (select 1 from session_submission s0
                            where s0.session_id = s.session_id and s0.status = 'approved'
                              and s0.created_at < s.created_at) as is_change
            from session_submission s where s.session_id = se.id order by s.created_at desc limit 1) sub),
         case when sp.person_id <> current_person_id()
              then jsonb_build_object('person_id', sp.person_id, 'first_name', p.first_name, 'last_name', p.last_name) end,
         coalesce(se.tech, '{}'::jsonb)
  from speaker_profile sp
  join person p on p.id = sp.person_id
  join session_speaker ss on ss.person_id = sp.person_id
  join session se on se.id = ss.session_id
  join event e on e.id = se.event_id and (e.edition_id = sp.edition_id or e.id = sp.edition_id)
  left join slot sl on sl.id = se.slot_id
  left join stage st on st.id = sl.stage_id
  where (sp.person_id = current_person_id() or is_speaker_assistant(sp.id, current_person_id()))
    -- SPK-071: die Sessions der gewählten Person, nicht die aller Profile gemischt.
    and sp.person_id = (select x.person_id from speaker_profile x where x.id = my_speaker_profile_id())
  order by sl.start_at nulls last, se.title_de
$$;

select harden_definer_functions();
