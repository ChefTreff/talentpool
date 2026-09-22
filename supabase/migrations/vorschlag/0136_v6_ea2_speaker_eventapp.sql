-- 0136 · EA2 Speaker in die Event-App: Quelle und Rückverweis
-- Zweck: Bestätigte Speaker-Profile sollen als Personen mit Speaker-Pass in
-- Swapcard stehen (Arbeitsauftrag Welle 6, Arbeitspaket EA, Teil EA2). Diese
-- Migration liefert die Leseliste dafür und den Rückverweis je Person.
--
-- **Keine eigene Einwilligung.** Konrad, 22.09.2026: „Es braucht keine
-- Einwilligung für das Profil in der Event-App, das wird automatisch mit der
-- Zusage gegeben, also einfach immer übertragen." Grundlage ist damit
-- `speaker_profile.confirmed_at` — wer zugesagt hat, steht mit Profil in der App.
-- Die Liste filtert entsprechend auf bestätigte, nicht abgesagte Profile und
-- kennt keinen `consent_state` mehr. (`photo_video` und `speaker_release` bleiben
-- unberührt; sie regeln Aufnahmen und Folienveröffentlichung, nicht das Profil.)
-- Für **Teilnehmende** (EA4) gilt das nicht — dort gibt es keine Zusage, und die
-- Einwilligung „Weitergabe an die Event-App" bleibt Bedingung.
--
-- **Das Foto geht mit.** Konrad, 22.09.2026: „bitte einen unauffindbaren,
-- öffentlichen Link erzeugen, damit das Foto übertragen wird, das brauchen wir
-- auf jeden Fall in der App." Dafür der öffentliche Bucket `speaker-photos`,
-- genau wie `partner-logos` (0057): Lesen über die öffentliche Adresse, Schreiben
-- nur `service_role`, **keine** Policies für anon oder authenticated. Der Pfad ist
-- `<edition>/<asset_id>.<endung>` — die Asset-Kennung ist eine UUID, also nicht
-- erratbar und nicht aufzählbar, und der Pfad **nennt weder Namen noch
-- Personen-Kennung**. Eine neue Fassung bekommt eine neue Adresse, eine
-- zurückgezogene bleibt nicht unter der alten erreichbar.

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

-- 2 · Öffentlicher Bucket für die Profilfotos -------------------------------------
-- Wie `partner-logos` (0057): Lesen über die öffentliche Adresse, Schreiben nur
-- `service_role`. Bewusst **keine** Policies für anon/authenticated — wer die
-- Adresse nicht kennt, kommt nicht an die Datei, und niemand kann den Bucket
-- auflisten.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('speaker-photos', 'speaker-photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- 3 · Die Speaker, die in die App gehören -----------------------------------------
-- Beide Kontexte: das Team liest im Admin, der Lauf liest als Service Role
-- (Lehre 0120). `person` wird **nicht** als Ganzes herausgegeben — nur benannte
-- Spalten, keine Ernährungs- oder Gesundheitsangaben (db-konventionen §2).

create or replace function event_app_speakers(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(profile_id uuid, person_id uuid, edition_id uuid, edition_slug text, swapcard_event_id text,
               first_name text, last_name text, email text, job_title text, organization text,
               bio_short_de text, bio_short_en text, website text,
               photo_path text, photo_asset_id uuid, photo_mime text, has_photo boolean,
               pipeline_status text, swapcard_person_id text)
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
     where sp.confirmed_at is not null
       and sp.declined_at is null
       and (p_edition_id is null or sp.edition_id = p_edition_id)
       and (p_edition_id is not null or e.swapcard_event_id is not null)
     order by p.last_name, p.first_name;
end $$;

-- 4 · `consent_current` entschied bei Gleichstand zufällig ------------------------
-- Fund beim Testen der ersten Fassung dieser Migration (die noch auf die
-- Einwilligung sah; Konrad hat sie am 22.09. für Speaker abgeschafft, der Fund
-- bleibt aber gültig — die Sicht traegt **alle** Einwilligungen): sie nimmt
-- `distinct on (person_id, consent_type) … order by granted_at desc` — bei **zwei
-- Einträgen mit demselben `granted_at`** ist es dem Planer überlassen, welcher
-- gewinnt. Ein Widerruf, der in derselben Sekunde wie die Erteilung landet
-- (Formular mit Häkchen an und wieder aus, Import, Nachtrag von Hand), kann
-- deshalb stillschweigend verlorengehen — und an dieser Sicht hängen Newsletter,
-- Fotofreigabe und ab EA4 die Weitergabe an die Event-App.
-- Neu ist nur der Gleichstandsbrecher `created_at desc, id desc`; Spalten und
-- Bedeutung bleiben unverändert. Die Reihenfolge ist damit eindeutig: der
-- zuletzt geschriebene Eintrag gilt.

create or replace view consent_current as
  select distinct on (person_id, consent_type)
         person_id, consent_type, version, granted, granted_at, revoked_at
    from consent_record
   order by person_id, consent_type, granted_at desc, created_at desc, id desc;

select harden_definer_functions();
