-- NNNN · Freigabe-Verlauf: „Bereits freigegeben“ je Reiter der zentralen Freigabe-Übersicht (ADM-081 Teil 2, Konrad 05.10.2026)
--
-- Anlass: Unter den offenen Einträgen jedes Reiters (`/admin/einreichungen`) soll eine eingeklappte Ansicht „Bereits
-- freigegeben“ stehen — mit Datum und wer entschieden hat, zuletzt zuerst, in Seiten („mehr laden“) — damit der Überblick
-- bleibt, was schon entschieden ist. Keine neue Tabelle: gelesen wird, was die Entscheidungen ohnehin hinterlassen.
--
-- Vertrag: `freigabe_verlauf(p_art, p_limit, p_before_at, p_before_id)` → Zeilen
--   (objekt_id, entschieden_am, entschieden_von, titel, detail, notiz, betrag_cents, termin), neueste zuerst.
--   p_art          'inhalte' | 'slots' | 'reisekosten' | 'hotel' | 'shuttle' — sonst 22023 `invalid_art`
--   p_limit        Standard 20, hart auf 50 gedeckelt (die Oberfläche fragt 21, zeigt 20 und weiß so, ob es mehr gibt)
--   p_before_*     Keyset-Blättern: Zeitpunkt **und** Kennung der letzten Zeile der Vorseite, nur beide oder keins
--                  (sonst 22023 `invalid_cursor`); gelesen wird, was **vor** diesem Paar steht. Kein Offset.
--   Nur **positive** Entscheidungen (Konrad: „was bereits freigegeben wurde“); Abgelehntes bleibt außen vor.
--
-- Quellen je Art (alle vorhanden, nichts wird gespeichert):
--   inhalte      session_submission im Stand `approved`            · reviewed_at / reviewed_by · Titel des Vorschlags, Einreichende, review_note
--   slots        audit_log `session.publish` und `partner.session_released` (es gibt kein published_at an der Session)
--                                                                   · Zeitpunkt und Akteur des Audit-Eintrags · Sessiontitel, Bühne (und Partner), Slotbeginn
--   reisekosten  expense_claim im Stand `approved` oder `paid`    · reviewed_at / reviewed_by · Speaker, Rechnungsnummer, Betrag in Cent, review_note
--   hotel        hospitality_booking im Stand `confirmed`          · confirmed_at / confirmed_by · Speaker, Kontingent, team_note
--   shuttle      shuttle_booking im Stand `confirmed`              · confirmed_at / confirmed_by · Fahrgast, Strecke, note, Abholzeit
-- Aus `audit_log` kommen **nur Akteur und Zeitpunkt** — kein Text aus before/after.
--
-- Rechte (Plan 05.10.2026): die Funktion ist DEFINER, also bildet das Tor je Art die Rechtelage der Listen nach —
-- `has_admin_section(<Abschnitt>)` **und** das Tor der Listenfunktion; ohne Recht 42501, wie bei der Liste:
--   inhalte      Abschnitt submissions + my_manager_scope().is_manager; Zeilen wie pending_submissions (can_edit_session oder can_manage_speaker)
--   slots        Abschnitt programme + is_programme_editor(<Summit>) (admin, programme_team) — **nicht** area_lead_speaker allein: das
--                Board zeigt ihm über die RLS (session_read/slot_read) kein Unveröffentlichtes, der Verlauf soll nicht mehr verraten
--   reisekosten  Abschnitt expenses + is_expense_approver() (admin, area_lead_speaker)
--   hotel        Abschnitt hospitality + is_speaker_team(null) (seit 0265)
--   shuttle      Abschnitt hospitality + is_speaker_team(null); jüngste Edition wie shuttle_bookings_admin
-- Der Summit ist derselbe wie im Zähler und im Board (`boardEvents`): nur Veranstaltungen mit Bühnen, Summit zuerst.
--
-- Datenschutz: je Zeile nur, was die offene Liste ohnehin zeigt (Name der Speaker bzw. des Fahrgasts, Titel, Betrag,
-- Kontingent, Notiz) plus Vor- und Nachname der entscheidenden Person aus dem Team (Teamnamen sind im Admin sichtbar).
-- Keine E-Mail, keine Bankdaten, keine Spalten aus `person` außer den Namen.
set search_path = public, extensions;

