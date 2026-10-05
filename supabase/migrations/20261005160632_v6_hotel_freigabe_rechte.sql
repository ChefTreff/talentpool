-- 0265 · Hotel-Freigaben für das Speaker-Team, Reisekosten nur Bereichsleitung
-- Angewendet von der Architektur-Session am 05.10.2026 als 20261005160632.
-- NNNN · Hotel-Freigaben für das Speaker-Team: Rechte-Gleichlauf (Befund Speaker-Chat 05.10.2026, ADM-072)
--
-- Anlass: Der Admin-Abschnitt „Hotels“ (`hospitality`) ist laut `lib/admin-sections.ts` für Bereichslead Speaker
-- und Programm-Team geöffnet, die Funktionen dahinter prüften aber `is_staff()` — und das ist
-- `has_role('admin')`. Ein Teammitglied ohne admin-Rolle sah „Hotels“ im Menü und bekam 42501; im neuen
-- Reiter „Hotel“ unter Freigaben (`/admin/einreichungen`) fehlte der Reiter, weil die Seite Arten ausblendet,
-- bei denen die Datenbank abweist. Shuttle und Receptions prüften längst `is_speaker_team(…)`.
--
-- Entscheidung Plan 05.10.2026:
--   (1) `hospitality_admin_overview`, `confirm_hospitality`, `decline_hospitality`: `is_staff()` →
--       `is_speaker_team(…)` (admin, area_lead_speaker, programme_team — dieselbe Gleichung wie Shuttle).
--   (2) `upsert_hospitality_quota` bleibt bei `is_staff()`: Kontingente sind die Kooperation mit dem Hotel
--       (Konrad/Laura), die Verteilung macht das Speaker-Team.
--   (3) Reisekosten: Geld nur über die Bereichsleitung. `is_expense_approver()` (admin oder area_lead_speaker)
--       bleibt; `programme_team` fliegt aus dem Abschnitt `expenses` (`lib/admin-sections.ts` im selben PR),
--       damit Menü und Datenbank dasselbe sagen.
--
-- Nicht angefasst: `cancel_hospitality` — das Team storniert schon heute über `can_manage_speaker(…)`
-- (`is_speaker_team` ist darin enthalten); `is_staff()` ist dort nur einer von vier Zweigen.
-- Funktionen aus dem Snapshot (`supabase/snapshot/functions/`); je Funktion ändert sich genau eine Zeile, das Tor.
-- `coalesce(…, false)`: ein NULL aus einer OR-Kette würde `if not NULL` überspringen (Hotfix 0118).
set search_path = public, extensions;

create or replace function hospitality_admin_overview(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(quota_id uuid, kind text, tier text, label_de text, label_en text, location text, capacity integer, used integer, waitlisted integer, active boolean, window_from timestamp with time zone, window_to timestamp with time zone, bookings jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not coalesce(is_speaker_team(p_edition_id), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select q.id, q.kind, q.tier, q.label_de, q.label_en, q.location, q.capacity, hospitality_used(q.id),
           (select count(*)::integer from hospitality_booking b where b.quota_id = q.id and b.status = 'waitlisted'), q.active, q.window_from, q.window_to,
           coalesce((select jsonb_agg(jsonb_build_object(
                        'id', b.id, 'status', b.status, 'guests', b.guests, 'details', b.details, 'team_note', b.team_note, 'created_at', b.created_at,
                        'profile_id', b.profile_id,
                        'speaker_name', (select btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) from speaker_profile sp join person p on p.id = sp.person_id where sp.id = b.profile_id))
                      order by b.status = 'waitlisted', b.created_at)
                     from hospitality_booking b where b.quota_id = q.id and b.status <> 'cancelled'), '[]'::jsonb)
    from hospitality_quota q
    where p_edition_id is null or q.edition_id = p_edition_id
    order by q.kind, q.sort_order, q.window_from nulls last;
end $$;

create or replace function confirm_hospitality(p_booking_id uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_b hospitality_booking%rowtype; v_q hospitality_quota%rowtype; v_sp speaker_profile%rowtype; v_locale text;
begin
  if not coalesce(is_speaker_team(null), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_b from hospitality_booking where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found' using errcode = 'P0002'; end if;
  if v_b.status = 'cancelled' then raise exception 'booking_cancelled' using errcode = 'P0001'; end if;
  select * into v_q from hospitality_quota where id = v_b.quota_id;
  select * into v_sp from speaker_profile where id = v_b.profile_id;
  update hospitality_booking set status = 'confirmed', confirmed_by = current_person_id(), confirmed_at = now(), team_note = coalesce(nullif(btrim(p_note), ''), team_note)
   where id = p_booking_id;
  update speaker_profile set hospitality_status = 'booked' where id = v_sp.id and hospitality_status in ('eligible', 'requested');
  -- PART-091: an den Empfänger der Speaker-Mails, in dessen Sprache.
  v_locale := speaker_mail_locale(v_sp.id);
  perform queue_speaker_mail('hospitality_confirmed', v_sp.id,
    jsonb_build_object(
      'kind', v_q.kind,
      'quota_label', case when v_locale = 'de' then v_q.label_de else v_q.label_en end,
      'location', coalesce(v_q.location, ''),
      'window', coalesce(mail_fmt_ts(v_q.window_from, 'Europe/Berlin', v_locale), '') || case when v_q.window_to is not null then ' – ' || mail_fmt_ts(v_q.window_to, 'Europe/Berlin', v_locale) else '' end,
      'guests', v_b.guests,
      'details', (select string_agg(key || ': ' || value, ', ') from jsonb_each_text(v_b.details)),
      'team_note', coalesce(p_note, '')),
    'hospitality_booking', v_b.id);
  perform log_audit('hospitality.confirm', 'hospitality_booking', p_booking_id::text, jsonb_build_object('status', v_b.status), jsonb_build_object('status', 'confirmed', 'note', p_note));
end $$;

create or replace function decline_hospitality(p_booking_id uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_b hospitality_booking%rowtype;
begin
  if not coalesce(is_speaker_team(null), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_b from hospitality_booking where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found' using errcode = 'P0002'; end if;
  update hospitality_booking set status = 'cancelled', cancelled_at = now(), team_note = coalesce(nullif(btrim(p_note), ''), team_note) where id = p_booking_id;
  perform log_audit('hospitality.decline', 'hospitality_booking', p_booking_id::text, jsonb_build_object('status', v_b.status), jsonb_build_object('note', p_note));
end $$;

-- === Abschnitt „Reisekosten“: nur die Bereichsleitung ============================================
-- Die Tabelle spiegelt `ADMIN_SECTIONS`; `tests/admin-sections.test.ts` hält beide gegeneinander.
-- Ohne Zeile ist der Löschbefehl ein No-op.
delete from admin_section_role where section = 'expenses' and role = 'programme_team';

select harden_definer_functions();
