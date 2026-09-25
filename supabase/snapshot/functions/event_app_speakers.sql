create or replace function event_app_speakers(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(profile_id uuid, person_id uuid, edition_id uuid, edition_slug text, swapcard_event_id text, first_name text, last_name text, email text, job_title text, organization text, bio_short_de text, bio_short_en text, website text, photo_path text, photo_asset_id uuid, photo_mime text, has_photo boolean, pipeline_status text, swapcard_person_id text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null and not coalesce(is_speaker_team(null) or is_partner_team(), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select sp.id, p.id, e.id, e.slug, e.swapcard_event_id,
           p.first_name, p.last_name, pe.email::text,
           sp.job_title,
           coalesce(nullif(btrim(sp.organization_name), ''), nullif(btrim(o.communication_name), ''), o.legal_name),
           sp.bio_short_de, sp.bio_short_en,
           nullif(btrim(coalesce(sp.socials->>'website', '')), ''),
           -- Kennung und Medientyp braucht der Lauf, um die öffentliche Kopie
           -- unter `<edition>/<asset_id>.<endung>` anzulegen.
           a.storage_path, a.id, a.mime, a.storage_path is not null,
           sp.pipeline_status,
           (select r.external_id from external_ref r
             where r.system = 'swapcard' and r.object_type = 'person' and r.object_id = p.id)
      from speaker_profile sp
      join person p on p.id = sp.person_id and p.deleted_at is null
      join event e on e.id = sp.edition_id
      left join person_email pe on pe.person_id = p.id and pe.is_primary
      left join organization o on o.id = sp.org_id
      left join speaker_asset a on a.profile_id = sp.id and a.kind = 'photo' and a.is_current
     -- QS-049: **eine** Wahrheit fuer „bestaetigt" — der Pipeline-Status.
     -- Vorher stand hier `confirmed_at is not null`, waehrend der Ticket-Trigger
     -- `speaker_is_confirmed(pipeline_status)` fragte. Solange nur
     -- `set_speaker_pipeline` schreibt, faellt das nicht auf; jeder Weg daneben
     -- (Testdaten, Altdaten-Import) trennt die beiden **lautlos**: der Speaker
     -- bekommt ein Ticket und fehlt in der Event-App. Gefunden am 25.09.2026
     -- bei der vivenu-Kettenpruefung — der Export war leer.
     where speaker_is_confirmed(sp.pipeline_status)
       and sp.declined_at is null
       -- PART-081: Gäste der Standbühne nur mit ihrer veröffentlichten Session am Slot.
       and (not sp.stage_guest or exists (
             select 1 from session_speaker ss join session se on se.id = ss.session_id
              where ss.person_id = sp.person_id and se.slot_id is not null and se.publish_status = 'published'
                and (se.event_id = sp.edition_id
                     or se.event_id in (select ev.id from event ev where ev.edition_id = sp.edition_id))))
       and (p_edition_id is null or sp.edition_id = p_edition_id)
       and (p_edition_id is not null or e.swapcard_event_id is not null)
     order by p.last_name, p.first_name;
end $$;
