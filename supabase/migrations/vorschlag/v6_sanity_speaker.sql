-- v6_sanity_speaker · Speaker für die Website (Sanity): Lesezugang mit Tor und Weg hinaus (SPK-046)
--
-- Zweck: Konrad 23.09.: „extrem wichtige Funktion … Wir müssen auch die Speaker dort automatisch hochladen.“
-- Abweichung vom Masterplan seit 24.09. im Entscheidungslog (Zuschnitt der Architektur-Session). Das Portal
-- schreibt je Person ein Dokument `portalSpeaker` (`speaker-<person_id>`) in das Website-Dataset —
-- Kontrakt `docs/sanity-speaker-kontrakt.md`, geschrieben wird nach dem Muster der Partner-Logos
-- (`docs/runbooks/sanity-partner-logos.md`, 0062: `external_ref` merkt sich Dokument-ID und Fassung).
--
-- Teile:
--   * `sanity_speakers(edition)` — **nur Server**: alle bestätigten Speaker (ohne Absage, ohne Gäste der
--     Standbühne) mit genau den Feldern, die auf die Website dürfen, dazu das **Tor als drei Werte**:
--     `has_release` (Einwilligung `speaker_release`, „Speaker-Freigabe (Name/Bild/Bio)“), `has_photo_video`
--     (Einwilligung `photo_video`) und `released` (Team-Freigabe: Pipeline `published` oder `attended`).
--     Erst wenn alle drei gelten, entsteht ein Dokument (Entscheidungslog 24.09., zweiteiliges Tor). Wer
--     bestätigt ist, aber eines nicht erfüllt, kommt trotzdem zurück — die Vorschau nennt ihn mit Grund,
--     statt ihn still wegzulassen. `is_test` markiert Testprofile (`testdaten:` in der internen Notiz,
--     `scripts/testdaten-konrad.mjs`); sie gehen nie auf die öffentliche Website.
--     **Nie dabei:** Mailadresse, Telefon, Anschrift, Notizen, Pipeline-Einordnung, Reise, Hotel, Spesen,
--     Tickets, Ernährung, Assistenz- und Agenturkontakte. `person` nur mit Vor- und Nachname und LinkedIn
--     (Konvention §2), Organisation mit demselben Rückfall wie `event_app_speakers`.
--   * `delete_external_ref(system, typ, objekt)` — **nur Server**: der Weg hinaus. Widerruf, Absage,
--     Entzug der Freigabe oder Löschung der Person entfernen das Dokument; danach fällt die Merkzeile.
--     `external_ref` hat keinen Fremdschlüssel zur Person und übersteht `anonymize_person` — so bleibt der
--     Weg zum Dokument erhalten, bis es weg ist.
--
-- Abweichungen: keine weiteren. Anlegen und Ändern laufen nur per Admin-Knopf mit Vorschau; das Entfernen
-- nach Widerruf läuft zusätzlich im Cron (Entscheidung 24.09.: „Weg hinaus automatisch“).
set search_path = public, extensions;

create or replace function sanity_speakers(p_edition_id uuid default null)
returns table (
  person_id uuid, profile_id uuid, edition_id uuid, edition_slug text, edition_start date,
  first_name text, last_name text, job_title text, organization text,
  bio_short_de text, bio_short_en text, website text, linkedin text,
  photo_path text, photo_asset_id uuid, photo_mime text,
  pipeline_status text, has_release boolean, has_photo_video boolean, released boolean,
  is_test boolean, sessions jsonb
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select p.id, sp.id, e.id, e.slug, e.start_date,
         nullif(btrim(p.first_name), ''), nullif(btrim(p.last_name), ''),
         nullif(btrim(sp.job_title), ''),
         coalesce(nullif(btrim(sp.organization_name), ''), nullif(btrim(o.communication_name), ''), nullif(btrim(o.legal_name), '')),
         nullif(btrim(sp.bio_short_de), ''), nullif(btrim(sp.bio_short_en), ''),
         nullif(btrim(coalesce(sp.socials->>'website', '')), ''),
         nullif(btrim(coalesce(p.linkedin_url, '')), ''),
         a.storage_path, a.id, a.mime,
         sp.pipeline_status,
         coalesce((select c.granted from consent_current c where c.person_id = p.id and c.consent_type = 'speaker_release'), false),
         coalesce((select c.granted from consent_current c where c.person_id = p.id and c.consent_type = 'photo_video'), false),
         sp.pipeline_status in ('published', 'attended'),
         -- Testprofile (`scripts/testdaten-konrad.mjs` kennzeichnet sie in der internen Notiz) gehen nie auf
         -- die öffentliche Website; nur das Merkmal kommt heraus, nicht die Notiz.
         coalesce(sp.internal_notes, '') like '%testdaten:%',
         -- Nur veröffentlichte Sessions, mit Titel und Bühne — keine Uhrzeit (Kontrakt: das Programm läuft
         -- über Swapcard; Zeiten an zwei Stellen wären an zwei Stellen falsch).
         coalesce((
           select jsonb_agg(jsonb_build_object('id', s.id, 'title_de', s.title_de, 'title_en', s.title_en, 'stage', s.stage)
                            order by s.start_at nulls last, s.title_de)
             from (select distinct se.id, se.title_de, se.title_en, st.name as stage, sl.start_at
                     from session_speaker ss
                     join session se on se.id = ss.session_id
                     join event ev on ev.id = se.event_id
                     left join slot sl on sl.id = se.slot_id
                     left join stage st on st.id = sl.stage_id
                    where ss.person_id = p.id
                      and se.publish_status = 'published'
                      and coalesce(ev.edition_id, ev.id) = sp.edition_id) s
         ), '[]'::jsonb)
    from speaker_profile sp
    join person p on p.id = sp.person_id and p.deleted_at is null
    join event e on e.id = sp.edition_id and e.is_edition
    left join organization o on o.id = sp.org_id
    left join speaker_asset a on a.profile_id = sp.id and a.kind = 'photo' and a.is_current
   where speaker_is_confirmed(sp.pipeline_status)
     and sp.declined_at is null
     -- PART-081/SPK-070: Gäste der Standbühne gehen nie auf die Website.
     and not sp.stage_guest
     and (p_edition_id is null or sp.edition_id = p_edition_id)
   order by p.last_name, p.first_name, e.start_date;
end $$;
revoke execute on function sanity_speakers(uuid) from public, anon, authenticated;

create or replace function delete_external_ref(p_system text, p_object_type text, p_object_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_n integer;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from external_ref r
   where r.system = p_system and r.object_type = p_object_type and r.object_id = p_object_id;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;
revoke execute on function delete_external_ref(text, text, uuid) from public, anon, authenticated;

select harden_definer_functions();
