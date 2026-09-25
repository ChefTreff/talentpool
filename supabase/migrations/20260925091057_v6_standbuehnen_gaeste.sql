-- 0188 · Standbühnen- und Talk-Gäste: stage_guest mit Sperren, Gästeliste, Zuordnung (PART-081, PART-088)
-- Angewendet von der Architektur-Session am 25.09.2026 als 20260925091057.
-- stage_guest_consent_at, CHECK, Sperren in invite_speaker, upsert_speaker, speaker_ticket_create,
-- speaker_profile_tickets_sync, event_app_speakers, partner_speakers, partner_add_speaker; Porträt-Upload
-- für den Partner (speaker_asset_path_allowed, register_speaker_asset); neue RPCs partner_stage_guests,
-- partner_add_stage_guest, partner_update_stage_guest, partner_remove_stage_guest,
-- partner_stage_guest_files, partner_assign_stage_guest
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: PART-081 (Konrad, Runde 21.09., bestätigt 24.09.), Vorschlag `docs/vorschlag-part081-standbuehnen-gaeste.md`
-- (#182), Konrads Antworten K-32 (25.09.): (1) Einlass über ein Ticket aus dem Partner-Kontingent, kein
-- Freiticket; (2) Gäste werden in der Event-App **als Speaker** angelegt, mit ihrer Session; (3) Porträt Pflicht;
-- (4) Gastprofil weg, Person bleibt. Auflage der Architektur-Session: Einwilligungs-Haken mit Zeitstempel beim
-- Anlegen (wie `consent_at` bei den Kontakten).
--
-- **Datenmodell.** Ein Gast ist ein `speaker_profile` mit `stage_guest = true` — `speaker_type` beschreibt die
-- Rolle auf der Bühne und taugt nicht als Kennzeichen. Der CHECK schließt jede Leistung eines Speakers aus
-- (Lounge, Empfang, Reisekosten, Hotel), verlangt die anlegende Organisation und die Einwilligung. Gäste stehen
-- auf `confirmed` mit `confirmed_at` (der Partner hat zugesagt); die Sperren unten verhindern Hub-Zugang und
-- Freiticket. `confirmed_at` setzt sonst nur `set_speaker_pipeline` — hier setzt es die Anlage, weil es für
-- einen Gast keinen Statuswechsel gibt.
--
-- **Swapcard.** `event_app_speakers` exportiert einen Gast nur, wenn er an einer **veröffentlichten** Session mit
-- Slot hängt — „als Speaker am Slot“ und erst, wenn der Programmpunkt im offiziellen Programm steht (PART-080).
-- Ob der Import in Swapcard eine Einladungsmail auslöst, prüft der Admin-Chat (K-32).
--
-- **Porträt.** Der Partner lädt es in den Bucket `speaker-assets` unter `<edition>/<profil>/photo/…` hoch.
-- `can_manage_speaker` bleibt unverändert — es öffnet Einladung, Pipeline und Speaker-Details und wäre für
-- Partner viel zu breit. Stattdessen erlaubt der interne Helfer `partner_manages_stage_guest` genau den
-- Foto-Pfad eines Gastes der eigenen Organisation (Storage-Policy über `speaker_asset_path_allowed`,
-- Registrierung über `register_speaker_asset`).
--
-- **Zuordnung.** `partner_assign_stage_guest` trägt einen Gast der eigenen Organisation an einem Programmpunkt ein
-- oder aus — auf der eigenen Standbühne (Recht des Boards) oder, nach PART-088 (Konrad 25.09.), an einem von der
-- Organisation gebuchten Talk (Partner-Recht): Talk-Speaker sind ebenfalls vom Partner angelegte Gäste, mit Profil
-- in der Event-App, ohne Portal, Onboarding und Kommunikation. Nicht `set_session_speakers`, das beliebige
-- Personen annimmt.
--
-- Bestehende Funktionen wortgleich aus `supabase/snapshot/functions/`, eingefügt sind nur die markierten Blöcke.
set search_path = public, extensions;

-- ---------------------------------------------------------------- 1) Kennzeichen, Einwilligung, CHECK

alter table speaker_profile add column if not exists stage_guest boolean not null default false;
alter table speaker_profile add column if not exists stage_guest_consent_at timestamptz;
comment on column speaker_profile.stage_guest is
  'Vom Partner angelegter Gast (PART-081 Standbühne, PART-088 Talk): erscheint in der Event-App als Speaker am veröffentlichten Programmpunkt, bekommt keinen Speaker-Zugang, kein Onboarding, keine Kommunikation, kein Freiticket, keine Lounge. Einlass über ein Ticket aus dem Partner-Kontingent.';
comment on column speaker_profile.stage_guest_consent_at is
  'Wann der Partner bestätigt hat, dass die Person informiert und einverstanden ist, dass Name, Position und Porträt in der Event-App erscheinen (Auflage der Architektur-Session zu K-32). Selbstauskunft, kein Nachweis — das Setzen steht mit Akteur im Audit-Log.';

alter table speaker_profile drop constraint if exists speaker_profile_stage_guest_chk;
alter table speaker_profile add constraint speaker_profile_stage_guest_chk check (
  not stage_guest or (
    not lounge_access and not reception_eligible and not travel_costs_covered
    and hospitality_status = 'none' and created_by_org_id is not null
    and stage_guest_consent_at is not null));

