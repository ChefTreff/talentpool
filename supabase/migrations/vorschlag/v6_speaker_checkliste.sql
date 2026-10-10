-- NNNN · Checkliste der Speaker: abgeleitet erledigte Punkte wieder öffnen (SPK-082)
-- Vorschlag der Build-Session Speaker-Domäne. Nummer, Zeitstempel, Anwenden und der Eintrag ins Entscheidungslog gehören der Architektur-Session.
--
-- Anlass: Feedbackrunde Konrad & Paulina 05.10.2026 (SPK-082). Die Checkliste auf `/speaker` führt Schritte, die das Portal selbst ableitet (`speaker_next_steps`): Profil,
-- Foto, Einwilligungen, Session, Inhalt der Session, Präsentation, Ticket. Sie werden von selbst erledigt, sobald die Aktion getan ist — „abgehakt, aber kein Foto da“ soll
-- es nie geben (Paulina), deshalb gibt es **vor** der Erledigung keinen Haken von Hand. Konrad (05.10.): ein erledigter Punkt darf aber **wieder geöffnet** werden, und danach
-- wieder von Hand abgehakt. Datenmodell, Rechte und Schnitt von Plan am 09.10.2026 freigegeben.
--
-- Was die Migration tut
--   1  Tabelle `speaker_step_reopen (profile_id, step_key)` — **eine Zeile = die Speakerin (oder ihre Assistenz) hat diesen abgeleitet erledigten Punkt wieder geöffnet.**
--      Gespeichert wird die Ausnahme, nicht der Haken: die abgeleitete Wahrheit (`speaker_next_steps`) bleibt unberührt, es entsteht **keine zweite Wahrheit** neben dem
--      Bucket oder dem Profil. RLS an, **keine Policy, keine Grants** für anon/authenticated (wie `speaker_task_tick`, 0149); gelesen und geschrieben wird nur über die
--      Funktionen unten. Fällt das Profil, fallen die Zeilen mit (`on delete cascade`); die handelnde Person bleibt nur als Verweis (`on delete set null`).
--   2  `my_speaker_step_reopened(p_profile_id)` → `text[]` — die Schlüssel, die gerade wieder offen sind. **Nur** Schlüssel, die abgeleitet erledigt sind
--      (`(speaker_next_steps(profil) ->> schluessel) = 'true'`): Wird ein Punkt inzwischen vom Portal selbst wieder als offen erkannt (Foto gelöscht), zählt die Zeile nicht —
--      und sie gilt wieder, sobald er erledigt ist, ohne Trigger und ohne Aufräumen. Ein nicht anwendbarer Punkt (`session_content`/`presentation` ohne Session: `null`) ist nie
--      „wieder geöffnet“.
--   3  `set_speaker_step_reopened(p_step_key, p_reopened, p_profile_id)` — öffnen (`true`) oder wieder abhaken (`false`). Öffnen nur, wenn der Punkt abgeleitet erledigt ist
--      (sonst `P0001 step_not_done`); abhaken löscht die Zeile (idempotent, ohne Fehler, wenn sie fehlt). **Kein Audit**: es ist eine Selbstauskunft der Speakerin über ihre
--      eigene Liste, keine Aktion des Teams; wer es wann war, steht in der Zeile.
--   4  **Rechteänderung an bestehenden Funktionen (Plan 09.10.: ja):** `my_speaker_tasks` und `set_speaker_task_tick` (0149) prüften `speaker_profile.assistant_person_id`
--      statt `is_speaker_assistant`. Kontakte mit Portalzugang (`speaker_contact.has_access`, SPK-040) setzen diese Spalte nicht — sie sahen die Aufgaben des Teams nicht und
--      konnten sie nicht abhaken, obwohl sie das Profil sonst bearbeiten dürfen (Befund beim Lesen der Nachbarfunktionen). Jetzt gilt dieselbe Prüfung wie überall
--      (`is_speaker_assistant` = `assistant_person_id` **oder** Kontakt mit Zugang). Wer bisher durfte, darf weiter; neu dürfen Kontakte **mit** Zugang, Kontakte ohne Zugang
--      nicht (Test). `fn-diff`: je Funktion eine Zeile.
--
-- Rechte: lesen — das eigene Profil, die Assistenz (`is_speaker_assistant`), das Team (`can_manage_speaker`); schreiben — das eigene Profil und die Assistenz, **nicht** das
-- Team (es sagt nicht für die Speakerin, was sie erledigt hat). Alles andere 42501, ohne Anmeldung 28000, Profil unbekannt P0002. Die Prüfung steht vor der Eingabeprüfung:
-- wer nicht darf, erfährt nicht, welche Schlüssel es gibt.
-- Abgrenzung: die Aufgaben des Teams (`speaker_task`, 0149) sind Punkte ohne hinterlegte Aktion, die die Speakerin selbst abhakt — unverändert; hier geht es nur um die
-- abgeleiteten Schritte.
-- Fehlerschlüssel: 28000 ohne Login · 42501 ohne Recht · P0002 `speaker_not_found` · 22023 `invalid_step` (Schlüssel unbekannt oder leer) · P0001 `step_not_done`
-- (detail = Schlüssel).
set search_path = public, extensions;

