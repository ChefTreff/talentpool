-- ADM-053 · Rollenmodell: je Bereich Lead und Team, Abschnitte schaltbar
-- (Nummer vergibt die Architektur-Session.)
--
-- Konrad, 24.09.2026: „je Bereich eine Lead- und eine Team-Rolle, intern"; Partner
-- braucht zusätzlich eine Team-Rolle für Partner **und** Initiativen; Speaker und
-- Programm sind **ein** Bereich (Lead `area_lead_speaker` = Programmleitung, Team
-- `programme_team`). **`speaker_manager` sind die externen Stage Leads und
-- bekommen keinen Admin-Zugang** — sie stehen deshalb nicht mehr in
-- `team_role_keys()`.
--
-- Dazu: Konrad soll Abschnitte **je Rolle und je Person** an- und ausschalten
-- können, ohne dass jemand Code anfasst (`admin_section_override`).
--
-- **Was diese Migration nicht tut:** Sie öffnet keine RPC. Die Datenbank kennt
-- als „Team" bisher fast überall nur `admin` (`is_staff()`); dass eine Seite
-- aufgeht, heisst noch nicht, dass die Funktion dahinter antwortet. Das ist
-- Auflage PORT1b und kommt als eigener Vorschlag. Die vier **Bereichsprädikate**
-- hier unten sind die Ausnahme: ohne sie wäre eine neu vergebene Team-Rolle
-- nicht „noch nicht vollständig", sondern von der ersten Minute an eine Lüge —
-- die Seite ginge auf und jede Abfrage darauf mit 42501 zu Ende.

set search_path = public, extensions;

-- 1 · Die fehlenden Team-Rollen ----------------------------------------------------
-- Vorhanden waren `programme_team` (Speaker und Programm), `production_team` und
-- `marketing_team`. Es fehlen Talent, Partner, Volunteers und Hackathon.
-- `volunteer_lead` bleibt, was es ist: eine **externe** Schichtleitung im
-- Volunteer-Portal, kein Admin-Zugang (sie steht heute fälschlich in
-- `team_role_keys()` — siehe Schritt 3).

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active) values
  ('role', 'talent_team',     'Team Talent',     'Talent team',     22, true),
  ('role', 'partner_team',    'Team Partner',    'Partner team',    23, true),
  ('role', 'volunteers_team', 'Team Volunteers', 'Volunteers team', 24, true),
  ('role', 'hackathon_team',  'Team Hackathon',  'Hackathon team',  25, true)
on conflict (vocabulary, key) do nothing;

-- Klarstellung an den Beschriftungen, damit im Rollen-Bereich sichtbar ist, was
-- nach aussen zeigt und was nach innen.
update vocab_term set label_de = 'Stage Lead (extern)', label_en = 'Stage lead (external)'
 where vocabulary = 'role' and key = 'speaker_manager';
update vocab_term set label_de = 'Volunteer-Lead (extern)', label_en = 'Volunteer lead (external)'
 where vocabulary = 'role' and key = 'volunteer_lead';

-- 2 · Das Partner-Prädikat kennt die neue Team-Rolle ---------------------------------
-- Basis: supabase/snapshot/functions/is_partner_team.sql. Geändert ist genau die
-- Rollenliste. Die anderen Bereiche brauchen hier nichts: `is_production_team()`
-- führt seine Team-Rolle schon, und für Talent, Volunteers und Hackathon gibt es
-- kein eigenes Prädikat — deren Funktionen prüfen `is_staff()` und gehören damit
-- in die Auflage PORT1b, nicht hierher.

create or replace function is_partner_team()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select has_role('admin') or has_role('area_lead_partner') or has_role('partner_team')
$$;

-- `is_production_team()` kennt `production_team` und `area_lead_production`
-- bereits (gegen live geprüft mit `db.sh fn-diff`) — hier ist nichts zu tun.

-- 3 · Wer zählt als Team ---------------------------------------------------------------
-- Basis: supabase/snapshot/functions/team_role_keys.sql. Raus: `speaker_manager`
-- (externe Stage Leads), `volunteer_lead` (externe Schichtleitung) und
-- `checkin_operator` (Gerätekonto am Einlass — ein Tablet ist kein Teammitglied).
-- Rein: die vier neuen Team-Rollen und `marketing_team`, das bisher fehlte,
-- obwohl es Grafiken und Videos pflegt.

create or replace function team_role_keys()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select array['admin',
               'area_lead_talent', 'area_lead_speaker', 'area_lead_partner',
               'area_lead_volunteers', 'area_lead_hackathon', 'area_lead_production',
               'talent_team', 'programme_team', 'partner_team',
               'volunteers_team', 'hackathon_team', 'production_team',
               'marketing_team']::text[]
$$;

-- 4 · Abschnitte je Rolle und je Person schalten -----------------------------------------
-- Die Vorgabe, welche Rolle welchen Abschnitt öffnet, steht in
-- `lib/admin-sections.ts`. Diese Tabelle **ändert** sie punktuell, damit Konrad
-- nicht für jede Ausnahme einen Chat braucht.
--
-- Genau eine der beiden Kennungen ist gesetzt: entweder gilt die Ausnahme für
-- eine Rolle oder für eine Person. Beides zugleich wäre eine dritte Bedeutung,
-- die niemand erklären kann.

