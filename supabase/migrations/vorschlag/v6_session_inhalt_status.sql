-- Vorschlag ohne Nummer · Welle 6 · Status der Session-Inhalte für Speaker (SPK-050): my_sessions liefert is_change
--
-- Vorschlag der Build-Session Speaker-Domäne. Nummer, Anwenden, Umbenennen und
-- der Eintrag ins Entscheidungslog gehören der Architektur-Session.
--
-- Anlass: Konrad am 24.09. — unter „Eingereicht" stand „Noch nichts
-- eingereicht", obwohl die Inhalte final im Programm stehen. Gewünscht ist eine
-- Übersicht mit „Eingereicht" / „Veröffentlicht" und für Änderungen
-- „Änderung eingereicht" / „Änderung veröffentlicht".
--
-- Drei der vier Zustände folgen aus dem, was `my_sessions` schon liefert
-- (Status der letzten Einreichung, `publish_status` der Session). „Änderung
-- veröffentlicht" nicht: eine übernommene Einreichung an einer veröffentlichten
-- Session kann die erste Fassung sein oder eine Änderung. Deshalb trägt
-- `latest_submission` jetzt `is_change` — ob **vor** ihr schon eine Einreichung
-- derselben Session übernommen wurde.
--
-- Nur `my_sessions`, aus `supabase/snapshot/functions/`. Rückgabetyp unverändert
-- (der Schlüssel kommt im jsonb dazu), keine neuen Rechte, keine Fehlerschlüssel.
-- Die Oberfläche liest `is_change === true` und fällt ohne den Schlüssel auf
-- „Veröffentlicht" zurück — sie darf vor dieser Migration live gehen.

set search_path = public, extensions;

create or replace function my_sessions()
 RETURNS TABLE(session_id uuid, event_id uuid, event_name text, title_de text, title_en text, description_de text, description_en text, language text, format text, access_mode text, publish_status text, speaker_role text, confirmed boolean, start_at timestamp with time zone, end_at timestamp with time zone, stage_name text, room text, timezone text, co_speakers jsonb, latest_submission jsonb, on_behalf_of jsonb, tech jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select se.id, se.event_id, e.name, se.title_de, se.title_en, se.description_de, se.description_en,
         se.language, se.format, se.access_mode, se.publish_status, ss.role, ss.confirmed,
         sl.start_at, sl.end_at, st.name, st.room, e.timezone,
         coalesce((select jsonb_agg(jsonb_build_object('person_id', p2.id, 'first_name', p2.first_name, 'last_name', p2.last_name, 'role', ss2.role) order by ss2.sort_order)
                   from session_speaker ss2 join person p2 on p2.id = ss2.person_id
                   where ss2.session_id = se.id and ss2.person_id <> ss.person_id), '[]'::jsonb),
         (select to_jsonb(sub) from (
            select s.id, s.title, s.description, s.topics, s.language, s.notes, s.status, s.review_note, s.created_at, s.reviewed_at,
                   -- SPK-050: ob vor dieser Einreichung schon eine übernommen wurde.
                   exists (select 1 from session_submission s0
                            where s0.session_id = s.session_id and s0.status = 'approved'
                              and s0.created_at < s.created_at) as is_change
            from session_submission s where s.session_id = se.id order by s.created_at desc limit 1) sub),
         case when sp.person_id <> current_person_id()
              then jsonb_build_object('person_id', sp.person_id, 'first_name', p.first_name, 'last_name', p.last_name) end,
         coalesce(se.tech, '{}'::jsonb)
  from speaker_profile sp
  join person p on p.id = sp.person_id
  join session_speaker ss on ss.person_id = sp.person_id
  join session se on se.id = ss.session_id
  join event e on e.id = se.event_id and (e.edition_id = sp.edition_id or e.id = sp.edition_id)
  left join slot sl on sl.id = se.slot_id
  left join stage st on st.id = sl.stage_id
  where sp.person_id = current_person_id() or is_speaker_assistant(sp.id, current_person_id())
  order by sl.start_at nulls last, se.title_de
$$;

select harden_definer_functions();
