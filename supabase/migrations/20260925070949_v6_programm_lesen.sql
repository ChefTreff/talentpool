-- 0180 · Programm lesen: Entwürfe nur intern und für die eigenen Bühnen (LEAD-032, F10)
-- Angewendet von der Architektur-Session am 25.09.2026 als 20260925070949.
--
-- Vorschlag der Build-Session Speaker-Domäne. Nummer, Anwenden, Umbenennen und
-- der Eintrag ins Entscheidungslog gehören der Architektur-Session.
--
-- Anlass: Sicherheitsbefund des Partner-Chats (24.09., live geprüft).
-- `is_programme_reader()` war `is_staff() or has_role('speaker_manager') or
-- has_role('standbuehne_editor')` — **global**, ohne Blick auf die Bühne. Die
-- Policy `session_read` erlaubte damit jedem Partner mit Standbühnen-Rolle und
-- jedem externen Stage Lead **alle** Sessions samt Entwürfen anderer Partner
-- (Titel, Beschreibung, `format_details` mit Stellen); dasselbe galt für die
-- Planungs-Slots (`slot_read`), die Speaker-Zuordnung (`session_speaker_read`)
-- und die Fragen (`sq_read`, beide über `is_session_visible`).
--
-- **Das Board liest über RLS**, nicht über Definer-Funktionen: `programme_board`,
-- `programme_backlog`, `stage_day_slot_stats` und `programme_public` sind
-- `security_invoker`-Views, und `loadBoard` nimmt den Nutzer-Client. Jede der
-- drei Oberflächen (Admin, Speaker-Leads, Partner-Standbühne) sieht also genau,
-- was diese Policies zulassen.
--
-- Neu:
--   * `is_programme_reader()` = `is_staff()` — nur intern (Admin).
--   * Wer eine Session **bearbeiten** darf, darf sie auch lesen: `can_edit_session`
--     trägt schon die Bühnen-Regel — Programm-Team für die Edition,
--     `speaker_manager`/`standbuehne_editor` für Slots der eigenen Bühne (Scope
--     `stage`, bei Standbühnen auch Scope `org`), eigene Entwürfe ohne Slot.
--     Dasselbe für Slots über `can_edit_slot`. (Die Anregung, dafür
--     `stage_frame_binds` zu nehmen, passt nicht: das Prädikat sagt, ob der
--     Tagesrahmen **bindet**, und ist für Admin und Programm-Team falsch.)
--   * Partner lesen die Sessions ihrer Organisation — `partner_org_id` („hat
--     gebucht") und `host_org_id` („richtet aus"): als Kontakt (`is_partner_of`)
--     **oder** als Standbühnen-Editor der Organisation (`is_standbuehne_editor_of`,
--     Ergänzung Partner-Chat #189: die Standbühnen-Tabelle zeigt auch Entwürfe
--     der Kolleginnen, die noch keinen Slot haben). Nur Scope `org`, nicht über
--     `has_role(…, 'org', …)` — das liesse eine globale Rolle für jede
--     Organisation gelten.
--   * Veröffentlichtes und die eigenen Auftritte (`is_speaker_of`) bleiben.
--   * Der Realtime-Kanal des Boards (`programme-board:<event>`) bekommt ein
--     eigenes Prädikat `is_programme_board_user()` — Admin, Programm-Team und die
--     Rollen mit Bühnen-Scope. Die Nachrichten tragen nur `{table, id, op}`, keine
--     Inhalte; ohne den Kanal stünden die Boards von Stage Leads und Standbühnen
--     still. Das Programm-Team war bisher gar nicht dabei (`is_programme_reader`
--     kannte es nicht) — das ist mit behoben.
--   * `slot_history_read` bleibt bei `is_programme_reader()`: keine Oberfläche liest
--     die Historie, und intern reicht.
--
-- Folge, gewollt: Externe Stage Leads sehen auf **fremden** Bühnen nur noch
-- Rahmen und Veröffentlichtes, im Backlog nur eigene Entwürfe — einplanen können
-- sie fremde Backlog-Sessions ohnehin nicht (`attach_session_to_slot` verlangt
-- `can_edit_session`).
--
-- Funktionen aus `supabase/snapshot/functions/`: `is_programme_reader`,
-- `is_session_visible`; neu sind `is_programme_board_user` und
-- `is_standbuehne_editor_of`. Keine Fehlerschlüssel.

set search_path = public, extensions;

-- ---- 1 · Leserolle nur intern
create or replace function is_programme_reader()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  -- LEAD-032: nur intern. Externe lesen über Veröffentlichung, eigene Auftritte,
  -- ihre Organisation oder die Bühnen, die sie bearbeiten dürfen.
  select is_staff()
$$;

-- ---- 2 · Realtime-Kanal des Boards
create or replace function is_programme_board_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  -- Wer ein Board vor sich haben kann: Admin, Programm-Team, Stage Leads,
  -- Standbühnen. Nur für `programme-board:*` — die Nachrichten tragen keine Inhalte.
  select is_staff() or has_role('programme_team')
      or has_role('speaker_manager') or has_role('standbuehne_editor')
$$;

-- ---- 3 · Standbühnen-Editor einer Organisation (nur Scope org)
create or replace function is_standbuehne_editor_of(p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(p_org_id is not null and exists (
    select 1 from active_roles() ra
     where ra.role = 'standbuehne_editor' and ra.scope_type = 'org' and ra.scope_id = p_org_id), false)
$$;

-- ---- 4 · Sichtbarkeit einer Session (session_speaker_read, sq_read)
create or replace function is_session_visible(p_session_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select is_programme_reader()
      or is_speaker_of(p_session_id)
      or exists (select 1 from session se where se.id = p_session_id
                  and (se.publish_status = 'published'
                       or (se.partner_org_id is not null and is_partner_of(se.partner_org_id))
                       or (se.host_org_id is not null and is_partner_of(se.host_org_id))
                       or is_standbuehne_editor_of(se.partner_org_id)
                       or is_standbuehne_editor_of(se.host_org_id)))
      or can_edit_session(p_session_id)
$$;

-- ---- 5 · Policies
drop policy if exists session_read on session;
create policy session_read on session for select to authenticated
  using (publish_status = 'published'
         or is_programme_reader()
         or is_speaker_of(id)
         or (partner_org_id is not null and is_partner_of(partner_org_id))
         or (host_org_id is not null and is_partner_of(host_org_id))
         or is_standbuehne_editor_of(partner_org_id)
         or is_standbuehne_editor_of(host_org_id)
         or can_edit_session(id));

drop policy if exists slot_read on slot;
create policy slot_read on slot for select to authenticated
  using (slot_type = 'frame'
         or is_programme_reader()
         or slot_has_published_session(id)
         or can_edit_slot(id));

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'realtime' and table_name = 'messages') then
    begin
      execute 'drop policy if exists programme_board_receive on realtime.messages';
      execute $p$create policy programme_board_receive on realtime.messages
                for select to authenticated
                using (realtime.topic() like 'programme-board:%' and public.is_programme_board_user())$p$;
      execute 'drop policy if exists programme_board_send on realtime.messages';
      execute $p$create policy programme_board_send on realtime.messages
                for insert to authenticated
                with check (realtime.topic() like 'programme-board:%' and public.is_programme_board_user())$p$;
    exception when others then
      raise notice 'realtime.messages policies nicht angelegt: %', sqlerrm;
    end;
  end if;
end $$;

select harden_definer_functions();
