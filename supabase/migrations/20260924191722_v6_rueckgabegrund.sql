-- 0172 · Rückgabegrund der Programmleitung für den Partner (PART-083)
-- Angewendet von der Architektur-Session am 24.09.2026 als 20260924191722.
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: Befund des Speaker-Chats (#152), übergeben an Partner — „Der Rückgabegrund einer
-- abgelehnten Freigabe (`release_partner_session`, PART-050) steht nur im Audit-Log — keine
-- Partner-Seite zeigt ihn." Ohne Grund weiss der Partner nicht, was er ändern soll; genau dafür
-- verlangt die Funktion ihn (`fields_required`, detail `note`).
--
-- **Warum eine eigene Tabelle und keine Spalte an `session`.** `session` hat einen Tabellen-Grant
-- SELECT für `authenticated`; die Policy `session_read` lässt veröffentlichte Sessions, das
-- Programm-Team (`is_programme_reader()`) **und die Speaker der Session** (`is_speaker_of(id)`)
-- lesen. Eine Spalte `return_note` wäre damit für die Speaker direkt über die API lesbar — eine
-- interne Rückmeldung an den Partner. Eine Spalten-Rücknahme greift gegen einen Tabellen-Grant
-- nicht (0032). Deshalb `partner_session_return`: RLS an, **keine** Grants; lesen und schreiben
-- nur die Definer-Funktionen.
--
-- **Lebensdauer:** eine Zeile je Session, der jüngste Grund. `release_partner_session` schreibt sie
-- bei der Rückgabe (Upsert: eine zweite Rückgabe ersetzt die erste) und löscht sie bei der
-- Freigabe — eine freigegebene Session hat keinen offenen Grund mehr. Der Verlauf bleibt, wie
-- bisher, im Audit (`partner.session_rejected` mit `note`).
--
-- **Lesen:** `partner_format_sessions` liefert `return_note` und `returned_at` am Ende
-- (drop + create, die bisherigen Spalten bleiben in Reihenfolge und Bedeutung). Die Formatseiten
-- (Side-Event, Interview Tables, Euer Talk) und die Standbühne zeigen den Grund damit an.

set search_path = public, extensions;

-- ---------------------------------------------------------------- 1) Tabelle

create table if not exists partner_session_return (
  session_id  uuid primary key references session (id) on delete cascade,
  note        text not null check (length(btrim(note)) > 0),
  returned_at timestamptz not null default now(),
  returned_by uuid references person (id) on delete set null
);
comment on table partner_session_return is
  'Jüngster Rückgabegrund der Programmleitung je Partner-Session (PART-083). Schreibt release_partner_session (Rückgabe: Upsert, Freigabe: löschen); lesen nur Definer-Funktionen — keine Grants, damit ihn Speaker der Session nicht über session lesen.';
alter table partner_session_return enable row level security;
revoke all on partner_session_return from public, anon, authenticated;

-- ---------------------------------------------------------------- 2) Geänderte Funktionen (Live-Fassung aus dem Snapshot)

