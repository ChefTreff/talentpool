create or replace function sanity_speakers(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(person_id uuid, profile_id uuid, edition_id uuid, edition_slug text, edition_start date, first_name text, last_name text, job_title text, organization text, bio_short_de text, bio_short_en text, website text, linkedin text, photo_path text, photo_asset_id uuid, photo_mime text, pipeline_status text, has_release boolean, has_photo_video boolean, released boolean, is_test boolean, sessions jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
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
