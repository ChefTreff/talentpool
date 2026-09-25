-- 0186 · Admin-Abschnitte → Rollen in der Datenbank: admin_section_role, has_admin_section (PORT1b, ADM-056)
-- Angewendet von der Architektur-Session am 25.09.2026 als 20260925085557.
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: PORT1b nach ADM-056. Welche Rolle welchen Admin-Abschnitt oeffnet, stand bisher nur in
-- `lib/admin-sections.ts`. Die Seiten-Gates lesen das dort; **SQL-Funktionen konnten es nicht** und
-- schrieben die Rollenliste noch einmal ab — `can_edit_next_up()` und `can_view_community_events()`
-- tragen den Hinweis „dieselbe Rollenliste" sogar im Kommentar. Zwei Abschriften derselben Regel
-- laufen auseinander, und zwar zur falschen Seite: die Seite waere zu, die Schreib-RPC offen.
--
-- Diese Migration legt die Zuordnung als Tabelle an, gibt den RPCs ein Praedikat und der
-- Oberflaeche eine Lesefunktion.
--
-- **Die Vorgabe bleibt im Code.** `lib/admin-sections.ts` ist weiter die Fassung, die im PR gelesen
-- und besprochen wird; die Tabelle ist ihre **Spiegelung**. Damit die Spiegelung nicht altert, haelt
-- `tests/admin-sections.test.ts` beide gegeneinander — jede Zeile hier muss dort stehen und
-- umgekehrt. Wer kuenftig einen Abschnitt hinzufuegt, ohne die Migration zu ergaenzen, faellt im Gate
-- auf, nicht im Betrieb.
--
-- **Jeder Abschnitt bekommt eine `admin`-Zeile**, auch die reinen Verwaltungsabschnitte
-- (`roles: []`). Damit ist die Tabelle zugleich der vollstaendige Katalog der Schluessel, und
-- `has_admin_section` kann einen **Tippfehler** von „darf nicht" unterscheiden: ein unbekannter
-- Schluessel ist ein Programmierfehler und wird laut (`22023`), wie `adminSection()` in TypeScript.
-- Stillschweigend „nein" zu antworten waere fail closed, aber unauffindbar.
--
-- **Reihenfolge der Entscheidung** — genau wie `mayEnterAdminSection` in `lib/admin-access.ts`:
--   1. `admin` sieht alles (und bekommt keine Ausnahmen, sonst schnitte Konrad sich den Rueckweg ab);
--   2. Ausnahme **fuer die Person** (`admin_section_override.person_id`, ADM-053);
--   3. Ausnahme **fuer eine Rolle** — mehrere Rollen: eine offene genuegt (`bool_or`), dieselbe
--      Regel wie bei der Vorgabe;
--   4. die Vorgabe aus dieser Tabelle.
-- Faellt diese Reihenfolge je auseinander, waere die Oberflaeche gnaediger als die Datenbank oder
-- umgekehrt — der Test prueft alle vier Stufen.
--
-- Rechte: die Tabelle hat RLS und **keine** Grants fuer `authenticated`; gelesen wird ausschliesslich
-- ueber `has_admin_section(key)` und `my_admin_sections()` (beide SECURITY DEFINER, gepinnter
-- `search_path`). Geschrieben wird sie nur per Migration — Ausnahmen pflegt Konrad weiter ueber
-- `admin_section_override` (`/admin/rollen`), damit es dafuer genau einen Weg gibt.
-- Basis: `supabase/snapshot/functions/can_edit_next_up.sql`, `can_view_community_events.sql`
-- (Konvention §1). Test: `supabase/tests/v6_port1b_abschnitt_rollen.sql`.

-- 1 · Die Zuordnung
create table if not exists admin_section_role (
  section text not null,
  role text not null,
  primary key (section, role)
);
comment on table admin_section_role is
  'Vorgabe: welche Rolle oeffnet welchen Admin-Abschnitt (PORT1b). Spiegelung von lib/admin-sections.ts, gehalten von tests/admin-sections.test.ts; Ausnahmen stehen in admin_section_override.';

alter table admin_section_role enable row level security;
-- Keine Policy und keine Grants: gelesen wird nur ueber die Funktionen unten.
revoke all on admin_section_role from authenticated, anon;

