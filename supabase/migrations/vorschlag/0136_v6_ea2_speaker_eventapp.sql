-- 0136 · EA2 Speaker in die Event-App: Quelle und Rückverweis
-- Zweck: Bestätigte Speaker-Profile sollen als Personen mit Speaker-Pass in
-- Swapcard stehen (Arbeitsauftrag Welle 6, Arbeitspaket EA, Teil EA2). Diese
-- Migration liefert die Leseliste dafür und den Rückverweis je Person.
--
-- **Einwilligung ist die Bedingung, nicht eine Prüfung im Anwendungscode.**
-- Konrad, 21.09.2026: nur Personen mit der Einwilligung „Weitergabe an die
-- Event-App" gehen nach Swapcard, Widerruf heisst Entfernen. Die Liste gibt
-- deshalb **beides** zurück: wer hinaus darf und wer zurückgehalten wird
-- (`consent_state` mit drei Zuständen) — ein Lauf, der Leute stillschweigend
-- überspringt, sieht fehlerfrei aus und ist falsch. `consent_record.consent_type`
-- trägt keinen CHECK, der neue Wert `event_app` braucht also keine
-- Schemaänderung; die **Erhebung** selbst (Texte DE/EN, Bewerbung,
-- Ticket-Redirect, Speaker-Onboarding) ist ein eigener Baustein und liegt hier
-- bewusst nicht mit drin.
--
-- Abweichungen: **kein Foto im Lauf.** `speaker_asset` liegt im privaten Bucket,
-- Swapcard braucht eine frei abrufbare Adresse. Für Partnerlogos gibt es dafür
-- den öffentlichen Bucket `partner-logos` (0057); dasselbe für Personenfotos ist
-- eine Datenschutzentscheidung und keine Bauentscheidung. Die Liste liefert
-- Pfad und Kennzeichen, der Lauf schickt sie noch nicht.
-- Keine Abhängigkeit zu anderen offenen Migrationen: der Personenverweis ist eine
-- eigene Funktion, `set_event_app_ref` wird nicht angefasst.

set search_path = public, extensions;

-- 1 · Rückverweis für Personen -----------------------------------------------------
-- Eigene Funktion statt `set_event_app_ref` erweitert: dort ist `object_id` eine
-- **Teilnahme** (`org_edition`), hier eine **Person**. Eine Funktion, die je nach
-- Art etwas anderes in dieselbe Spalte schreibt, ist der Anfang von Zeilen, die
-- auf nichts zeigen.

create or replace function set_event_app_person_ref(p_person_id uuid, p_system text, p_external_id text, p_meta jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  -- Servermuster: der Lauf läuft unter der Service Role, wo `has_role()` immer
  -- false ist (Lehre 0120). Aus einem angemeldeten Kontext ist der Weg zu.
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_system not in ('swapcard') then raise exception 'invalid_system' using errcode = '22023', detail = p_system; end if;
  if nullif(btrim(coalesce(p_external_id, '')), '') is null then raise exception 'external_id_required' using errcode = '22023'; end if;
  if not exists (select 1 from person where id = p_person_id and deleted_at is null) then
    raise exception 'person_not_found' using errcode = 'P0002', detail = coalesce(p_person_id::text, 'null');
  end if;
  insert into external_ref (system, object_type, object_id, external_id, meta)
  values (p_system, 'person', p_person_id, btrim(p_external_id), coalesce(p_meta, '{}'::jsonb))
  on conflict (system, object_type, object_id) do update set external_id = excluded.external_id, meta = excluded.meta, updated_at = now();
end $$;
revoke execute on function set_event_app_person_ref(uuid, text, text, jsonb) from public, anon, authenticated;

-- 2 · Die Speaker, die in die App gehören -----------------------------------------
-- Beide Kontexte: das Team liest im Admin, der Lauf liest als Service Role
-- (Lehre 0120). `person` wird **nicht** als Ganzes herausgegeben — nur benannte
-- Spalten, keine Ernährungs- oder Gesundheitsangaben (db-konventionen §2).

create or replace function event_app_speakers(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(profile_id uuid, person_id uuid, edition_id uuid, edition_slug text, swapcard_event_id text,
               first_name text, last_name text, email text, job_title text, organization text,
               bio_short_de text, bio_short_en text, website text,
               photo_path text, has_photo boolean,
               consent_state text, pipeline_status text, swapcard_person_id text)
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
           a.storage_path, a.storage_path is not null,
           -- Drei Zustände statt eines Wahrheitswerts: „erteilt", „widerrufen"
           -- und „nie gefragt" sind für die Oberfläche verschiedene Aufgaben.
           case when c.granted then 'granted'
                when c.person_id is not null then 'revoked'
                else 'missing' end,
           sp.pipeline_status,
           (select r.external_id from external_ref r
             where r.system = 'swapcard' and r.object_type = 'person' and r.object_id = p.id)
      from speaker_profile sp
      join person p on p.id = sp.person_id and p.deleted_at is null
      join event e on e.id = sp.edition_id
      left join person_email pe on pe.person_id = p.id and pe.is_primary
      left join organization o on o.id = sp.org_id
      left join speaker_asset a on a.profile_id = sp.id and a.kind = 'photo' and a.is_current
      left join lateral (select cc.person_id, cc.granted from consent_current cc
                          where cc.person_id = p.id and cc.consent_type = 'event_app') c on true
     where sp.confirmed_at is not null
       and sp.declined_at is null
       and (p_edition_id is null or sp.edition_id = p_edition_id)
       and (p_edition_id is not null or e.swapcard_event_id is not null)
     order by p.last_name, p.first_name;
end $$;

-- 3 · `consent_current` entschied bei Gleichstand zufällig ------------------------
-- Fund beim Testen von Teil 2: die Sicht nimmt
-- `distinct on (person_id, consent_type) … order by granted_at desc` — bei **zwei
-- Einträgen mit demselben `granted_at`** ist es dem Planer überlassen, welcher
-- gewinnt. Ein Widerruf, der in derselben Sekunde wie die Erteilung landet
-- (Formular mit Häkchen an und wieder aus, Import, Nachtrag von Hand), kann
-- deshalb stillschweigend verlorengehen — und diese Sicht ist das Tor, an dem
-- entschieden wird, ob personenbezogene Daten nach Swapcard gehen.
-- Neu ist nur der Gleichstandsbrecher `created_at desc, id desc`; Spalten und
-- Bedeutung bleiben unverändert. Die Reihenfolge ist damit eindeutig: der
-- zuletzt geschriebene Eintrag gilt.

create or replace view consent_current as
  select distinct on (person_id, consent_type)
         person_id, consent_type, version, granted, granted_at, revoked_at
    from consent_record
   order by person_id, consent_type, granted_at desc, created_at desc, id desc;

select harden_definer_functions();