create table if not exists admin_section_override (
  id uuid primary key default gen_random_uuid(),
  section text not null,
  -- Kein Fremdschlüssel: `vocab_term` hat den Schlüssel (vocabulary, key), auf
  -- `key` allein lässt sich nicht verweisen. Die RPC prüft gegen das Vokabular.
  role text,
  person_id uuid references person (id) on delete cascade,
  allowed boolean not null,
  note text,
  created_by uuid references person (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_section_override_ziel_chk
    check ((role is null) <> (person_id is null))
);

comment on table admin_section_override is
  'ADM-053: Ausnahmen zur Abschnitts-Vorgabe aus lib/admin-sections.ts. Je Zeile entweder eine Rolle oder eine Person; `allowed` schaltet an oder aus. Person schlägt Rolle, Rolle schlägt Vorgabe; `admin` sieht immer alles und ist nicht abschaltbar.';

-- Ein Ausdrucks-Index statt zweier Teil-Indizes: `unique (section, role, person_id)`
-- wäre wegen der NULL-Semantik kein Schutz (NULL ist nie gleich NULL), und nur
-- auf diese Form kann sich das `on conflict` unten beziehen. Der CHECK oben
-- garantiert, dass immer genau eine der beiden Kennungen gefüllt ist.
create unique index if not exists admin_section_override_ziel_uidx
  on admin_section_override (section, coalesce(role, ''),
                             coalesce(person_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table admin_section_override enable row level security;
-- Keine Policy: gelesen und geschrieben wird ausschliesslich über die RPCs unten.
revoke all on table admin_section_override from anon, authenticated;

drop trigger if exists set_updated_at on admin_section_override;
create trigger set_updated_at before update on admin_section_override
  for each row execute function set_updated_at();

-- 5 · Lesen: was gilt für mich ------------------------------------------------------------
-- Gibt nur die **Ausnahmen** zurück, nicht die Vorgabe: die steht im Code, und
-- zwei Quellen für dieselbe Frage laufen auseinander. Der Aufrufer legt sie
-- übereinander (Person schlägt Rolle schlägt Vorgabe).

create or replace function my_admin_section_overrides()
 RETURNS TABLE(section text, allowed boolean, quelle text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id();
begin
  if v_me is null then return; end if;
  -- `admin` sieht alles; Ausnahmen gelten für ihn nicht. Sonst könnte Konrad
  -- sich mit einem Klick den Weg zurück zum Rollen-Bereich abschalten.
  if has_role('admin') then return; end if;
  return query
    select o.section, o.allowed, 'person'::text
      from admin_section_override o
     where o.person_id = v_me
    union all
    select o.section, bool_or(o.allowed), 'role'::text
      from admin_section_override o
     where o.role is not null
       and has_role(o.role)
       -- Eine Ausnahme je Rolle; hat jemand zwei Rollen und eine davon öffnet
       -- den Abschnitt, ist er offen — dieselbe Regel wie bei der Vorgabe.
       and not exists (select 1 from admin_section_override p
                        where p.section = o.section and p.person_id = v_me)
     group by o.section;
end $$;

-- 6 · Schreiben: nur Konrad ---------------------------------------------------------------

create or replace function set_admin_section_override(
  p_section text, p_allowed boolean, p_role text DEFAULT NULL::text,
  p_person_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid; v_vorher jsonb;
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_section, '')), '') is null then
    raise exception 'section_required' using errcode = '22023';
  end if;
  if (p_role is null) = (p_person_id is null) then
    raise exception 'invalid_target' using errcode = '22023',
      detail = 'entweder Rolle oder Person, nicht beides';
  end if;
  -- `admin` bleibt aussen vor: eine Ausnahme darauf wäre wirkungslos (siehe
  -- `my_admin_section_overrides`) und würde eine Sicherheit vortäuschen.
  if p_role = 'admin' then
    raise exception 'admin_not_overridable' using errcode = 'P0001',
      detail = 'Die Rolle admin sieht immer alles.';
  end if;
  if p_role is not null and not exists (
       select 1 from vocab_term where vocabulary = 'role' and key = p_role and active) then
    raise exception 'invalid_role' using errcode = '22023', detail = p_role;
  end if;
  if p_person_id is not null and not exists (
       select 1 from person where id = p_person_id and deleted_at is null) then
    raise exception 'person_not_found' using errcode = 'P0002', detail = p_person_id::text;
  end if;

  select to_jsonb(o) into v_vorher from admin_section_override o
   where o.section = p_section
     and o.role is not distinct from p_role
     and o.person_id is not distinct from p_person_id;

  insert into admin_section_override (section, role, person_id, allowed, note, created_by)
  values (btrim(p_section), p_role, p_person_id, p_allowed,
          nullif(btrim(coalesce(p_note, '')), ''), current_person_id())
  on conflict (section, coalesce(role, ''), coalesce(person_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set allowed = excluded.allowed, note = excluded.note, updated_at = now()
  returning id into v_id;

  perform log_audit('admin_section.override', 'admin_section_override', v_id::text,
                    coalesce(v_vorher, 'null'::jsonb),
                    jsonb_build_object('section', p_section, 'role', p_role,
                                       'person_id', p_person_id, 'allowed', p_allowed));
  return v_id;
end $$;

create or replace function delete_admin_section_override(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_vorher jsonb;
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  select to_jsonb(o) into v_vorher from admin_section_override o where o.id = p_id;
  if v_vorher is null then
    raise exception 'override_not_found' using errcode = 'P0002', detail = coalesce(p_id::text, 'null');
  end if;
  delete from admin_section_override where id = p_id;
  perform log_audit('admin_section.override_removed', 'admin_section_override', p_id::text, v_vorher, null);
end $$;

-- 7 · Die Liste für den Rollen-Bereich -------------------------------------------------------

create or replace function admin_section_overrides()
 RETURNS TABLE(id uuid, section text, role text, person_id uuid, person_name text,
               allowed boolean, note text, updated_at timestamptz)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select o.id, o.section, o.role, o.person_id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           o.allowed, o.note, o.updated_at
      from admin_section_override o
      left join person p on p.id = o.person_id
     order by o.section, o.role nulls last, p.last_name, p.first_name;
end $$;

select harden_definer_functions();
