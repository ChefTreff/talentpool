-- =============================================================================
-- 0118 · Welle 6 · Rechteprüfungen NULL-sicher (Hotfix, Architektur-Session)
--
-- Angewendet von der Architektur-Session am 18.09.2026 als 20260918142035.
--
-- Sieben SECURITY-DEFINER-Funktionen der Speaker-Domäne prüften den Zugriff mit
-- einer OR-Kette der Form
--   if not (sp.person_id = v_me or sp.assistant_person_id = v_me or …) then raise …
-- Hat das Profil keine Assistenz, ist `assistant_person_id = v_me` NULL; die
-- Kette wird NULL statt false, `if not NULL` löst nicht aus — und eine fremde,
-- angemeldete Person kam durch. Gefunden am Probelauf zu PR #71 (Schritt 01
-- des Shuttle-Tests), danach gegen pg_proc gesucht.
--
-- Änderung je Funktion: genau die Prüfzeile, `coalesce((…), false)` um die
-- Kette; Rückgaben `return … or …;` werden `return coalesce(… or …, false);`.
-- Alles andere ist die Live-Fassung (pg_get_functiondef, 18.09.2026).
-- Test: supabase/tests/v6_rechte_nullsicher.sql
-- =============================================================================

create or replace function cancel_companion_ticket(p_ticket_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_t ticket%rowtype; v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_team boolean;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_t from ticket where id = p_ticket_id and source = 'speaker_companion' for update;
  if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_t.speaker_profile_id;
  v_team := is_speaker_team(v_sp.edition_id);
  if not coalesce((v_team or v_sp.person_id = v_me or v_sp.assistant_person_id = v_me or can_manage_speaker(v_sp.id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_t.status = 'cancelled' then return; end if;
  if v_t.status = 'valid' and not v_team then raise exception 'already_issued' using errcode = 'P0001'; end if;  -- ausgestellt: nur Team (Storno in vivenu)
  if v_t.status not in ('requested', 'approved', 'valid') then raise exception 'not_cancellable' using errcode = 'P0001', detail = v_t.status; end if;
  update ticket set status = 'cancelled' where id = p_ticket_id;
  perform log_audit('ticket.companion_cancelled', 'ticket', p_ticket_id::text, jsonb_build_object('status', v_t.status),
                    jsonb_build_object('status', 'cancelled', 'by_team', v_team));
end $$;

create or replace function cancel_hospitality(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_b hospitality_booking%rowtype; v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_next uuid;
begin
  select * into v_b from hospitality_booking where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_b.profile_id;
  if not coalesce((v_sp.person_id = v_me or v_sp.assistant_person_id = v_me or can_manage_speaker(v_sp.id) or is_staff()), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_b.status = 'cancelled' then return; end if;
  update hospitality_booking set status = 'cancelled', cancelled_at = now() where id = p_booking_id;
  if v_b.status in ('requested', 'confirmed') then
    select id into v_next from hospitality_booking where quota_id = v_b.quota_id and status = 'waitlisted' order by created_at limit 1;
    if v_next is not null then update hospitality_booking set status = 'requested' where id = v_next; end if;
  end if;
  if not exists (select 1 from hospitality_booking b where b.profile_id = v_sp.id and b.status <> 'cancelled') and v_sp.hospitality_status in ('requested', 'booked') then
    update speaker_profile set hospitality_status = 'eligible' where id = v_sp.id;
  end if;
  perform log_audit('hospitality.cancel', 'hospitality_booking', p_booking_id::text, jsonb_build_object('status', v_b.status), jsonb_build_object('promoted', v_next));
end $$;

create or replace function expense_eligibility(p_profile_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_reason text;
begin
  select * into v_sp from speaker_profile where id = coalesce(p_profile_id, my_speaker_profile_id(null));
  if not found then return null; end if;
  if not coalesce((v_sp.person_id = v_me or v_sp.assistant_person_id = v_me or can_manage_speaker(v_sp.id) or is_expense_approver()), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_reason := case when not v_sp.travel_costs_covered then 'not_covered' when v_sp.travel_costs_approved_at is null then 'not_approved' end;
  return jsonb_build_object('eligible', v_reason is null, 'reason', v_reason, 'covered', v_sp.travel_costs_covered,
                            'approved', v_sp.travel_costs_approved_at is not null, 'is_assistant', v_sp.person_id <> v_me,
                            'open_claim', (select c.id from expense_claim c where c.profile_id = v_sp.id and c.status in ('draft', 'submitted', 'approved', 'rejected') order by c.created_at desc limit 1));
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
  if not coalesce((v_sp.person_id = v_me or v_sp.assistant_person_id = v_me or can_manage_speaker(p_profile_id)), false) then
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

create or replace function request_companion_ticket(p_profile_id uuid, p_email text, p_first_name text, p_last_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_email citext; v_first text; v_last text; v_id uuid; v_speaker text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce((v_sp.person_id = v_me or v_sp.assistant_person_id = v_me or can_manage_speaker(p_profile_id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not speaker_is_confirmed(v_sp.pipeline_status) then raise exception 'not_eligible' using errcode = 'P0001', detail = v_sp.pipeline_status; end if;
  v_email := lower(btrim(coalesce(p_email, '')))::citext;
  if v_email::text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email' using errcode = '22023'; end if;
  v_first := nullif(btrim(coalesce(p_first_name, '')), '');
  v_last  := nullif(btrim(coalesce(p_last_name, '')), '');
  if v_first is null or v_last is null then raise exception 'name_required' using errcode = '22023'; end if;
  if exists (select 1 from person_email pe where pe.person_id = v_sp.person_id and pe.email = v_email) then
    raise exception 'companion_is_speaker' using errcode = '22023';
  end if;
  -- zweites aktives Begleitticket ⇒ 23505 (ticket_speaker_companion_uidx)
  insert into ticket (event_id, speaker_profile_id, pass_type, lounge_access, holder_email, holder_first_name, holder_last_name,
                      status, personalization_status, price_cents, source, requested_by)
  values (v_sp.edition_id, p_profile_id, v_sp.pass_type, false, v_email, v_first, v_last, 'requested', 'partial', 0, 'speaker_companion', v_me)
  returning id into v_id;
  select btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) into v_speaker from person p where p.id = v_sp.person_id;
  perform notify_speaker_leads('companion_ticket_requested',
                               jsonb_build_object('speaker_name', v_speaker, 'companion_name', v_first || ' ' || v_last), 'ticket', v_id);
  perform log_audit('ticket.companion_requested', 'ticket', v_id::text, null,
                    jsonb_build_object('profile_id', p_profile_id, 'by_assistant', v_sp.person_id <> v_me));
  return v_id;
end $$;

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
  if split_part(p_name, '/', 3) = 'invoice' and not coalesce((v_sp.person_id = v_me or v_sp.assistant_person_id = v_me or is_expense_approver()), false) then return false; end if;
  return coalesce(v_sp.person_id = v_me or v_sp.assistant_person_id = v_me or can_manage_speaker(v_profile) or is_staff(), false);
end $$;

create or replace function speaker_next_steps(p_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_sp speaker_profile%rowtype; v_p person%rowtype; v_me uuid := current_person_id();
  v_profile boolean; v_photo boolean; v_consents boolean; v_session boolean; v_ticket boolean; v_content boolean; v_presentation boolean; v_open text[] := '{}';
begin
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce((v_sp.person_id = v_me or v_sp.assistant_person_id = v_me or can_manage_speaker(p_profile_id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_p from person where id = v_sp.person_id;
  v_profile  := coalesce(nullif(btrim(v_p.first_name), ''), '') <> '' and coalesce(nullif(btrim(v_p.last_name), ''), '') <> ''
                and coalesce(nullif(btrim(v_sp.job_title), ''), '') <> '' and coalesce(nullif(btrim(v_sp.bio_short_en), ''), '') <> '';
  v_photo    := v_sp.photo_asset_id is not null;
  v_consents := coalesce((select c.granted from consent_current c where c.person_id = v_p.id and c.consent_type = 'speaker_release'), false)
                and coalesce((select c.granted from consent_current c where c.person_id = v_p.id and c.consent_type = 'photo_video'), false);
  v_session  := exists (select 1 from session_speaker ss join session se on se.id = ss.session_id join event e on e.id = se.event_id
                        where ss.person_id = v_p.id and (e.edition_id = v_sp.edition_id or e.id = v_sp.edition_id));
  v_content  := v_session and not exists (
                  select 1 from session_speaker ss join session se on se.id = ss.session_id join event e on e.id = se.event_id
                  where ss.person_id = v_p.id and (e.edition_id = v_sp.edition_id or e.id = v_sp.edition_id)
                    and not exists (select 1 from session_submission s where s.session_id = se.id and s.status = 'approved')
                    and coalesce(se.description_de, se.description_en) is null);
  v_presentation := v_session and not exists (
                  select 1 from session_speaker ss join session se on se.id = ss.session_id join event e on e.id = se.event_id
                  where ss.person_id = v_p.id and (e.edition_id = v_sp.edition_id or e.id = v_sp.edition_id)
                    and se.format not in ('panel', 'networking', 'reception', 'side_event', 'break', 'company_tour')
                    and not exists (select 1 from speaker_asset a where a.profile_id = v_sp.id and a.session_id = se.id and a.kind = 'presentation' and a.is_current));
  v_ticket   := exists (select 1 from ticket t join event e on e.id = t.event_id
                        where t.person_id = v_p.id and (e.edition_id = v_sp.edition_id or e.id = v_sp.edition_id) and t.status in ('valid', 'requested'));
  if not v_profile      then v_open := array_append(v_open, 'profile'); end if;
  if not v_photo        then v_open := array_append(v_open, 'photo'); end if;
  if not v_consents     then v_open := array_append(v_open, 'consents'); end if;
  if not v_session      then v_open := array_append(v_open, 'session'); end if;
  if v_session and not v_content      then v_open := array_append(v_open, 'session_content'); end if;
  if v_session and not v_presentation then v_open := array_append(v_open, 'presentation'); end if;
  if not v_ticket       then v_open := array_append(v_open, 'ticket'); end if;
  return jsonb_build_object(
    'profile', v_profile, 'photo', v_photo, 'consents', v_consents, 'session', v_session,
    'session_content', case when v_session then v_content end,
    'presentation', case when v_session then v_presentation end,
    'ticket', v_ticket, 'hospitality', v_sp.hospitality_status,
    'open', to_jsonb(v_open)
  );
end $$;

select harden_definer_functions();