-- ---------------------------------------------------------------- 2) Interner Helfer

-- Darf die angemeldete Person dieses Gastprofil als Partner pflegen? Nur Gäste der eigenen Organisation.
create or replace function partner_manages_stage_guest(p_profile_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path = public, extensions
as $$
  select exists (select 1 from speaker_profile sp
                  where sp.id = p_profile_id and sp.stage_guest and sp.created_by_org_id is not null
                    and partner_can_edit(sp.created_by_org_id))
$$;
revoke execute on function partner_manages_stage_guest(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- 3) Sperren in bestehenden Funktionen

create or replace function invite_speaker(p_profile_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_mail bigint; v_actor uuid := current_person_id();
begin
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  -- PART-081: Gäste der Standbühne bekommen keinen Speaker-Zugang.
  if v_sp.stage_guest then raise exception 'stage_guest' using errcode = 'P0001'; end if;
  if not can_manage_speaker(p_profile_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_sp.pipeline_status not in ('confirmed', 'onboarded', 'ready', 'published') then
    raise exception 'not_confirmed' using errcode = 'P0001', detail = v_sp.pipeline_status;
  end if;
  insert into role_assignment (person_id, role, scope_type, edition_id, granted_by, note)
  values (v_sp.person_id, 'speaker', 'edition', v_sp.edition_id, v_actor, 'speaker_profile')
  on conflict (person_id, role, scope_type,
               coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(edition_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(portal, ''))
  do update set valid_to = null;
  v_mail := queue_mail('speaker_invite', v_sp.person_id,
    jsonb_build_object('edition_name', (select e.name from event e where e.id = v_sp.edition_id),
                       'inviter_name', coalesce((select p.first_name from person p where p.id = v_actor), 'ChefTreff')),
    'speaker_profile', v_sp.id);
  update speaker_profile set invited_at = now() where id = p_profile_id;
  perform log_audit('speaker.invite', 'speaker_profile', p_profile_id::text, null, jsonb_build_object('mail_log_id', v_mail));
  return v_mail;
end $$;

create or replace function upsert_speaker(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_actor uuid := current_person_id();
  v_edition uuid := nullif(p_data->>'edition_id', '')::uuid;
  v_pid uuid := nullif(p_data->>'person_id', '')::uuid;
  v_email citext := nullif(btrim(p_data->>'email'), '')::citext;
  v_type text := coalesce(nullif(p_data->>'speaker_type', ''), 'other');
  v_team boolean; v_id uuid; v_existing uuid; v_guest boolean;
begin
  if v_actor is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if v_edition is null or not exists (select 1 from event where id = v_edition and is_edition) then
    raise exception 'edition_required' using errcode = '22023';
  end if;
  v_team := is_speaker_team(v_edition);
  if not (v_team or has_role('speaker_manager')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not v_team and (p_data ?| array['lounge_access', 'pass_type', 'hotel_tier', 'hospitality_status', 'org_id', 'owner_person_id']) then
    raise exception 'team_only_fields' using errcode = '42501';
  end if;

  if v_pid is null then
    if v_email is null then raise exception 'email_or_person_required' using errcode = '22023'; end if;
    if is_suppressed(v_email::text) then raise exception 'suppressed' using errcode = 'P0001'; end if;
    select pe.person_id into v_pid from person_email pe join person p on p.id = pe.person_id
     where pe.email = v_email and p.deleted_at is null limit 1;
    if v_pid is null then
      insert into person (first_name, last_name, title, preferred_language, source_first, tier)
      values (nullif(btrim(p_data->>'first_name'), ''), nullif(btrim(p_data->>'last_name'), ''), nullif(btrim(p_data->>'title'), ''),
              case when p_data->>'preferred_language' in ('de', 'en') then p_data->>'preferred_language' end, 'speaker_leads', 'lead')
      returning id into v_pid;
      insert into person_email (person_id, email, is_primary, verified) values (v_pid, v_email, true, false);
    end if;
  elsif not exists (select 1 from person where id = v_pid and deleted_at is null) then
    raise exception 'person_not_found' using errcode = 'P0002';
  end if;

  select id into v_existing from speaker_profile where person_id = v_pid and edition_id = v_edition;

  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, owner_person_id, job_title, organization_name, org_id,
                               internal_notes, reception_eligible, travel_costs_covered, pass_type, lounge_access, hotel_tier, hospitality_status, created_by)
  values (v_pid, v_edition, v_type, coalesce(nullif(p_data->>'pipeline_status', ''), 'lead'),
          coalesce(nullif(p_data->>'owner_person_id', '')::uuid, v_actor),
          nullif(btrim(p_data->>'job_title'), ''), nullif(btrim(p_data->>'organization_name'), ''), nullif(p_data->>'org_id', '')::uuid,
          nullif(btrim(p_data->>'internal_notes'), ''),
          coalesce((p_data->>'reception_eligible')::boolean, false), coalesce((p_data->>'travel_costs_covered')::boolean, false),
          coalesce(nullif(p_data->>'pass_type', ''), case when v_type = 'masterclass_host' then 'professional' else 'speaker' end),
          coalesce((p_data->>'lounge_access')::boolean, v_type <> 'masterclass_host'),
          coalesce(nullif(p_data->>'hotel_tier', ''), 'standard'),
          coalesce(nullif(p_data->>'hospitality_status', ''), 'none'),
          v_actor)
  on conflict (person_id, edition_id) do update set
    speaker_type         = case when p_data ? 'speaker_type'         then v_type else speaker_profile.speaker_type end,
    pipeline_status      = coalesce(nullif(p_data->>'pipeline_status', ''), speaker_profile.pipeline_status),
    job_title            = case when p_data ? 'job_title'            then nullif(btrim(p_data->>'job_title'), '') else speaker_profile.job_title end,
    organization_name    = case when p_data ? 'organization_name'    then nullif(btrim(p_data->>'organization_name'), '') else speaker_profile.organization_name end,
    internal_notes       = case when p_data ? 'internal_notes'       then nullif(btrim(p_data->>'internal_notes'), '') else speaker_profile.internal_notes end,
    reception_eligible   = coalesce((p_data->>'reception_eligible')::boolean, speaker_profile.reception_eligible),
    travel_costs_covered = coalesce((p_data->>'travel_costs_covered')::boolean, speaker_profile.travel_costs_covered),
    owner_person_id      = coalesce(nullif(p_data->>'owner_person_id', '')::uuid, speaker_profile.owner_person_id),
    org_id               = case when p_data ? 'org_id' then nullif(p_data->>'org_id', '')::uuid else speaker_profile.org_id end,
    pass_type            = coalesce(nullif(p_data->>'pass_type', ''), speaker_profile.pass_type),
    lounge_access        = coalesce((p_data->>'lounge_access')::boolean, speaker_profile.lounge_access),
    hotel_tier           = coalesce(nullif(p_data->>'hotel_tier', ''), speaker_profile.hotel_tier),
    hospitality_status   = coalesce(nullif(p_data->>'hospitality_status', ''), speaker_profile.hospitality_status)
  returning id, stage_guest into v_id, v_guest;

  -- PART-081: ein Gastprofil bekommt keinen Speaker-Zugang (die Leistungen verhindert der CHECK).
  if not v_guest then
    insert into role_assignment (person_id, role, scope_type, edition_id, granted_by, note)
    values (v_pid, 'speaker', 'edition', v_edition, v_actor, 'speaker_profile')
    on conflict (person_id, role, scope_type,
                 coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 coalesce(edition_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 coalesce(portal, ''))
    do update set valid_to = null, granted_by = v_actor;
  end if;

  perform log_audit(case when v_existing is null then 'speaker.create' else 'speaker.update' end, 'speaker_profile', v_id::text, null, (p_data - 'email') || jsonb_build_object('person_id', v_pid));
  return v_id;
end $$;

create or replace function speaker_ticket_create(p_profile_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_p person%rowtype; v_email citext; v_id uuid; v_company text; v_complete boolean;
begin
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  -- PART-081: Gäste kommen mit einem Ticket aus dem Partner-Kontingent, nicht mit einem Freiticket.
  if v_sp.stage_guest then raise exception 'not_eligible' using errcode = 'P0001', detail = 'stage_guest'; end if;
  if not speaker_is_confirmed(v_sp.pipeline_status) then raise exception 'not_eligible' using errcode = 'P0001', detail = v_sp.pipeline_status; end if;
  select t.id into v_id from ticket t where t.speaker_profile_id = p_profile_id and t.source = 'speaker' and t.status <> 'cancelled';
  if found then return v_id; end if;
  select * into v_p from person where id = v_sp.person_id;
  select pe.email into v_email from person_email pe where pe.person_id = v_sp.person_id and pe.is_primary limit 1;
  v_company := coalesce(nullif(btrim(v_sp.organization_name), ''),
                        (select coalesce(o.communication_name, o.legal_name) from organization o where o.id = v_sp.org_id));
  v_complete := coalesce(nullif(btrim(v_p.first_name), ''), '') <> '' and coalesce(nullif(btrim(v_p.last_name), ''), '') <> ''
                and coalesce(v_company, '') <> '' and coalesce(nullif(btrim(v_sp.job_title), ''), '') <> '';
  insert into ticket (event_id, person_id, speaker_profile_id, pass_type, lounge_access, holder_email, holder_first_name, holder_last_name,
                      holder_company, holder_position, status, personalization_status, price_cents, source, requested_by)
  values (v_sp.edition_id, v_sp.person_id, p_profile_id, v_sp.pass_type, v_sp.lounge_access, v_email, v_p.first_name, v_p.last_name,
          v_company, v_sp.job_title, 'requested', case when v_complete then 'complete' else 'partial' end, 0, 'speaker', current_person_id())
  returning id into v_id;
  perform log_audit('ticket.speaker_requested', 'ticket', v_id::text, null,
                    jsonb_build_object('profile_id', p_profile_id, 'pass_type', v_sp.pass_type, 'lounge_access', v_sp.lounge_access));
  return v_id;
end $$;

create or replace function speaker_profile_tickets_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_n integer;
begin
  -- PART-081: für Gäste kein Freiticket — die Anlage steht schon auf „zugesagt“.
  if not new.stage_guest and speaker_is_confirmed(new.pipeline_status) and (tg_op = 'INSERT' or not speaker_is_confirmed(old.pipeline_status)) then
    perform speaker_ticket_create(new.id);
  elsif tg_op = 'UPDATE' and speaker_is_confirmed(old.pipeline_status) and not speaker_is_confirmed(new.pipeline_status) then
    -- Absage/Rückstufung: noch nicht ausgestellte Freitickets zurückziehen; ausgestellte (valid) storniert das Team über vivenu
    update ticket set status = 'cancelled', team_note = coalesce(team_note, 'speaker_pipeline:' || new.pipeline_status)
     where speaker_profile_id = new.id and status in ('requested', 'approved');
    get diagnostics v_n = row_count;
    if v_n > 0 then
      perform log_audit('ticket.withdrawn', 'speaker_profile', new.id::text, jsonb_build_object('pipeline_status', old.pipeline_status),
                        jsonb_build_object('pipeline_status', new.pipeline_status, 'tickets', v_n));
    end if;
  end if;
  if tg_op = 'UPDATE' and (new.pass_type is distinct from old.pass_type or new.lounge_access is distinct from old.lounge_access) then
    update ticket set pass_type = new.pass_type, lounge_access = new.lounge_access
     where speaker_profile_id = new.id and source = 'speaker' and status in ('requested', 'approved');
    update ticket set pass_type = new.pass_type
     where speaker_profile_id = new.id and source = 'speaker_companion' and status in ('requested', 'approved');
  end if;
  return new;
end $$;

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

create or replace function partner_speakers(p_org_id uuid, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(profile_id uuid, person_id uuid, session_id uuid, session_title text, display_name text, can_edit boolean, confirmed boolean, pipeline_status text, first_name text, last_name text, title text, job_title text, organization_name text, bio_short_de text, bio_short_en text, bio_long_de text, bio_long_en text, linkedin_url text, socials jsonb, photo_asset_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition;
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  return query
    select sp.id, sp.person_id, se.id, se.title_de,
           btrim(concat_ws(' ', pe.first_name, pe.last_name)),
           sp.partner_editable_until_login, coalesce(ss.confirmed, false), sp.pipeline_status,
           -- Ab hier nur, solange das Pflegerecht gilt. Sonst sind es fremde Stammdaten.
           case when sp.partner_editable_until_login then pe.first_name end,
           case when sp.partner_editable_until_login then pe.last_name end,
           case when sp.partner_editable_until_login then pe.title end,
           case when sp.partner_editable_until_login then sp.job_title end,
           case when sp.partner_editable_until_login then sp.organization_name end,
           case when sp.partner_editable_until_login then sp.bio_short_de end,
           case when sp.partner_editable_until_login then sp.bio_short_en end,
           case when sp.partner_editable_until_login then sp.bio_long_de end,
           case when sp.partner_editable_until_login then sp.bio_long_en end,
           case when sp.partner_editable_until_login then pe.linkedin_url end,
           case when sp.partner_editable_until_login then sp.socials end,
           case when sp.partner_editable_until_login then sp.photo_asset_id end
      from speaker_profile sp
      join person pe on pe.id = sp.person_id
      left join session_speaker ss on ss.person_id = sp.person_id
      left join session se on se.id = ss.session_id and se.partner_org_id = p_org_id
     where sp.created_by_org_id = p_org_id
       and sp.edition_id = v_oe.edition_id
       -- PART-081: Gäste der Standbühne stehen in ihrer eigenen Liste (partner_stage_guests).
       and not sp.stage_guest
     order by se.title_de nulls last, pe.last_name, pe.first_name;
end $$;

create or replace function partner_add_speaker(p_session_id uuid, p_email text, p_first_name text, p_last_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_se session; v_oe org_edition; v_person uuid; v_prof uuid; v_email citext; v_n integer; v_owner uuid;
        v_neu boolean := false;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  if v_se.partner_org_id is null or not partner_can_edit(v_se.partner_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_se.format not in ('keynote', 'panel', 'talk', 'impulse', 'fireside_chat', 'masterclass') then
    raise exception 'invalid_format' using errcode = '22023', detail = v_se.format;
  end if;
  v_email := nullif(btrim(coalesce(p_email, '')), '')::citext;
  if v_email is null or v_email::text !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'invalid_email' using errcode = '22023', detail = coalesce(p_email, 'null');
  end if;

  -- Ein bestätigter Speaker in dieser Rolle bleibt, wo er ist.
  select count(*)::integer into v_n from session_speaker ss
   where ss.session_id = p_session_id and ss.role = 'speaker' and ss.confirmed;
  if v_n > 0 then raise exception 'slot_locked' using errcode = 'P0001', detail = 'speaker_confirmed'; end if;

  -- Person über die Mailadresse finden oder anlegen (Dublettenregel wie im Partner-Ingest).
  select pe.person_id into v_person from person_email pe where pe.email = v_email limit 1;
  if v_person is null then
    insert into person (first_name, last_name) values (nullif(btrim(p_first_name), ''), nullif(btrim(p_last_name), ''))
      returning id into v_person;
    insert into person_email (person_id, email, is_primary) values (v_person, v_email, true);
    -- Nur diese Person ist eine, die es ohne den Partner nicht gäbe. Nur sie darf er pflegen.
    v_neu := true;
  end if;

  select oe.* into v_oe from org_edition oe where oe.org_id = v_se.partner_org_id
     and oe.edition_id in (select coalesce(ev.edition_id, ev.id) from event ev where ev.id = v_se.event_id)
   limit 1;

  -- Betreuung: die Leitung der Bühne, sonst bleibt es offen und das Team teilt zu.
  select st.stage_lead_person_id into v_owner
    from slot sl join stage st on st.id = sl.stage_id where sl.id = v_se.slot_id;

  select sp.id into v_prof from speaker_profile sp
   where sp.person_id = v_person and sp.edition_id = coalesce(v_oe.edition_id, v_se.event_id);
  -- PART-081: ein Gast der Standbühne ist kein Speaker eines Talks — sonst stünde er ohne Zugang,
  -- Ticket und Lounge auf der Hauptbühne. Erst das Gastprofil entfernen.
  if v_prof is not null and exists (select 1 from speaker_profile where id = v_prof and stage_guest) then
    raise exception 'stage_guest' using errcode = 'P0001';
  end if;
  if v_prof is null then
    -- **`lead`, nicht `invited`** (Probelauf der Architektur-Session, 21.09.: 23514). Das
    -- Vokabular `speaker_pipeline` kennt lead, contacted, confirmed, onboarded, ready,
    -- published, attended, declined — `invited` war meine Erfindung und hätte am CHECK
    -- scheitern müssen, was sie auch tat.
    --
    -- `lead` ist auch inhaltlich der richtige Anfang: wen ein Partner für seine Session
    -- einträgt, hat aus Sicht des Speaker-Teams noch niemand kontaktiert. Die Einladung
    -- verschickt das Team, und zwar erst ab `confirmed` (Regel aus 0025) — stünde hier
    -- „eingeladen", behauptete der Status etwas, das noch nicht passiert ist.
    insert into speaker_profile (person_id, edition_id, pipeline_status, owner_person_id,
                                 created_by_org_id, partner_editable_until_login)
    values (v_person, coalesce(v_oe.edition_id, v_se.event_id), 'lead', v_owner,
            v_se.partner_org_id, v_neu)
    returning id into v_prof;
  end if;

  insert into session_speaker (session_id, person_id, role)
  values (p_session_id, v_person, 'speaker')
  on conflict do nothing;

  -- `claimed` im Audit, damit im Nachhinein erkennbar ist, welcher Partner eine bestehende
  -- Person nur zugeordnet und welche er selbst angelegt hat.
  perform log_audit('partner.add_speaker', 'session', p_session_id::text, null,
                    jsonb_build_object('org_id', v_se.partner_org_id, 'person_id', v_person,
                                       'profile_id', v_prof, 'claimed', not v_neu));
  return v_prof;
end $$;

-- ---------------------------------------------------------------- 4) Porträt-Upload für den Partner

create or replace function speaker_asset_path_allowed(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_profile uuid; v_edition uuid; v_sp speaker_profile%rowtype; v_me uuid := current_person_id();
begin
  if v_me is null or p_name is null then return false; end if;
  begin
    v_edition := split_part(p_name, '/', 1)::uuid;
    v_profile := split_part(p_name, '/', 2)::uuid;
  exception when others then return false; end;
  if split_part(p_name, '/', 3) not in ('presentation', 'photo', 'other', 'receipt', 'invoice') or split_part(p_name, '/', 4) = '' then return false; end if;
  select * into v_sp from speaker_profile where id = v_profile and edition_id = v_edition;
  if not found then return false; end if;
  if split_part(p_name, '/', 3) = 'invoice' and not coalesce((v_sp.person_id = v_me or is_speaker_assistant(v_sp.id, v_me) or is_expense_approver()), false) then return false; end if;
  return coalesce(v_sp.person_id = v_me or is_speaker_assistant(v_sp.id, v_me) or can_manage_speaker(v_profile) or is_staff()
                  -- PART-081: der Partner nur das Porträt seiner eigenen Gäste.
                  or (split_part(p_name, '/', 3) = 'photo' and partner_manages_stage_guest(v_profile)), false);
end $$;

create or replace function register_speaker_asset(p_profile_id uuid, p_kind text, p_storage_path text, p_filename text, p_mime text DEFAULT NULL::text, p_size_bytes bigint DEFAULT NULL::bigint, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id(); v_sp speaker_profile%rowtype; v_version integer; v_late boolean := false; v_due timestamptz; v_id uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce((v_sp.person_id = v_me or is_speaker_assistant(v_sp.id, v_me) or can_manage_speaker(p_profile_id)
                   -- PART-081: der Partner nur das Porträt seiner eigenen Gäste.
                   or (p_kind = 'photo' and partner_manages_stage_guest(p_profile_id))), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_kind not in ('presentation', 'photo', 'other', 'receipt') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if p_storage_path not like v_sp.edition_id::text || '/' || p_profile_id::text || '/' || p_kind || '/%' then
    raise exception 'path_mismatch' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'speaker-assets' and o.name = p_storage_path) then
    raise exception 'object_not_found' using errcode = 'P0002';
  end if;
  if p_session_id is not null and not exists (select 1 from session_speaker ss where ss.session_id = p_session_id and ss.person_id = v_sp.person_id) then
    raise exception 'session_mismatch' using errcode = '22023';
  end if;
  if p_kind = 'presentation' and p_session_id is not null then
    v_due := (presentation_window(p_session_id)->>'effective_due')::timestamptz;
    v_late := v_due is not null and now() > v_due;
  end if;
  select coalesce(max(version), 0) + 1 into v_version
    from speaker_asset where profile_id = p_profile_id and kind = p_kind and coalesce(session_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_session_id, '00000000-0000-0000-0000-000000000000'::uuid);
  if p_kind in ('presentation', 'photo') then
    update speaker_asset set is_current = false
     where profile_id = p_profile_id and kind = p_kind and is_current
       and coalesce(session_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_session_id, '00000000-0000-0000-0000-000000000000'::uuid);
  end if;
  insert into speaker_asset (profile_id, session_id, kind, storage_path, filename, mime, size_bytes, version, late, uploaded_by)
  values (p_profile_id, p_session_id, p_kind, p_storage_path, p_filename, p_mime, p_size_bytes, v_version, v_late, v_me)
  returning id into v_id;
  if p_kind = 'photo' then update speaker_profile set photo_asset_id = v_id where id = p_profile_id; end if;
  perform log_audit('speaker.asset', 'speaker_profile', p_profile_id::text, null,
    jsonb_build_object('asset_id', v_id, 'kind', p_kind, 'version', v_version, 'late', v_late, 'session_id', p_session_id));
  return jsonb_build_object('id', v_id, 'version', v_version, 'late', v_late, 'effective_due', v_due);
end $$;

-- ---------------------------------------------------------------- 5) Partner-RPCs

-- Gäste der eigenen Organisation in der aktuellen Edition. Name und Adresse nur bei selbst angelegten
-- Personen vor dem ersten Login — sonst sind es fremde Stammdaten (wie partner_speakers).
create or replace function partner_stage_guests(p_org_id uuid, p_edition_id uuid default null)
 returns table (profile_id uuid, person_id uuid, edition_id uuid, first_name text, last_name text, email text,
                job_title text, organization_name text, editable boolean, consent_at timestamptz,
                photo_asset_id uuid, photo_path text, sessions jsonb)
 language plpgsql
 stable
 security definer
 set search_path = public, extensions
as $$
declare v_oe org_edition;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not (is_partner_of(p_org_id) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  return query
    select sp.id, p.id, sp.edition_id, p.first_name, p.last_name,
           case when sp.partner_editable_until_login and p.auth_user_id is null then pe.email::text end,
           sp.job_title, sp.organization_name,
           (sp.partner_editable_until_login and p.auth_user_id is null),
           sp.stage_guest_consent_at, sp.photo_asset_id, a.storage_path,
           -- Nur Sessions dieser Organisation — die Person kann anderswo auftreten, das geht den Partner nichts an.
           coalesce((select jsonb_agg(jsonb_build_object('session_id', se.id, 'title_de', se.title_de,
                                                         'start_at', sl.start_at, 'publish_status', se.publish_status)
                                      order by sl.start_at nulls last)
                       from session_speaker ss
                       join session se on se.id = ss.session_id
                       left join slot sl on sl.id = se.slot_id
                       left join stage st on st.id = sl.stage_id
                      where ss.person_id = sp.person_id
                        and (se.host_org_id = p_org_id or se.partner_org_id = p_org_id or st.partner_org_id = p_org_id)
                        and (se.event_id = v_oe.edition_id
                             or se.event_id in (select ev.id from event ev where ev.edition_id = v_oe.edition_id))),
                    '[]'::jsonb)
      from speaker_profile sp
      join person p on p.id = sp.person_id and p.deleted_at is null
      left join person_email pe on pe.person_id = p.id and pe.is_primary
      left join speaker_asset a on a.id = sp.photo_asset_id
     where sp.stage_guest and sp.created_by_org_id = p_org_id and sp.edition_id = v_oe.edition_id
     order by p.last_name nulls last, p.first_name nulls last;
end $$;

-- Gast anlegen: Person über die Adresse finden oder anlegen, Gastprofil mit Einwilligung. Gibt Profil und
-- Edition zurück — die Oberfläche braucht beides für den Pfad des Porträts.
create or replace function partner_add_stage_guest(p_org_id uuid, p_first_name text, p_last_name text,
                                                   p_job_title text, p_organization text, p_email text,
                                                   p_consent boolean, p_edition_id uuid default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path = public, extensions
as $$
declare
  v_me uuid := current_person_id(); v_oe org_edition; v_email citext; v_person uuid; v_neu boolean := false;
  v_sp speaker_profile; v_first text; v_last text; v_job text; v_org text; v_fehlt text[];
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_edit(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  -- Auflage zu K-32: ohne bestätigte Einwilligung speichern wir die Daten eines anderen Menschen nicht.
  if not coalesce(p_consent, false) then raise exception 'stage_guest_consent_required' using errcode = '22023'; end if;

  v_first := nullif(btrim(coalesce(p_first_name, '')), '');
  v_last  := nullif(btrim(coalesce(p_last_name, '')), '');
  v_job   := nullif(btrim(coalesce(p_job_title, '')), '');
  v_org   := nullif(btrim(coalesce(p_organization, '')), '');
  v_fehlt := array_remove(array[
    case when v_first is null then 'first_name' end, case when v_last is null then 'last_name' end,
    case when v_job is null then 'job_title' end, case when v_org is null then 'organization_name' end], null);
  if cardinality(v_fehlt) > 0 then
    raise exception 'fields_required' using errcode = '22023', detail = array_to_string(v_fehlt, ', ');
  end if;
  v_email := nullif(lower(btrim(coalesce(p_email, ''))), '')::citext;
  if v_email is null or v_email::text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if is_suppressed(v_email::text) then raise exception 'suppressed' using errcode = 'P0001'; end if;

  select pe.person_id into v_person from person_email pe join person p on p.id = pe.person_id
   where pe.email = v_email and p.deleted_at is null limit 1;
  if v_person is null then
    insert into person (first_name, last_name) values (v_first, v_last) returning id into v_person;
    insert into person_email (person_id, email, is_primary, verified) values (v_person, v_email, true, false);
    -- Nur diese Person gäbe es ohne den Partner nicht; nur ihren Namen und ihre Adresse darf er pflegen.
    v_neu := true;
  end if;

  select * into v_sp from speaker_profile where person_id = v_person and edition_id = v_oe.edition_id for update;
  if found then
    -- Wer in dieser Edition regulär spricht oder Gast einer anderen Organisation ist, bleibt, was er ist.
    if not v_sp.stage_guest or v_sp.created_by_org_id is distinct from p_org_id then
      raise exception 'already_speaker' using errcode = 'P0001';
    end if;
    update speaker_profile set job_title = v_job, organization_name = v_org, stage_guest_consent_at = now()
     where id = v_sp.id returning * into v_sp;
  else
    insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at, job_title,
                                 organization_name, stage_guest, stage_guest_consent_at, lounge_access,
                                 reception_eligible, travel_costs_covered, hospitality_status, created_by_org_id,
                                 partner_editable_until_login, created_by)
    values (v_person, v_oe.edition_id, 'other', 'confirmed', now(), v_job, v_org, true, now(), false,
            false, false, 'none', p_org_id, v_neu, v_me)
    returning * into v_sp;
  end if;

  -- `claimed` wie bei partner_add_speaker: erkennbar, ob der Partner eine bestehende Person nur zugeordnet hat.
  perform log_audit('partner.stage_guest_add', 'speaker_profile', v_sp.id::text, null,
                    jsonb_build_object('org_id', p_org_id, 'person_id', v_person, 'claimed', not v_neu,
                                       'consent_at', v_sp.stage_guest_consent_at));
  return jsonb_build_object('profile_id', v_sp.id, 'edition_id', v_oe.edition_id);
end $$;

-- Gast bearbeiten: Position und Unternehmen immer; Name und Adresse nur bei selbst angelegten Personen vor dem
-- ersten Login. `null` heißt „unverändert“.
create or replace function partner_update_stage_guest(p_profile_id uuid, p_first_name text default null,
                                                      p_last_name text default null, p_email text default null,
                                                      p_job_title text default null, p_organization text default null)
 returns void
 language plpgsql
 security definer
 set search_path = public, extensions
as $$
declare v_sp speaker_profile; v_p person; v_alt citext; v_neu citext; v_first text; v_last text;
        v_felder text[] := '{}';
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found or not v_sp.stage_guest then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not partner_can_edit(v_sp.created_by_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_p from person where id = v_sp.person_id for update;

  if p_job_title is not null or p_organization is not null then
    if (p_job_title is not null and nullif(btrim(p_job_title), '') is null)
       or (p_organization is not null and nullif(btrim(p_organization), '') is null) then
      raise exception 'fields_required' using errcode = '22023',
        detail = concat_ws(', ', case when p_job_title is not null and nullif(btrim(p_job_title), '') is null then 'job_title' end,
                                 case when p_organization is not null and nullif(btrim(p_organization), '') is null then 'organization_name' end);
    end if;
    update speaker_profile
       set job_title = coalesce(nullif(btrim(p_job_title), ''), job_title),
           organization_name = coalesce(nullif(btrim(p_organization), ''), organization_name)
     where id = v_sp.id;
    v_felder := v_felder || array_remove(array[case when p_job_title is not null then 'job_title' end,
                                               case when p_organization is not null then 'organization_name' end], null);
  end if;

  select pe.email into v_alt from person_email pe where pe.person_id = v_p.id and pe.is_primary limit 1;
  v_first := case when p_first_name is null then v_p.first_name else nullif(btrim(p_first_name), '') end;
  v_last  := case when p_last_name  is null then v_p.last_name  else nullif(btrim(p_last_name), '')  end;
  v_neu   := case when p_email      is null then v_alt          else nullif(lower(btrim(p_email)), '')::citext end;
  if v_first is distinct from v_p.first_name or v_last is distinct from v_p.last_name or v_neu is distinct from v_alt then
    -- Name und Adresse gehören der Person: nur bei selbst angelegten und nur bis zum ersten Login.
    if not (v_sp.partner_editable_until_login and v_p.auth_user_id is null) then
      raise exception 'speaker_not_editable' using errcode = 'P0001';
    end if;
    if v_first is null or v_last is null then raise exception 'name_required' using errcode = '22023'; end if;
    if v_neu is distinct from v_alt then
      if v_neu is null or v_neu::text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email' using errcode = '22023'; end if;
      if is_suppressed(v_neu::text) then raise exception 'suppressed' using errcode = 'P0001'; end if;
      if exists (select 1 from person_email pe where pe.email = v_neu and pe.person_id <> v_p.id) then
        raise exception 'email_in_use' using errcode = 'P0001';
      end if;
      update person_email set email = v_neu, verified = false where person_id = v_p.id and is_primary;
      if not found then
        insert into person_email (person_id, email, is_primary, verified) values (v_p.id, v_neu, true, false);
      end if;
      v_felder := array_append(v_felder, 'email');
    end if;
    if v_first is distinct from v_p.first_name or v_last is distinct from v_p.last_name then
      update person set first_name = v_first, last_name = v_last where id = v_p.id;
      v_felder := array_append(v_felder, 'name');
    end if;
  end if;

  -- Welche Felder, nicht welche Werte: die Adresse gehört nicht ins Audit.
  if cardinality(v_felder) > 0 then
    perform log_audit('partner.stage_guest_update', 'speaker_profile', v_sp.id::text, null,
                      jsonb_build_object('org_id', v_sp.created_by_org_id, 'fields', v_felder));
  end if;
end $$;

-- Dateien eines Gastes (Porträt, auch ältere Fassungen): die Oberfläche löscht sie vor dem Gastprofil aus dem
-- Bucket — danach ließe die Storage-Policy es nicht mehr zu.
create or replace function partner_stage_guest_files(p_profile_id uuid)
 returns text[]
 language plpgsql
 stable
 security definer
 set search_path = public, extensions
as $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_manages_stage_guest(p_profile_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  return coalesce((select array_agg(a.storage_path order by a.created_at) from speaker_asset a where a.profile_id = p_profile_id),
                  '{}'::text[]);
end $$;

-- Gast entfernen (K-32 Punkt 4): von den Sessions dieser Organisation nehmen, Gastprofil löschen, die Person
-- bleibt — sie kann anderswo auftreten; „Profil löschen“ ist ihre eigene Entscheidung.
create or replace function partner_remove_stage_guest(p_profile_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path = public, extensions
as $$
declare v_sp speaker_profile; v_n integer;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found or not v_sp.stage_guest then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not partner_can_edit(v_sp.created_by_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;

  delete from session_speaker ss
   using session se
   left join slot sl on sl.id = se.slot_id
   left join stage st on st.id = sl.stage_id
   where ss.session_id = se.id and ss.person_id = v_sp.person_id
     and (se.host_org_id = v_sp.created_by_org_id or se.partner_org_id = v_sp.created_by_org_id
          or st.partner_org_id = v_sp.created_by_org_id)
     and (se.event_id = v_sp.edition_id or se.event_id in (select ev.id from event ev where ev.edition_id = v_sp.edition_id));
  get diagnostics v_n = row_count;
  -- Porträt-Zeilen gehen per ON DELETE CASCADE mit; die Dateien hat die Oberfläche vorher entfernt.
  delete from speaker_profile where id = v_sp.id;
  perform log_audit('partner.stage_guest_remove', 'speaker_profile', v_sp.id::text,
                    jsonb_build_object('org_id', v_sp.created_by_org_id, 'person_id', v_sp.person_id),
                    jsonb_build_object('sessions', v_n));
end $$;

-- Gast an einem Programmpunkt der eigenen Organisation ein- oder austragen: auf der eigenen Standbühne mit dem
-- Recht des Boards (PART-081) oder an einem gebuchten Talk der Organisation mit dem Partner-Recht (PART-088:
-- Talk-Speaker sind vom Partner angelegte Gäste — Event-App ja, Portal, Onboarding und Kommunikation nein).
create or replace function partner_assign_stage_guest(p_session_id uuid, p_profile_id uuid, p_assign boolean)
 returns void
 language plpgsql
 security definer
 set search_path = public, extensions
as $$
declare v_se session; v_stage stage; v_sp speaker_profile; v_buehne boolean; v_talk boolean;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found or not v_sp.stage_guest then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  select st.* into v_stage from slot sl join stage st on st.id = sl.stage_id where sl.id = v_se.slot_id;
  -- Standbühne: nur die Bühne der Organisation, der der Gast gehört, und nur mit dem Recht auf diesen Slot.
  v_buehne := v_stage.id is not null and v_stage.type = 'partner_booth'
              and v_stage.partner_org_id = v_sp.created_by_org_id
              and coalesce(can_edit_slot(v_se.slot_id), false);
  -- Talk: gebucht von derselben Organisation, Speaking-Format wie in partner_add_speaker, nicht auf einer Standbühne.
  v_talk := not v_buehne and v_se.partner_org_id = v_sp.created_by_org_id
            and v_se.format in ('keynote', 'panel', 'talk', 'impulse', 'fireside_chat', 'masterclass')
            and coalesce(v_stage.type, '') <> 'partner_booth'
            and partner_can_edit(v_sp.created_by_org_id);
  if not (v_buehne or v_talk)
     or not exists (select 1 from event ev where ev.id = v_se.event_id
                     and (ev.id = v_sp.edition_id or ev.edition_id = v_sp.edition_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if coalesce(p_assign, false) then
    insert into session_speaker (session_id, person_id, role, sort_order, confirmed)
    values (p_session_id, v_sp.person_id, 'speaker',
            coalesce((select max(ss.sort_order) + 1 from session_speaker ss where ss.session_id = p_session_id), 0), true)
    on conflict (session_id, person_id, role) do nothing;
  else
    delete from session_speaker where session_id = p_session_id and person_id = v_sp.person_id and role = 'speaker';
  end if;
  perform log_audit(case when coalesce(p_assign, false) then 'partner.stage_guest_assign' else 'partner.stage_guest_unassign' end,
                    'session', p_session_id::text, null,
                    jsonb_build_object('org_id', v_sp.created_by_org_id, 'profile_id', v_sp.id,
                                       'weg', case when v_buehne then 'standbuehne' else 'talk' end));
end $$;

select harden_definer_functions();
