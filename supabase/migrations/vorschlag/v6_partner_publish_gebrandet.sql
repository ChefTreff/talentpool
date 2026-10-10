-- 00NN · Veröffentlichen anfragen und freigeben an der gebrandeten Bühne (PART-148 c)
-- Vorschlag des Partner-Chats, noch nicht angewendet. Hängt von 0315 (`session_partner_org`, PART-148 B) ab — die ist live.
--
-- Anlass: 0315 lässt den Partner die Sessions einer gebrandeten Bühne (`stage.kind = 'branded'`: main/side mit Partner) sehen, ihre Texte pflegen und Speaker eintragen — auch die, die das Team ohne
-- `partner_org_id` anlegt. „Veröffentlichen anfragen“ blieb der Standbühne vorbehalten: `partner_request_publish` und `partner_withdraw_publish` lehnen jede Bühne ab, die nicht `partner_booth` ist (42501).
-- Der Kalender im Partnerportal zeigt „Veröffentlichen“ im Schubfach aber schon für jede eigene Bühne, und an der gebrandeten endete der Klick in dieser Abweisung. Dazu kennt die Seite „Freigaben“
-- des Teams (`partner_sessions_pending`, `release_partner_session`) nur Sessions mit gespeicherter Organisation: eine Session, die `partner_update_session` seit 0315 an der gebrandeten Bühne zurück in die
-- Prüfung schickt, stünde dort nicht — und die Rückgabe mit Grund (PART-083) gäbe es für sie nicht.
--
-- Entscheidung (Plan 10.10.): an der gebrandeten Bühne **nichts speichern** und **keine Änderungsmail** (LEAD-063, `session_change_notify` bleibt unberührt). Eine beim Anfragen gespeicherte Organisation
-- gäbe der Session bei jeder späteren Änderung die Mail an den Hauptkontakt — dieselbe, die die Standbühne bekommt und die Plan für die gebrandete Bühne nicht will. Darum **leiten** Anfrage, Liste und
-- Freigabe die Organisation ab (`session_partner_org`), statt sie zu schreiben. Die Standbühne bleibt, wie sie ist: sie speichert die Organisation beim Anfragen (0179).
--
-- Was die Migration tut (vier bestehende Funktionen, jede von der Live-Fassung im Snapshot aus, nur die genannten Zeilen)
--   1  `partner_request_publish` — Bühnenart `stage.kind in ('booth', 'branded')` statt `type = 'partner_booth'`; der Vergleich der Organisation der Session mit der der Bühne geht über den Helfer; die
--      Organisation wird nur an der Standbühne gespeichert (`kind = 'booth'`), an der gebrandeten Bühne bleibt `partner_org_id`, wie es war.
--   2  `partner_withdraw_publish` — Bühnenart und Vergleich wie 1.
--   3  `partner_sessions_pending` — die Organisation (Verbindung und Spalte `org_id`) kommt aus dem Helfer statt aus `session.partner_org_id`.
--   4  `release_partner_session` — dieselbe Ableitung für die Prüfung „ist eine Partner-Session“ (`not_a_partner_session`) und das Audit.
--
-- Rechte (unverändert, nur ihr Gegenstand wächst): Anfrage und Zurücknahme verlangen weiter eine eingeloggte Person und das Recht des Boards auf den Slot (`can_edit_slot`: Standbühnen-Editor der Organisation
-- der Bühne, Programmteam); Liste und Freigabe weiter `is_partner_team()` bzw. `is_programme_editor(<Veranstaltung>)`. Wo die Bühne weder Stand noch gebrandet ist (Hauptbühne, Interview Table, Raum, Side-Event-Ort,
-- ohne Slot), bleibt es bei 42501. Fehlerschlüssel: keine neuen (42501, P0002, P0001 `not_editable`, 22023 `fields_required`).
--
-- Bewusst nicht angefasst: `session_change_notify` (LEAD-063); `is_session_visible`; `freigabe_zaehler` (eine Anfrage wandert von der Liste der Hauptbühnen in die der Partner und wird einmal gezählt);
-- `freigabe_verlauf` (nennt die Organisation nur für gespeicherte — an der gebrandeten Bühne steht der Name der Bühne).
-- Test: `supabase/tests/v6_partner_publish_gebrandet.sql`; Quelltext-Test `tests/part-148-c-veroeffentlichen.test.ts`. Der Wächter `tests/part-148-session-partner-org.test.ts` nimmt `partner_request_publish`,
-- `partner_withdraw_publish` und `partner_sessions_pending` aus der Ausnahmeliste und schaut auch auf `release_partner_session`.

set search_path = public, extensions;


-- ---------------------------------------------------------------- Veröffentlichen anfragen und zurücknehmen