-- Vollstaendig neu setzen statt zu ergaenzen: die Tabelle ist eine Spiegelung,
-- kein Bestand. Ein `delete` ohne Einfuegen waere fail closed (niemand ausser
-- `admin` kaeme irgendwo hinein) — beides in einer Transaktion, wie jede Migration.
delete from admin_section_role;
insert into admin_section_role (section, role) values
  ('overview', 'admin'),
  ('overview', 'area_lead_talent'),
  ('overview', 'area_lead_speaker'),
  ('overview', 'area_lead_partner'),
  ('overview', 'area_lead_volunteers'),
  ('overview', 'area_lead_hackathon'),
  ('overview', 'area_lead_production'),
  ('overview', 'talent_team'),
  ('overview', 'programme_team'),
  ('overview', 'partner_team'),
  ('overview', 'volunteers_team'),
  ('overview', 'hackathon_team'),
  ('overview', 'production_team'),
  ('overview', 'marketing_team'),
  ('applications', 'admin'),
  ('applications', 'area_lead_talent'),
  ('applications', 'talent_team'),
  ('applications', 'programme_team'),
  ('nextUp', 'admin'),
  ('nextUp', 'marketing_team'),
  ('nextUp', 'area_lead_talent'),
  ('communityEvents', 'admin'),
  ('communityEvents', 'area_lead_talent'),
  ('communityEvents', 'talent_team'),
  ('communityEvents', 'marketing_team'),
  ('programme', 'admin'),
  ('programme', 'programme_team'),
  ('programme', 'area_lead_speaker'),
  ('programme', 'area_lead_production'),
  ('edition', 'admin'),
  ('edition', 'programme_team'),
  ('edition', 'area_lead_production'),
  ('speakers', 'admin'),
  ('speakers', 'area_lead_speaker'),
  ('speakers', 'programme_team'),
  ('speakerLeads', 'admin'),
  ('speakerLeads', 'area_lead_speaker'),
  ('speakerLeads', 'programme_team'),
  ('speakerTickets', 'admin'),
  ('speakerTickets', 'area_lead_speaker'),
  ('speakerTickets', 'programme_team'),
  ('expenses', 'admin'),
  ('expenses', 'area_lead_speaker'),
  ('expenses', 'programme_team'),
  ('hospitality', 'admin'),
  ('hospitality', 'area_lead_speaker'),
  ('hospitality', 'programme_team'),
  ('reception', 'admin'),
  ('reception', 'area_lead_speaker'),
  ('reception', 'programme_team'),
  ('travel', 'admin'),
  ('travel', 'area_lead_speaker'),
  ('travel', 'programme_team'),
  ('travel', 'area_lead_production'),
  ('travel', 'production_team'),
  ('submissions', 'admin'),
  ('submissions', 'area_lead_speaker'),
  ('submissions', 'programme_team'),
  ('regie', 'admin'),
  ('regie', 'area_lead_production'),
  ('regie', 'production_team'),
  ('regie', 'programme_team'),
  ('tech', 'admin'),
  ('tech', 'area_lead_production'),
  ('tech', 'production_team'),
  ('tech', 'area_lead_speaker'),
  ('graphics', 'admin'),
  ('graphics', 'marketing_team'),
  ('graphics', 'area_lead_speaker'),
  ('graphics', 'programme_team'),
  ('partner', 'admin'),
  ('partner', 'area_lead_partner'),
  ('partner', 'partner_team'),
  ('initiatives', 'admin'),
  ('initiatives', 'area_lead_partner'),
  ('initiatives', 'partner_team'),
  ('volunteers', 'admin'),
  ('volunteers', 'area_lead_volunteers'),
  ('volunteers', 'volunteers_team'),
  ('catering', 'admin'),
  ('catering', 'area_lead_production'),
  ('catering', 'production_team'),
  ('catering', 'area_lead_volunteers'),
  ('catering', 'volunteers_team'),
  ('catering', 'area_lead_speaker'),
  ('catering', 'programme_team'),
  ('production', 'admin'),
  ('production', 'production_team'),
  ('production', 'area_lead_production'),
  ('contacts', 'admin'),
  ('contacts', 'area_lead_talent'),
  ('contacts', 'area_lead_speaker'),
  ('contacts', 'area_lead_partner'),
  ('contacts', 'area_lead_volunteers'),
  ('contacts', 'area_lead_hackathon'),
  ('contacts', 'area_lead_production'),
  ('contacts', 'talent_team'),
  ('contacts', 'programme_team'),
  ('contacts', 'partner_team'),
  ('contacts', 'volunteers_team'),
  ('contacts', 'hackathon_team'),
  ('contacts', 'production_team'),
  ('contacts', 'marketing_team'),
  ('deadlines', 'admin'),
  ('deadlines', 'area_lead_talent'),
  ('deadlines', 'area_lead_speaker'),
  ('deadlines', 'area_lead_partner'),
  ('deadlines', 'area_lead_volunteers'),
  ('deadlines', 'area_lead_hackathon'),
  ('deadlines', 'area_lead_production'),
  ('deadlines', 'talent_team'),
  ('deadlines', 'programme_team'),
  ('deadlines', 'partner_team'),
  ('deadlines', 'volunteers_team'),
  ('deadlines', 'hackathon_team'),
  ('deadlines', 'production_team'),
  ('deadlines', 'marketing_team'),
  ('wiki', 'admin'),
  ('wiki', 'area_lead_talent'),
  ('wiki', 'area_lead_speaker'),
  ('wiki', 'area_lead_partner'),
  ('wiki', 'area_lead_volunteers'),
  ('wiki', 'area_lead_hackathon'),
  ('wiki', 'area_lead_production'),
  ('wiki', 'talent_team'),
  ('wiki', 'programme_team'),
  ('wiki', 'partner_team'),
  ('wiki', 'volunteers_team'),
  ('wiki', 'hackathon_team'),
  ('wiki', 'production_team'),
  ('wiki', 'marketing_team'),
  ('videos', 'admin'),
  ('videos', 'marketing_team'),
  ('videos', 'area_lead_speaker'),
  ('videos', 'programme_team'),
  ('ui', 'admin'),
  ('ui', 'area_lead_talent'),
  ('ui', 'area_lead_speaker'),
  ('ui', 'area_lead_partner'),
  ('ui', 'area_lead_volunteers'),
  ('ui', 'area_lead_hackathon'),
  ('ui', 'area_lead_production'),
  ('ui', 'talent_team'),
  ('ui', 'programme_team'),
  ('ui', 'partner_team'),
  ('ui', 'volunteers_team'),
  ('ui', 'hackathon_team'),
  ('ui', 'production_team'),
  ('ui', 'marketing_team'),
  ('vocab', 'admin'),
  ('mail', 'admin'),
  ('persons', 'admin'),
  ('team', 'admin'),
  ('roles', 'admin'),
  ('duplicates', 'admin'),
  ('deletions', 'admin');

