-- 0140 · Welle 6 B7: `partner_format_sessions` nennt die Fläche und den Tag (PART-047, PART-048).
-- Angewendet von der Architektur-Session am 22.09.2026 als 20260922095138.
--
--
-- Anlass: Die Interview-Tables-Seite zeigt **je Tisch** einen Block — ein Partner kann zwei
-- Tische haben und an jedem eine andere Stelle besetzen. Dafür muss sie die Gespräche ihren
-- Tischen zuordnen. Die Funktion liefert bisher nur `stage_name`, und ein Vergleich über den
-- Namen ist genau die Sorte Abkürzung, die erst auffällt, wenn zwei Tische „Tisch 1" heißen
-- und die Gespräche des einen beim anderen stehen.
--
-- Deshalb `stage_id` und `event_day_id` — beides steht im Join ohnehin schon zur Verfügung.
--
-- **Rein additiv.** Grundlage ist die Live-Fassung aus
-- `supabase/snapshot/functions/partner_format_sessions.sql` (0133, live seit 20260921115331);
-- die bestehenden Spalten stehen unverändert in derselben Reihenfolge, die zwei neuen hängen
-- hinten an. Aufrufer, die sie nicht kennen, merken nichts.
--
-- **`room` bewusst nicht dazu.** Der naheliegende dritte Kandidat wäre `stage.room` für die
-- Masterclass. Die Spalte ist heute an **allen** sieben Bühnen leer; gepflegt wird der Name.
-- Eine Spalte auszuliefern, die überall `null` ist, sähe in der Oberfläche wie ein Fehler aus
-- und verleitete dazu, sie zu füllen, statt zu fragen, wo der Raum wirklich stehen soll. Wenn
-- das Team die Masterclass-Räume anlegt, entscheiden wir das mit Daten statt mit einer
-- Vermutung (Notiz für B7b).

set search_path = public, extensions;

-- `create or replace` reicht hier nicht: Postgres lässt den Rückgabetyp einer Funktion nicht
-- ändern, auch nicht durch Anhängen (42P13). Der `drop` ist deshalb kein Freibrief, sondern
-- die einzige Form — Name, Parameter und Rechte bleiben gleich, und weil er in derselben
-- Transaktion steht wie das `create`, gibt es keinen Moment ohne die Funktion.
drop function if exists partner_format_sessions(uuid, text, uuid);

create or replace function partner_format_sessions(p_org_id uuid, p_format text default null, p_edition_id uuid default null)
returns table (id uuid, format text, title_de text, title_en text, description_de text, description_en text,
               language text, access_mode text, capacity integer, publish_status text, format_details jsonb,
               starts_at timestamptz, ends_at timestamptz, stage_name text, day_label_de text,
               applications_total integer, applications_accepted integer, is_host boolean,
               -- neu in 0140
               stage_id uuid, event_day_id uuid)
language plpgsql stable security definer set search_path = public, extensions as $$
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
           st.id, ed.id
      from session se
      join event ev on ev.id = se.event_id
      left join slot sl on sl.id = se.slot_id
      left join stage st on st.id = sl.stage_id
      left join event_day ed on ed.id = sl.event_day_id
     where se.partner_org_id = p_org_id
       and (ev.id = v_oe.edition_id or ev.edition_id = v_oe.edition_id)
       and se.publish_status <> 'cancelled'
       and (p_format is null or se.format = p_format)
     order by sl.start_at nulls last, se.title_de;
end $$;

select harden_definer_functions();