-- Freigabe/Rückgabe: den Grund für den Partner festhalten.
create or replace function release_partner_session(p_session_id uuid, p_approved boolean, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_se session; v_fehlt text[];
begin
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  -- Erst laden, dann prüfen: das Recht hängt an der Veranstaltung der Session.
  -- Vorher stand hier `is_programme_editor(null)` — immer false, die
  -- Programmleitung war ausgesperrt (LEAD-022).
  if not coalesce(is_partner_team() or is_programme_editor(v_se.event_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_se.partner_org_id is null then
    raise exception 'not_editable' using errcode = 'P0001', detail = 'not_a_partner_session';
  end if;
  if p_approved is false and nullif(btrim(coalesce(p_note, '')), '') is null then
    -- Eine Ablehnung ohne Grund kann der Partner nicht beheben.
    raise exception 'fields_required' using errcode = '22023', detail = 'note';
  end if;

  -- **Auflage der Architektur-Session (21.09.).** Vorher setzte die Freigabe `published` und
  -- lief in den Trigger `session_publish_check` — der wirft 23514 mit einem englischen
  -- Klartext. Der Fehlerschlüssel-Vertrag kennt 23514 nicht, die Oberfläche hätte also einen
  -- rohen Datenbanktext angezeigt, und das Team hätte raten dürfen, was fehlt.
  --
  -- Dieselben drei Bedingungen, nur vorher und mit Namen: Slot, beide Titel, mindestens eine
  -- Beschreibung. Sie stehen hier bewusst noch einmal statt als Verweis — der Trigger bleibt
  -- die harte Grenze, diese Prüfung ist die freundliche davor. Weicht der Trigger später ab,
  -- scheitert die Freigabe immer noch, nur wieder mit 23514; still falsch werden kann es nicht.
  --
  -- `partner_create_session` verlangt den englischen Titel **nicht** — im Entwurf darf der
  -- Partner unvollständig sein. Erst die Freigabe braucht beides.
  if p_approved then
    v_fehlt := array_remove(array[
      case when v_se.slot_id is null then 'slot' end,
      case when nullif(btrim(coalesce(v_se.title_de, '')), '') is null then 'title_de' end,
      case when nullif(btrim(coalesce(v_se.title_en, '')), '') is null then 'title_en' end,
      case when coalesce(nullif(btrim(coalesce(v_se.description_de, '')), ''),
                         nullif(btrim(coalesce(v_se.description_en, '')), '')) is null
           then 'description_de|description_en' end
    ], null);
    if cardinality(v_fehlt) > 0 then
      raise exception 'fields_required' using errcode = '22023',
        detail = array_to_string(v_fehlt, ', ');
    end if;
  end if;

  update session set
    publish_status = case when p_approved then 'published' else 'draft' end,
    updated_by = current_person_id()
  where id = p_session_id;
  -- Der Slot zieht mit: freigegeben heißt final, abgelehnt heißt wieder angefragt.
  update slot set status = case when p_approved then 'final' else 'requested' end
   where id = v_se.slot_id;

  -- PART-083: der Grund muss beim Partner ankommen, nicht nur im Audit. Freigegeben heisst: kein
  -- offener Grund mehr; eine zweite Rückgabe ersetzt die erste.
  if p_approved then
    delete from partner_session_return where session_id = p_session_id;
  else
    insert into partner_session_return (session_id, note, returned_at, returned_by)
    values (p_session_id, btrim(p_note), now(), current_person_id())
    on conflict (session_id) do update
      set note = excluded.note, returned_at = excluded.returned_at, returned_by = excluded.returned_by;
  end if;

  perform log_audit(case when p_approved then 'partner.session_released' else 'partner.session_rejected' end,
                    'session', p_session_id::text,
                    jsonb_build_object('publish_status', v_se.publish_status),
                    jsonb_build_object('org_id', v_se.partner_org_id, 'note', nullif(btrim(coalesce(p_note, '')), '')));
end $$;

-- Formatseiten: Rückgabegrund am Ende (42P13: neuer Rückgabetyp, daher drop + create;
-- die bisherigen Spalten bleiben in Reihenfolge und Bedeutung).
drop function if exists partner_format_sessions(uuid, text, uuid);
create or replace function partner_format_sessions(p_org_id uuid, p_format text DEFAULT NULL::text, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, format text, title_de text, title_en text, description_de text, description_en text, language text, access_mode text, capacity integer, publish_status text, format_details jsonb, starts_at timestamp with time zone, ends_at timestamp with time zone, stage_name text, day_label_de text, applications_total integer, applications_accepted integer, is_host boolean, stage_id uuid, event_day_id uuid, return_note text, returned_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition;
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  return query
    select se.id, se.format, se.title_de, se.title_en, se.description_de, se.description_en,
           se.language, se.access_mode, se.capacity, se.publish_status, se.format_details,
           sl.start_at, sl.end_at, st.name, ed.label_de,
           (select count(*)::integer from application a where a.session_id = se.id),
           (select count(*)::integer from application a where a.session_id = se.id and a.status in ('accepted','confirmed')),
           (se.host_org_id = p_org_id),
           st.id, ed.id,
           -- PART-083: der offene Rückgabegrund der Programmleitung, falls es einen gibt.
           rr.note, rr.returned_at
      from session se
      join event ev on ev.id = se.event_id
      left join slot sl on sl.id = se.slot_id
      left join stage st on st.id = sl.stage_id
      left join event_day ed on ed.id = sl.event_day_id
      left join partner_session_return rr on rr.session_id = se.id
     where se.partner_org_id = p_org_id
       and (ev.id = v_oe.edition_id or ev.edition_id = v_oe.edition_id)
       and se.publish_status <> 'cancelled'
       and (p_format is null or se.format = p_format)
     order by sl.start_at nulls last, se.title_de;
end $$;

select harden_definer_functions();
