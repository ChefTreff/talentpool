-- 0156 · Welle 6 · Partner am Slot ist der buchende (Korrektur zu 0155/#147): set_session_partner, board_session_refs liest partner_org_id
-- Angewendet von der Architektur-Session am 24.09.2026 als 20260924103948.
--
-- Vorschlag der Build-Session Speaker-Domäne. Nummer, Anwenden, Umbenennen und
-- der Eintrag ins Entscheidungslog gehören der Architektur-Session.
--
-- **Korrektur eines eigenen Fehlers aus #147.** Das Partnerfeld im Board
-- schrieb `host_org_id`. `session` kennt aber zwei Partner-Spalten, und sie
-- bedeuten Verschiedenes (`v6_formate_schema`, 21.09.):
--
--   `host_org_id`    richtet aus (Masterclass, Company Tour …) — zählt in
--                    `sessions_count` und öffnet `/partner/bewerber`;
--   `partner_org_id` hat gebucht, auch beim Talk auf unserer Bühne.
--
-- LEAD-019 meint den gesponserten Slot, also den zweiten Fall. Über
-- `host_org_id` wäre der Sponsor einer Keynote zum Ausrichter geworden, mit
-- Bewerbersicht. Und `upsert_session` nimmt `partner_org_id` gar nicht an —
-- gesetzt hat die Spalte bisher nur `partner_create_session` aus dem
-- Partner-Portal.
--
-- Deshalb eine eigene Funktion `set_session_partner`, `upsert_session` bleibt
-- unberührt (die Partner-Bühne nutzt es mit). Und `board_session_refs` (0155)
-- liefert künftig den buchenden Partner.
--
-- **Beim zweiten Blick auf #147 dazu gefunden:** das Moderationsfeld schrieb
-- `session.moderation_person_id`. Die Spalte liest niemand — weder Portal noch
-- Export. Der Masterplan führt die Moderation als `session_speaker` mit der
-- Rolle `moderator`; dorthin schreibt der Drawer jetzt (über
-- `set_session_speakers`, keine Datenbankänderung nötig). Die Spalte bleibt
-- stehen; sie zu entfernen gehört nicht in eine Korrektur.
--
-- **Wer darf:** `can_edit_session` **und** `can_search_board`. Das erste allein
-- reichte nicht: es schliesst den `standbuehne_editor` ein, und ein Partner
-- könnte an Sessions seiner eigenen Standbühne sonst einen anderen Partner
-- eintragen. Das zweite beschränkt auf Programm-Team und Speaker-Manager der
-- Edition.
--
-- Fehlerschlüssel: 28000 · 42501 · P0002 `session_not_found` ·
-- 22023 `partner_not_in_edition` / `partner_host_mismatch`.

set search_path = public, extensions;

-- ---- board_session_refs (aus dem Snapshot)
-- Zwei Änderungen: der Partner kommt aus `partner_org_id`, und die Moderation
-- fällt heraus. Sie kam aus `session.moderation_person_id` — einer Spalte, die
-- nichts liest. Die Moderation ist ein Eintrag in `session_speaker` mit der
-- Rolle `moderator` (Masterplan), und die liefert `session_speakers_public`
-- ohnehin mit.
create or replace function board_session_refs(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_se session%rowtype;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  if not can_search_board(v_se.event_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'partner', (select jsonb_build_object('id', o.id, 'name', coalesce(o.communication_name, o.legal_name))
                  from organization o where o.id = v_se.partner_org_id));
end $$;

/**
 * Den **buchenden** Partner an eine Session hängen oder abnehmen.
 *
 * Nur Partner **dieser Edition**. Steht schon ein ausrichtender Partner, muss
 * es derselbe sein (`session_org_consistent_chk`) — statt der rohen 23514
 * kommt dann ein Schlüssel, mit dem die Oberfläche etwas sagen kann.
 */
create or replace function set_session_partner(p_session_id uuid, p_org_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_se session%rowtype; v_ed uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id for update;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  if not coalesce(can_edit_session(p_session_id) and can_search_board(v_se.event_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_org_id is not null then
    select coalesce(ev.edition_id, ev.id) into v_ed from event ev where ev.id = v_se.event_id;
    if not exists (select 1 from org_edition oe where oe.org_id = p_org_id and oe.edition_id = v_ed) then
      raise exception 'partner_not_in_edition' using errcode = '22023';
    end if;
    if v_se.host_org_id is not null and v_se.host_org_id <> p_org_id then
      raise exception 'partner_host_mismatch' using errcode = '22023';
    end if;
  end if;

  update session set partner_org_id = p_org_id, updated_by = current_person_id()
   where id = p_session_id;
  perform log_audit('programme.session_partner', 'session', p_session_id::text,
                    jsonb_build_object('partner_org_id', v_se.partner_org_id),
                    jsonb_build_object('partner_org_id', p_org_id));
end $$;

revoke all on function set_session_partner(uuid, uuid) from public, anon;
grant execute on function set_session_partner(uuid, uuid) to authenticated;

select harden_definer_functions();