create or replace function partner_request_publish(p_session_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_se session; v_stage stage; v_fehlt text[];
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id for update;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  select st.* into v_stage from slot sl join stage st on st.id = sl.stage_id where sl.id = v_se.slot_id;
  -- Nur Sessions auf einer eigenen Bühne — Standbühne oder gebrandete Bühne (`stage.kind`, PART-148 c) —, mit dem Recht des Boards auf diesen Slot. Die Organisation der Session (eigene, sonst die
  -- der gebrandeten Bühne, `session_partner_org`) darf von der der Bühne nicht abweichen.
  if v_stage.id is null or coalesce(v_stage.kind, '') not in ('booth', 'branded') or v_stage.partner_org_id is null
     or not coalesce(can_edit_slot(v_se.slot_id), false)
     or (v_se.host_org_id is not null and v_se.host_org_id <> v_stage.partner_org_id)
     or coalesce(session_partner_org(p_session_id), v_stage.partner_org_id) <> v_stage.partner_org_id then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_se.publish_status in ('review', 'published') then return v_se.publish_status; end if;
  if v_se.publish_status <> 'draft' then
    raise exception 'not_editable' using errcode = 'P0001', detail = v_se.publish_status;
  end if;
  -- Dieselben Bedingungen wie bei der Freigabe (`release_partner_session`) — vorher, mit Namen.
  v_fehlt := array_remove(array[
    case when nullif(btrim(coalesce(v_se.title_de, '')), '') is null then 'title_de' end,
    case when nullif(btrim(coalesce(v_se.title_en, '')), '') is null then 'title_en' end,
    case when coalesce(nullif(btrim(coalesce(v_se.description_de, '')), ''),
                       nullif(btrim(coalesce(v_se.description_en, '')), '')) is null
         then 'description_de|description_en' end
  ], null);
  if cardinality(v_fehlt) > 0 then
    raise exception 'fields_required' using errcode = '22023', detail = array_to_string(v_fehlt, ', ');
  end if;
  update session
     set publish_status = 'review',
         -- Die Standbühne speichert die Organisation wie bisher: ohne sie fände die Freigabeliste die Session nicht. Die gebrandete Bühne speichert nichts (PART-148, Plan 10.10.): Liste und
         -- Freigabe leiten die Organisation ab, und eine gespeicherte gäbe der Session die Änderungsmail an den Hauptkontakt (LEAD-063), die Plan dort nicht will.
         partner_org_id = case when v_stage.kind = 'booth' then coalesce(partner_org_id, v_stage.partner_org_id) else partner_org_id end,
         updated_by = current_person_id()
   where id = p_session_id;
  perform log_audit('partner.session_publish_requested', 'session', p_session_id::text,
                    jsonb_build_object('publish_status', v_se.publish_status),
                    jsonb_build_object('publish_status', 'review', 'org_id', v_stage.partner_org_id));
  return 'review';
end $$;

create or replace function partner_withdraw_publish(p_session_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_se session; v_stage stage;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id for update;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  select st.* into v_stage from slot sl join stage st on st.id = sl.stage_id where sl.id = v_se.slot_id;
  -- PART-148 c: Standbühne und gebrandete Bühne, wie bei der Anfrage.
  if v_stage.id is null or coalesce(v_stage.kind, '') not in ('booth', 'branded') or v_stage.partner_org_id is null
     or not coalesce(can_edit_slot(v_se.slot_id), false)
     or coalesce(session_partner_org(p_session_id), v_stage.partner_org_id) <> v_stage.partner_org_id then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_se.publish_status <> 'review' then return v_se.publish_status; end if;
  update session set publish_status = 'draft', updated_by = current_person_id() where id = p_session_id;
  perform log_audit('partner.session_publish_withdrawn', 'session', p_session_id::text,
                    jsonb_build_object('publish_status', 'review'), jsonb_build_object('publish_status', 'draft'));
  return 'draft';
end $$;

-- ---------------------------------------------------------------- Freigabeliste und Freigabe des Teams

create or replace function partner_sessions_pending(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(session_id uuid, org_id uuid, org_name text, format text, title_de text, starts_at timestamp with time zone, stage_name text, format_details jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  -- `is_programme_editor(null)` war immer false: die Funktion sucht
  -- `where ev.id = p_event_id`, und mit NULL trifft das nie. Also mit der
  -- Edition prüfen, die ohnehin übergeben wird. Ohne Edition bleibt es beim
  -- Partner-Team — für eine Liste über alles gibt es keinen Scope zu prüfen.
  if not coalesce(is_partner_team()
                  or (p_edition_id is not null and is_programme_editor(p_edition_id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select se.id, o.id, coalesce(o.communication_name, o.legal_name), se.format, se.title_de,
           sl.start_at, st.name, se.format_details, se.created_at
      from session se
      -- PART-148 c: die Organisation der Session abgeleitet — eigene, sonst die der gebrandeten Bühne (`session_partner_org`); eine Anfrage dort speichert keine.
      join organization o on o.id = session_partner_org(se.id)
      join event ev on ev.id = se.event_id
      left join slot sl on sl.id = se.slot_id
      left join stage st on st.id = sl.stage_id
     -- Der Formatfilter ist gefallen (Auflage 4): seit einer Textänderung eine
     -- veröffentlichte Session zurück auf `review` schickt, kann auch ein Talk oder eine
     -- Masterclass hier landen. Mit dem alten Filter wäre sie aus dem Programm verschwunden,
     -- ohne dass sie jemand in der Warteschlange gesehen hätte.
     where se.publish_status = 'review'
       and (p_edition_id is null or ev.id = p_edition_id or ev.edition_id = p_edition_id)
     order by se.created_at;
end $$;

create or replace function release_partner_session(p_session_id uuid, p_approved boolean, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_se session; v_org uuid; v_fehlt text[];
begin
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  -- Erst laden, dann prüfen: das Recht hängt an der Veranstaltung der Session.
  -- Vorher stand hier `is_programme_editor(null)` — immer false, die
  -- Programmleitung war ausgesperrt (LEAD-022).
  if not coalesce(is_partner_team() or is_programme_editor(v_se.event_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- PART-148 c: die Organisation abgeleitet — eigene, sonst die der gebrandeten Bühne (`session_partner_org`)
  v_org := session_partner_org(p_session_id);
  if v_org is null then
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
                    jsonb_build_object('org_id', v_org, 'note', nullif(btrim(coalesce(p_note, '')), '')));
end $$;

select harden_definer_functions();
