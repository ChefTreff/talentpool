-- 0185 · Eine Wahrheit für „bestätigt“: Export nach Pipeline-Status, Trigger für confirmed_at (QS-049)
-- Angewendet von der Architektur-Session am 25.09.2026 als 20260925084741.
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: QS-049, gefunden am 25.09.2026 bei der vivenu-Kettenpruefung (SPK-068). Zwei Stellen
-- beantworteten die Frage „ist dieser Speaker bestaetigt?" verschieden:
--   * `event_app_speakers` (Swapcard-Export):      `confirmed_at is not null`
--   * `speaker_profile_tickets_sync` (Freiticket): `speaker_is_confirmed(pipeline_status)`
-- Im Produktivweg halten sie zusammen, weil `set_speaker_pipeline` beides setzt. Jeder Weg daneben
-- trennt sie **lautlos**: beide Testprofile standen auf `pipeline_status = 'confirmed'` ohne
-- `confirmed_at`, hatten ein Ticket und fehlten im Export in die Event-App. Der Altdaten-Import ist
-- genau so ein Weg. Entscheidung der Architektur-Session (25.09.): es gilt der **Pipeline-Status**.
--
-- Drei Teile:
--   1. `event_app_speakers` filtert `speaker_is_confirmed(sp.pipeline_status) and declined_at is null`.
--   2. Trigger `trg_speaker_profile_confirmed_at`: sobald der Status als bestaetigt gilt, steht
--      `confirmed_at` — `coalesce(confirmed_at, now())`, der erste Zeitpunkt gewinnt. Damit bleiben
--      `manager_speakers`, `speaker_detail` und `speaker_leads_admin` richtig, die den Zeitstempel
--      anzeigen, und **jeder** Schreibweg haelt beides zusammen, nicht nur `set_speaker_pipeline`.
--   3. Nachtrag fuer den Bestand: wo der Status bestaetigt ist und der Zeitstempel fehlt, wird er
--      aus `updated_at` (ersatzweise `created_at`) gesetzt — eine Naeherung, aber eine ehrlichere
--      als `now()`, das alle Bestaetigungen auf den Migrationszeitpunkt legen wuerde.
--
-- **Der Trigger hoert bewusst auf jedes Update**, nicht nur auf `update of pipeline_status`: eine
-- Spaltenliste wuerde genau den Fall verfehlen, der hier geschlossen wird — jemand setzt
-- `confirmed_at` auf NULL, ohne den Status anzufassen. Die Funktion ist zwei Vergleiche lang.
--
-- **Zurueckgestuft wird der Zeitstempel nicht.** Geht der Status zurueck auf `lead`, bleibt
-- `confirmed_at` stehen: es beantwortet „wann zum ersten Mal zugesagt" (so steht es auch am
-- Spaltenkommentar) und ist keine Statuskopie. Aus dem Export faellt die Person trotzdem, weil der
-- jetzt den Status fragt.
--
-- Rechte unveraendert: `event_app_speakers` bleibt SECURITY DEFINER mit der bestehenden Pruefung
-- (`is_speaker_team(null) or is_partner_team()`), der Trigger ist eine gewoehnliche Funktion mit
-- gepinntem `search_path` — wie `speaker_profile_check()` daneben.
-- Basis: `supabase/snapshot/functions/event_app_speakers.sql` (Konvention §1).
-- Test: `supabase/tests/v6_bestaetigt_eine_wahrheit.sql`.

-- 1 · Export fragt den Status
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
       and (p_edition_id is null or sp.edition_id = p_edition_id)
       and (p_edition_id is not null or e.swapcard_event_id is not null)
     order by p.last_name, p.first_name;
end $$;


-- 2 · Zeitstempel an den Status koppeln
create or replace function speaker_profile_confirmed_at()
 returns trigger
 language plpgsql
 set search_path to 'public', 'extensions'
as $$
begin
  if speaker_is_confirmed(new.pipeline_status) then
    new.confirmed_at := coalesce(new.confirmed_at, now());
  end if;
  return new;
end $$;

drop trigger if exists trg_speaker_profile_confirmed_at on speaker_profile;
create trigger trg_speaker_profile_confirmed_at
  before insert or update on speaker_profile
  for each row execute function speaker_profile_confirmed_at();

-- 3 · Bestand nachziehen (siehe Kopf: Naeherung aus updated_at/created_at)
update speaker_profile
   set confirmed_at = coalesce(updated_at, created_at, now())
 where speaker_is_confirmed(pipeline_status)
   and confirmed_at is null;

select harden_definer_functions();