create table if not exists speaker_step_reopen (
  profile_id  uuid not null references speaker_profile(id) on delete cascade,
  step_key    text not null,
  -- Wer den Punkt wieder geöffnet hat: die Speakerin oder ihre Assistenz. Fällt die Person, bleibt die Zeile (sie gehört zum Profil), nur der Verweis wird leer.
  reopened_by uuid references person(id) on delete set null,
  reopened_at timestamptz not null default now(),
  primary key (profile_id, step_key),
  -- Die sieben Schlüssel von `speaker_next_steps`. Kommt dort einer hinzu, kommt er hier mit hinzu (der Test hält beide gleich).
  constraint speaker_step_reopen_key_chk
    check (step_key in ('profile', 'photo', 'consents', 'session', 'session_content', 'presentation', 'ticket'))
);

comment on table speaker_step_reopen is
  'Wieder geöffnete Punkte der Speaker-Checkliste (SPK-082): eine Zeile = ein abgeleitet erledigter Schritt (`speaker_next_steps`) wurde von Hand wieder geöffnet. Die Ausnahme, nicht der Haken — die abgeleitete Wahrheit bleibt unberührt; eine Zeile zu einem inzwischen wieder offenen Schritt zählt nicht. Keine Grants, nur über my_speaker_step_reopened / set_speaker_step_reopened.';
comment on column speaker_step_reopen.step_key is
  'Schlüssel aus speaker_next_steps: profile, photo, consents, session, session_content, presentation, ticket.';
comment on column speaker_step_reopen.reopened_by is
  'Speakerin oder ihre Assistenz — wer es wieder geöffnet hat. NULL, wenn die Person inzwischen gelöscht ist.';

alter table speaker_step_reopen enable row level security;
revoke all on speaker_step_reopen from anon, authenticated;

-- ---------------------------------------------------------- Speaker: lesen
/**
 * Die Schlüssel der Punkte, die die Speakerin wieder geöffnet hat — und die jetzt auch abgeleitet erledigt sind.
 *
 * Eigenes Profil, Assistenz oder Team. `coalesce`, weil ein Vergleich mit NULL weder wahr noch falsch ist und `if not NULL` dann nicht auslöst (Lehre aus 0118).
 * `speaker_next_steps` prüft dieselben Rechte noch einmal; wer hier durch ist, kommt dort durch.
 */
