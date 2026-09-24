-- 0168 · Welle 6 · Community-Events aus Luma (TAL-007 Stufe 2, D12): luma_sync_event, luma_sync_registration (nur Server), my_community_registrations
-- Angewendet von der Architektur-Session am 24.09.2026 als 20260924142616.
-- 00NN · Community-Events aus Luma im Profil (TAL-007 Stufe 2/3, D12 Hybrid).
--
-- Anlass: D12 (Konrad 24.09.2026): die Events-Seite im Portal liest den Luma-Kalender, die
-- Anmeldung läuft per API mit den Profildaten, Gäste und Teilnahmen laufen zurück ins Profil
-- (Teilnahme-Historie, Segmentierung). Adapter: `lib/luma/` (#170).
--
-- **Kein neues Modell.** Das Kernschema hat den Platz schon (0001): ein Luma-Event wird eine
-- `event`-Zeile mit `format_tag = 'community'`, die Luma-Id steht in `external_ref`
-- (system `luma`, object_type `event`); eine Teilnahme ist eine `registration` mit
-- `source = 'luma'`, `external_source = 'luma'`, `external_ref` = Luma-Gast-Id
-- (`registration_external_uniq` macht den Abgleich idempotent). Der Mail-Trigger an
-- `registration` feuert nur für Sessions — Bestätigung und Erinnerung verschickt Luma.
--
-- Status Luma → `registration_status`: registered → confirmed, pending → applied,
-- waitlist → waitlisted, declined → declined, invited → no_response; Check-in → attended.
--
-- Funktionen:
--   * `luma_sync_event(p_data jsonb) returns uuid` — **nur Server** (Dienstschlüssel): legt
--     das Event an oder zieht Name, Datum, Ort nach.
--   * `luma_sync_registration(...) returns jsonb` — **nur Server**: ordnet einen Gast über die
--     E-Mail einer Person zu und schreibt die Teilnahme. Ohne Person nichts (kein Lead aus
--     Luma, solange das nicht entschieden ist) — Rückgabe `{matched: false}`.
--   * `my_community_registrations()` — die eigenen Teilnahmen mit Luma-Id, für die Events-Seite.
-- Die Anmeldung aus dem Portal schreibt ihre Zeile sofort (Gast-Id noch leer); der Abgleich
-- findet sie über Person × Event und trägt die Gast-Id nach.
--
-- Fehlerschlüssel: 28000, 42501; 22023 `invalid_status`, `luma_event_id_required`;
-- P0002 `event_not_found` (bestehend).
-- Test: supabase/tests/v6_luma_events.sql
set search_path = public, extensions;

create or replace function luma_sync_event(p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_luma text := nullif(btrim(coalesce(p_data->>'luma_id', '')), '');
  v_id uuid;
  v_start timestamptz := nullif(p_data->>'start_at', '')::timestamptz;
  v_end timestamptz := nullif(p_data->>'end_at', '')::timestamptz;
  v_tz text := coalesce(nullif(p_data->>'timezone', ''), 'Europe/Berlin');
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_luma is null then raise exception 'luma_event_id_required' using errcode = '22023'; end if;

  select r.object_id into v_id from external_ref r
   where r.system = 'luma' and r.object_type = 'event' and r.external_id = v_luma;

  if v_id is null then
    insert into event (name, format_tag, is_edition, start_date, end_date, location, timezone, status)
    values (coalesce(nullif(btrim(p_data->>'name'), ''), v_luma), 'community', false,
            (v_start at time zone v_tz)::date, (v_end at time zone v_tz)::date,
            nullif(btrim(p_data->>'city'), ''), v_tz, 'published')
    returning id into v_id;
    insert into external_ref (system, object_type, object_id, external_id, meta)
    values ('luma', 'event', v_id, v_luma, jsonb_build_object('url', p_data->>'url'));
  else
    update event set
      name = coalesce(nullif(btrim(p_data->>'name'), ''), name),
      start_date = coalesce((v_start at time zone v_tz)::date, start_date),
      end_date = coalesce((v_end at time zone v_tz)::date, end_date),
      location = coalesce(nullif(btrim(p_data->>'city'), ''), location),
      timezone = v_tz
     where id = v_id;
    update external_ref set meta = jsonb_build_object('url', p_data->>'url'), updated_at = now()
     where system = 'luma' and object_type = 'event' and object_id = v_id;
  end if;
  return v_id;
end $$;
revoke execute on function luma_sync_event(jsonb) from public, anon, authenticated;

create or replace function luma_sync_registration(
  p_luma_event_id text, p_email text, p_guest_id text, p_status text,
  p_registered_at timestamptz default null, p_checked_in boolean default false
) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_event uuid; v_person uuid; v_reg uuid; v_status text;
  v_guest text := nullif(btrim(coalesce(p_guest_id, '')), '');
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
   where lower(pe.email::text) = lower(btrim(coalesce(p_email, ''))) and p.deleted_at is null
   order by pe.is_primary desc limit 1;
  if v_person is null then return jsonb_build_object('matched', false); end if;

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
  return jsonb_build_object('matched', true, 'registration_id', v_reg, 'status', v_status);
end $$;
revoke execute on function luma_sync_registration(text, text, text, text, timestamptz, boolean) from public, anon, authenticated;

/** Die eigenen Community-Teilnahmen mit Luma-Id — die Events-Seite markiert damit „Angemeldet". */
create or replace function my_community_registrations()
returns table (luma_event_id text, event_id uuid, status text, registered_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id();
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select r.external_id, g.event_id, g.status, g.registered_at
      from registration g
      join external_ref r on r.system = 'luma' and r.object_type = 'event' and r.object_id = g.event_id
     where g.person_id = v_me and g.source = 'luma'
     order by g.registered_at desc;
end $$;

select harden_definer_functions();