-- 2 · Das Praedikat fuer die RPCs
create or replace function has_admin_section(p_key text)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public', 'extensions'
as $$
declare v_me uuid := current_person_id(); v_erlaubt boolean;
begin
  if not exists (select 1 from admin_section_role r where r.section = p_key) then
    -- Tippfehler im Schluessel: laut scheitern. Ein stilles „nein" liesse eine
    -- Funktion fuer immer zu, ohne dass jemand die Ursache faende.
    raise exception 'unknown_section' using errcode = '22023', detail = p_key;
  end if;
  if coalesce(has_role('admin'), false) then return true; end if;
  if v_me is null then return false; end if;

  select o.allowed into v_erlaubt from admin_section_override o
   where o.section = p_key and o.person_id = v_me;
  if found then return v_erlaubt; end if;

  select bool_or(o.allowed) into v_erlaubt from admin_section_override o
   where o.section = p_key and o.role is not null and has_role(o.role);
  if v_erlaubt is not null then return v_erlaubt; end if;

  return exists (select 1 from admin_section_role r where r.section = p_key and has_role(r.role));
end $$;
comment on function has_admin_section(text) is
  'Oeffnet die angemeldete Person diesen Admin-Abschnitt? Person schlaegt Rolle, Rolle schlaegt Vorgabe (PORT1b) — dieselbe Reihenfolge wie mayEnterAdminSection in lib/admin-access.ts.';

-- 3 · Die Lesefunktion fuer die Oberflaeche
create or replace function my_admin_sections()
 returns table(section text, allowed boolean)
 language plpgsql
 stable security definer
 set search_path to 'public', 'extensions'
as $$
begin
  return query
    select r.section, has_admin_section(r.section)
      from (select distinct s.section from admin_section_role s) r
     order by r.section;
end $$;
comment on function my_admin_sections() is
  'Alle Admin-Abschnitte mit der Antwort fuer die angemeldete Person (PORT1b) — eine Abfrage statt einer je Abschnitt.';

-- 4 · Die beiden Funktionen, die die Rollenliste abgeschrieben hatten
--     (`lib/admin-sections.ts` nannte sie im Kommentar beim Namen).
create or replace function can_edit_next_up()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(has_admin_section('nextUp'), false)
$$;

create or replace function can_view_community_events()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(has_admin_section('communityEvents'), false)
$$;

select harden_definer_functions();