create or replace function freigabe_verlauf(
  p_art       text,
  p_limit     integer     default 20,
  p_before_at timestamptz default null,
  p_before_id uuid        default null)
 returns table (
   objekt_id       uuid,
   entschieden_am  timestamptz,
   entschieden_von text,
   titel           text,
   detail          text,
   notiz           text,
   betrag_cents    integer,
   termin          timestamptz)
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'extensions'
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_event uuid;
  v_ed    uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_art is null or p_art not in ('inhalte', 'slots', 'reisekosten', 'hotel', 'shuttle') then
    raise exception 'invalid_art' using errcode = '22023', detail = coalesce(p_art, 'null');
  end if;
  -- Das Paar gehört zusammen: nur einer von beiden hieße „irgendwo mittendrin“, und das lässt sich nicht lesen.
  if (p_before_at is null) <> (p_before_id is null) then
    raise exception 'invalid_cursor' using errcode = '22023';
  end if;

  if p_art = 'inhalte' then
    if not (has_admin_section('submissions') and coalesce((my_manager_scope() ->> 'is_manager')::boolean, false)) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    return query
      select s.id, s.reviewed_at,
             (select nullif(btrim(coalesce(d.first_name, '') || ' ' || coalesce(d.last_name, '')), '') from person d where d.id = s.reviewed_by),
             coalesce(nullif(btrim(s.title), ''), nullif(btrim(se.title_de), ''), nullif(btrim(se.title_en), ''), '—'),
             (select nullif(btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')), '') from person e where e.id = s.submitted_by),
             s.review_note, null::integer, null::timestamptz
        from session_submission s
        join session se on se.id = s.session_id
       where s.status = 'approved'
         and s.reviewed_at is not null
         and (coalesce(can_edit_session(se.id), false) or coalesce(can_manage_speaker(s.speaker_profile_id), false))
         and (p_before_at is null or (s.reviewed_at, s.id) < (p_before_at, p_before_id))
       order by s.reviewed_at desc, s.id desc
       limit v_limit;

  elsif p_art = 'slots' then
    -- Derselbe Summit wie im Zähler und im Board: nur Veranstaltungen mit Bühnen, Summit zuerst.
    select e.id into v_event
      from event e
     where not e.is_edition
       and exists (select 1 from stage st where st.event_id = e.id)
     order by (e.format_tag is distinct from 'summit'), e.start_date
     limit 1;
    if not (has_admin_section('programme') and v_event is not null and coalesce(is_programme_editor(v_event), false)) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    return query
      select se.id, a.created_at,
             (select nullif(btrim(coalesce(d.first_name, '') || ' ' || coalesce(d.last_name, '')), '') from person d where d.id = a.actor_person_id),
             coalesce(nullif(btrim(se.title_de), ''), nullif(btrim(se.title_en), ''), '—'),
             nullif(btrim(coalesce(st.name, '')
                          || case when o.id is not null then ' · ' || coalesce(o.communication_name, o.legal_name) else '' end), ''),
             null::text, null::integer, sl.start_at
        from audit_log a
        join session se on se.id::text = a.object_id
        left join slot sl on sl.id = se.slot_id
        left join stage st on st.id = sl.stage_id
        left join organization o on o.id = se.partner_org_id
       where a.object_type = 'session'
         and a.action in ('session.publish', 'partner.session_released')
         and se.event_id = v_event
         and (p_before_at is null or (a.created_at, se.id) < (p_before_at, p_before_id))
       order by a.created_at desc, se.id desc
       limit v_limit;

  elsif p_art = 'reisekosten' then
    if not (has_admin_section('expenses') and coalesce(is_expense_approver(), false)) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    return query
      select c.id, c.reviewed_at,
             (select nullif(btrim(coalesce(d.first_name, '') || ' ' || coalesce(d.last_name, '')), '') from person d where d.id = c.reviewed_by),
             coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), '—'),
             c.invoice_no, c.review_note, c.amount_cents, null::timestamptz
        from expense_claim c
        join speaker_profile sp on sp.id = c.profile_id
        join person p on p.id = sp.person_id
       where c.status in ('approved', 'paid')
         and c.reviewed_at is not null
         and (p_before_at is null or (c.reviewed_at, c.id) < (p_before_at, p_before_id))
       order by c.reviewed_at desc, c.id desc
       limit v_limit;

  elsif p_art = 'hotel' then
    if not (has_admin_section('hospitality') and coalesce(is_speaker_team(null), false)) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    return query
      select b.id, b.confirmed_at,
             (select nullif(btrim(coalesce(d.first_name, '') || ' ' || coalesce(d.last_name, '')), '') from person d where d.id = b.confirmed_by),
             coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), '—'),
             coalesce(nullif(btrim(q.label_de), ''), q.label_en), b.team_note, null::integer, null::timestamptz
        from hospitality_booking b
        join hospitality_quota q on q.id = b.quota_id
        join speaker_profile sp on sp.id = b.profile_id
        join person p on p.id = sp.person_id
       where b.status = 'confirmed'
         and b.confirmed_at is not null
         and (p_before_at is null or (b.confirmed_at, b.id) < (p_before_at, p_before_id))
       order by b.confirmed_at desc, b.id desc
       limit v_limit;

  else
    -- shuttle: die Fahrtliste der Seite liest die jüngste Edition (`shuttle_bookings_admin`).
    if not (has_admin_section('hospitality') and coalesce(is_speaker_team(null), false)) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    select e.id into v_ed from event e where e.is_edition order by e.start_date desc limit 1;
    return query
      select b.id, b.confirmed_at,
             (select nullif(btrim(coalesce(d.first_name, '') || ' ' || coalesce(d.last_name, '')), '') from person d where d.id = b.confirmed_by),
             b.passenger_name, b.pickup_location || ' → ' || b.dropoff_location, b.note, null::integer, b.pickup_at
        from shuttle_booking b
        join speaker_profile sp on sp.id = b.profile_id
       where sp.edition_id = v_ed
         and b.status = 'confirmed'
         and b.confirmed_at is not null
         and (p_before_at is null or (b.confirmed_at, b.id) < (p_before_at, p_before_id))
       order by b.confirmed_at desc, b.id desc
       limit v_limit;
  end if;
end $$;

comment on function freigabe_verlauf(text, integer, timestamptz, uuid) is
  'Bereits Freigegebenes je Art der Freigabe-Übersicht, neueste zuerst, Keyset-Blättern (Deckel 50). Tor je Art wie die Liste; aus audit_log nur Akteur und Zeitpunkt.';

revoke execute on function freigabe_verlauf(text, integer, timestamptz, uuid) from public, anon;
grant execute on function freigabe_verlauf(text, integer, timestamptz, uuid) to authenticated;

select harden_definer_functions();
