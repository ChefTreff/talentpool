-- 0261 · Luma-Gäste ohne Profil als Lead mit Kanal luma, Zählwerte für den Admin (K-34, TAL-007)
-- Angewendet von der Architektur-Session am 02.10.2026 als 20261002141557.
-- Anlass: Konrad 02.10.2026 (K-34): Gäste unserer Community-Events, die im Portal kein Profil haben,
-- werden als Lead mit Kanal „Luma“ angelegt; Rechtsgrundlage ist die Datenschutzerklärung
-- (Verarbeitung im Rahmen der Event-Anmeldung), Löschung mit dem Löschkonzept (K-22).
--
-- **Kein neues Modell.** Ein Lead ist schon `person` mit `tier = 'lead'` (bekannt ohne Login), der
-- Kanal steht in `person.source_first`; beim ersten Login übernimmt `claim_or_create_person` die
-- Person über die verifizierte E-Mail (Single Profile, die Teilnahme-Historie bleibt).
--
-- Diese Migration:
--   1 `luma_sync_registration` (Live-Fassung aus dem Snapshot, nur Server): zwei optionale
--     Parameter `p_first_name/p_last_name`; alte Signatur wird gedroppt. Passt keine Person, wird
--     bei Status registered/pending/waitlist oder Check-in ein Lead angelegt — nur Vorname,
--     Nachname, E-Mail (primär, nicht verifiziert), `source_first = 'luma'` — und die Teilnahme
--     wie bisher als `registration` (source luma) geschrieben (= Event und Zeitpunkt). **Kein**
--     Lead bei declined/invited (keine Anmeldung), ungültiger Adresse oder Adresse auf der
--     Sperrliste. Es wird keine Einwilligung geschrieben: Newsletter und Marketing erreichen den
--     Lead nicht (TAL-009 verlangt Einwilligung). Rückgabe `{matched, lead_created, …}`.
--   2 `luma_lead_stats()` für den Admin-Abschnitt Community-Events (`can_view_community_events()`):
--     nur Zählwerte (gesamt, noch ohne Login, mit Login übernommen) — keine Namen.
-- Löschung: Leads sind über `source_first = 'luma'` auffindbar und laufen wie jede Person durch
-- `anonymize_person` (Sperrliste, Zeilen weg); die Frist bestimmt das Löschkonzept (K-22).
-- Fehlerschlüssel: keine neuen.
-- Test: supabase/tests/v6_luma_leads.sql
set search_path = public, extensions;

drop function if exists luma_sync_registration(text, text, text, text, timestamptz, boolean);

create or replace function luma_sync_registration(
  p_luma_event_id text, p_email text, p_guest_id text, p_status text,
  p_registered_at timestamptz default null, p_checked_in boolean default false,
  p_first_name text default null, p_last_name text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_event uuid; v_person uuid; v_reg uuid; v_status text; v_lead boolean := false;
  v_guest text := nullif(btrim(coalesce(p_guest_id, '')), '');
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  v_status := case p_status
    when 'registered' then 'confirmed'
    when 'pending' then 'applied'
    when 'waitlist' then 'waitlisted'
    when 'declined' then 'declined'
    when 'invited' then 'no_response'
  end;
  if v_status is null then raise exception 'invalid_status' using errcode = '22023', detail = coalesce(p_status, 'null'); end if;
  if coalesce(p_checked_in, false) then v_status := 'attended'; end if;

  select r.object_id into v_event from external_ref r
   where r.system = 'luma' and r.object_type = 'event' and r.external_id = btrim(coalesce(p_luma_event_id, ''));
  if v_event is null then raise exception 'event_not_found' using errcode = 'P0002', detail = coalesce(p_luma_event_id, 'null'); end if;

  select pe.person_id into v_person from person_email pe join person p on p.id = pe.person_id
   where lower(pe.email::text) = v_email and p.deleted_at is null
   order by pe.is_primary desc limit 1;

  if v_person is null then
    -- K-34: wer sich angemeldet hat, aber kein Profil besitzt, wird Lead (Kanal Luma). Wer abgesagt hat
    -- oder nur eingeladen wurde, nicht; gesperrte und ungültige Adressen auch nicht.
    if v_status in ('confirmed', 'applied', 'waitlisted', 'attended')
       and v_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and not is_suppressed(v_email) then
      insert into person (first_name, last_name, source_first, tier)
      values (left(nullif(btrim(coalesce(p_first_name, '')), ''), 100), left(nullif(btrim(coalesce(p_last_name, '')), ''), 100), 'luma', 'lead')
      returning id into v_person;
      insert into person_email (person_id, email, is_primary, verified) values (v_person, v_email, true, false);
      v_lead := true;
    else
      return jsonb_build_object('matched', false, 'lead_created', false);
    end if;
  end if;

  -- Erst über die Gast-Id, dann über Person × Event (Anmeldung aus dem Portal, Id noch leer).
  if v_guest is not null then
    select g.id into v_reg from registration g where g.external_source = 'luma' and g.external_ref = v_guest;
  end if;
  if v_reg is null then
    select g.id into v_reg from registration g
     where g.person_id = v_person and g.event_id = v_event and g.source = 'luma' and g.session_id is null
     order by g.created_at limit 1;
  end if;

  if v_reg is null then
    insert into registration (person_id, event_id, status, source, external_source, external_ref, registered_at)
    values (v_person, v_event, v_status, 'luma', 'luma', v_guest, coalesce(p_registered_at, now()))
    returning id into v_reg;
  else
    update registration set
      status = v_status,
      external_source = 'luma',
      external_ref = coalesce(v_guest, external_ref),
      registered_at = coalesce(p_registered_at, registered_at)
     where id = v_reg;
  end if;
  return jsonb_build_object('matched', not v_lead, 'lead_created', v_lead, 'registration_id', v_reg, 'status', v_status);
end $$;
revoke execute on function luma_sync_registration(text, text, text, text, timestamptz, boolean, text, text) from public, anon, authenticated;

-- Zählwerte für Community-Events im Admin: keine Namen, keine Adressen.
create or replace function luma_lead_stats()
 RETURNS TABLE(total integer, without_login integer, claimed integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not can_view_community_events() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select count(*)::integer,
           (count(*) filter (where p.tier = 'lead' and p.auth_user_id is null))::integer,
           (count(*) filter (where p.auth_user_id is not null))::integer
      from person p
     where p.source_first = 'luma' and p.deleted_at is null;
end $$;

select harden_definer_functions();