create or replace function my_speaker_step_reopened(p_profile_id uuid default null)
returns text[]
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_steps jsonb;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile
   where id = coalesce(p_profile_id, my_speaker_profile_id(null));
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce((v_sp.person_id = v_me or is_speaker_assistant(v_sp.id, v_me)
                   or can_manage_speaker(v_sp.id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  v_steps := speaker_next_steps(v_sp.id);
  return coalesce((
    select array_agg(r.step_key order by r.step_key)
      from speaker_step_reopen r
     where r.profile_id = v_sp.id
       and (v_steps ->> r.step_key) = 'true'), '{}'::text[]);
end $$;

comment on function my_speaker_step_reopened(uuid) is
  'SPK-082: Schlüssel der wieder geöffneten Checklistenpunkte, nur solange der Punkt abgeleitet erledigt ist (speaker_next_steps). Eigenes Profil, Assistenz, Team.';

revoke all on function my_speaker_step_reopened(uuid) from public, anon;
grant execute on function my_speaker_step_reopened(uuid) to authenticated;

-- --------------------------------------------------- Speaker: öffnen / abhaken
/**
 * Einen abgeleitet erledigten Punkt wieder öffnen (`p_reopened = true`) oder wieder als erledigt abhaken (`false`).
 *
 * Nur die Speakerin und ihre Assistenz — das Team nicht. Öffnen geht nur bei einem Punkt, den das Portal selbst als erledigt kennt; sonst gäbe es „offen“ neben einem
 * Zustand, der gar nicht „erledigt“ war, und ein nicht anwendbarer Punkt (ohne Session) hätte nichts zu öffnen. Abhaken löscht die Zeile und ist idempotent.
 * Nur ein ausdrückliches `true` öffnet; `null` zählt wie `false` (die Voreinstellung ist „erledigt“).
 */
create or replace function set_speaker_step_reopened(
  p_step_key text, p_reopened boolean, p_profile_id uuid default null)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id();
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile
   where id = coalesce(p_profile_id, my_speaker_profile_id(null));
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce((v_sp.person_id = v_me or is_speaker_assistant(v_sp.id, v_me)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_step_key is null
     or p_step_key not in ('profile', 'photo', 'consents', 'session', 'session_content', 'presentation', 'ticket') then
    raise exception 'invalid_step' using errcode = '22023', detail = coalesce(p_step_key, 'null');
  end if;

  if p_reopened is true then
    if coalesce(speaker_next_steps(v_sp.id) ->> p_step_key, '') <> 'true' then
      raise exception 'step_not_done' using errcode = 'P0001', detail = p_step_key;
    end if;
    insert into speaker_step_reopen (profile_id, step_key, reopened_by)
    values (v_sp.id, p_step_key, v_me)
    on conflict (profile_id, step_key) do nothing;
  else
    delete from speaker_step_reopen where profile_id = v_sp.id and step_key = p_step_key;
  end if;
end $$;

comment on function set_speaker_step_reopened(text, boolean, uuid) is
  'SPK-082: einen abgeleitet erledigten Checklistenpunkt wieder öffnen (true) oder wieder abhaken (false). Eigenes Profil oder Assistenz, nicht das Team. Kein Audit.';

revoke all on function set_speaker_step_reopened(text, boolean, uuid) from public, anon;
grant execute on function set_speaker_step_reopened(text, boolean, uuid) to authenticated;

-- ------------------------------------------- Rechte-Angleich: Aufgaben des Teams
-- Aus dem Snapshot (`supabase/snapshot/functions/`), je Funktion genau eine Zeile geändert: `v_sp.assistant_person_id = v_me` → `is_speaker_assistant(v_sp.id, v_me)`.
create or replace function my_speaker_tasks(p_profile_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id();
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile
   where id = coalesce(p_profile_id, my_speaker_profile_id(null));
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce((v_sp.person_id = v_me or is_speaker_assistant(v_sp.id, v_me)
                   or can_manage_speaker(v_sp.id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', st.id, 'key', st.key,
             'label_de', st.label_de, 'label_en', st.label_en,
             'description_de', st.description_de, 'description_en', st.description_en,
             'deadline_key', st.deadline_key,
             'done_at', tk.done_at)
           order by st.sort_order, st.key)
      from speaker_task st
      left join speaker_task_tick tk on tk.task_id = st.id and tk.profile_id = v_sp.id
     where st.edition_id = v_sp.edition_id and st.is_active), '[]'::jsonb);
end $$;

create or replace function set_speaker_task_tick(p_task_id uuid, p_done boolean, p_profile_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_task speaker_task%rowtype;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile
   where id = coalesce(p_profile_id, my_speaker_profile_id(null));
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce((v_sp.person_id = v_me or is_speaker_assistant(v_sp.id, v_me)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_task from speaker_task where id = p_task_id;
  if not found then raise exception 'task_not_found' using errcode = 'P0002'; end if;
  if v_task.edition_id <> v_sp.edition_id then
    raise exception 'task_wrong_edition' using errcode = 'P0001';
  end if;
  if not v_task.is_active then
    raise exception 'task_inactive' using errcode = 'P0001';
  end if;

  if p_done then
    insert into speaker_task_tick (profile_id, task_id, done_by)
    values (v_sp.id, p_task_id, v_me)
    on conflict (profile_id, task_id) do nothing;
  else
    delete from speaker_task_tick where profile_id = v_sp.id and task_id = p_task_id;
  end if;
end $$;

select harden_definer_functions();
