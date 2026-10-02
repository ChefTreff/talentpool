-- 0000 · Schichtmodell Volunteers: Bereiche, Vorlagen, Wunschschichten, Sicherheitsunterweisung (VOL-002)
-- Anlass: docs/volunteers-schichtmodell-vorschlag.md, Konrads Antworten K-44 (02.10.2026):
-- Blöcke 4–6 h mit Warnung ab 8 h (nur Oberfläche, keine Sperre); Bereichsliste S1 vorerst
-- unverändert; Vorlagen S3 mitbauen; Sicherheitsunterweisung für alle Pflicht; Zuteilung durch das
-- Team, aber mindestens eine Wunschschicht je Volunteer; Planstellen 2026 ohne Personen als Grundlage.
--
-- Das Grundmodell (`shift`, `shift_assignment`, assign/confirm/decline, Erinnerungen) bleibt; diese
-- Migration ergänzt nur:
--   1 Vokabular `volunteer_area`: die 15 Bereiche aus S1 (live bisher leer).
--   2 `shift_template` (S3): Vorlage je Bereich und Position mit Uhrzeiten (Ortszeit des Events);
--     `shift.template_id` + Unique (template_id, event_day_id) macht das Anwenden auf Tage
--     idempotent. RPCs `shift_templates`, `upsert_shift_template`, `delete_shift_template`,
--     `apply_shift_templates` (Team = is_volunteer_team, Audit).
--   3 Sicherheitsunterweisung (Pflicht für alle): `volunteer_profile.safety_ack_at/_version`, einmal
--     je Edition; `ack_volunteer_safety`, `my_volunteer_safety`, `volunteers_without_safety_ack` (Team); `confirm_shift` (Live-Fassung aus dem
--     Snapshot) verweigert ohne Bestätigung mit `safety_ack_required`.
--   4 `shift_wish` (Wunschschichten): angenommene Volunteers wählen 1–5 aktive Schichten
--     (`set_my_shift_wishes`, `wishable_shifts`); das Team sieht Wünsche je Schicht und wer noch keine
--     hat (`shift_wishes`, `volunteers_without_wish`). Zugeteilt wird weiter von Hand (assign_shift).
-- Die Tabellen haben RLS an und keine Grants; Zugriff nur über Definer-Funktionen. Wünsche sind eigene
-- Daten der Volunteers (wie das Profil, kein Audit); Vorlagen und die Unterweisung (nur person_id)
-- schreiben ins Audit.
-- Fehlerschlüssel neu: safety_ack_required, wish_required, too_many_wishes, template_not_found,
-- invalid_times (lib/rpc-error.ts + Wörterbücher).
-- Test: supabase/tests/v6_volunteers_schichtmodell.sql
set search_path = public, extensions;

-- ---------------------------------------------------------------- 1 · Bereiche (S1)

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active)
select v.* from (values
  ('volunteer_area', 'stage_management',  'Stage Management',    'Stage management',    1, true),
  ('volunteer_area', 'accreditation',     'Akkreditierung',      'Accreditation',       2, true),
  ('volunteer_area', 'access_control',    'Zutrittskontrolle',   'Access control',      3, true),
  ('volunteer_area', 'construction',      'Construction',        'Construction',        4, true),
  ('volunteer_area', 'sustainability',    'Sustainability',      'Sustainability',      5, true),
  ('volunteer_area', 'speakers_care',     'Speakers Care',       'Speakers care',       6, true),
  ('volunteer_area', 'speaker_lounge',    'Speaker Lounge',      'Speaker lounge',      7, true),
  ('volunteer_area', 'cloakroom',         'Cloakroom',           'Cloakroom',           8, true),
  ('volunteer_area', 'info_point',        'Info Point',          'Info point',          9, true),
  ('volunteer_area', 'marketing',         'Marketing',           'Marketing',          10, true),
  ('volunteer_area', 'masterclasses',     'Masterclasses',       'Masterclasses',      11, true),
  ('volunteer_area', 'hackathon',         'Hackathon',           'Hackathon',          12, true),
  ('volunteer_area', 'afterparty',        'Afterparty',          'Afterparty',         13, true),
  ('volunteer_area', 'production_help',   'Production Help',     'Production help',    14, true),
  ('volunteer_area', 'event_operations',  'Event Operations',    'Event operations',   15, true)
) as v(vocabulary, key, label_de, label_en, sort_order, active)
where not exists (select 1 from vocab_term t where t.vocabulary = v.vocabulary and t.key = v.key);

-- ---------------------------------------------------------------- 2 · Vorlagen (S3)

create table if not exists shift_template (
  id          uuid primary key default gen_random_uuid(),
  edition_id  uuid not null references event(id) on delete cascade,
  area        text not null,
  position    text not null,
  start_time  time not null,
  end_time    time not null,                       -- Ende <= Beginn heißt: am Folgetag
  weekday     integer check (weekday between 1 and 7),   -- ISO (1 = Montag); null = für jeden Tag
  capacity    integer not null default 1 check (capacity >= 1),
  overbook    integer not null default 0 check (overbook >= 0),
  location    text,
  briefing_md text,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint shift_template_zeiten_chk check (start_time <> end_time)
);
comment on table shift_template is
  'Schicht-Vorlage (VOL-002/S3): Bereich, Position, Uhrzeiten in der Ortszeit des Events, Plätze. apply_shift_templates legt daraus Schichten für Tage an (shift.template_id). Nur über Funktionen.';
alter table shift_template enable row level security;
revoke all on shift_template from anon, authenticated;

alter table shift add column if not exists template_id uuid references shift_template(id) on delete set null;
create unique index if not exists shift_template_day_uidx on shift (template_id, event_day_id) where template_id is not null;

create or replace function shift_templates(p_edition_id uuid default null)
 RETURNS TABLE(id uuid, area text, "position" text, weekday integer, start_time time, end_time time, capacity integer, overbook integer,
               location text, briefing_md text, sort_order integer, active boolean, used integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not is_volunteer_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_ed := volunteer_edition(p_edition_id);
  return query
    select t.id, t.area, t.position, t.weekday, t.start_time, t.end_time, t.capacity, t.overbook, t.location, t.briefing_md,
           t.sort_order, t.active, (select count(*)::integer from shift s where s.template_id = t.id)
      from shift_template t
     where t.edition_id = v_ed
     order by t.area, t.sort_order, t.start_time, t.position;
end $$;

create or replace function upsert_shift_template(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid := nullif(p_data->>'id', '')::uuid; v_ed uuid; v_area text; v_pos text; v_start time; v_end time; v_wd integer;
begin
  if not is_volunteer_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_area := nullif(btrim(coalesce(p_data->>'area', '')), '');
  if v_area is not null and not is_vocab_key('volunteer_area', v_area) then
    raise exception 'invalid_area' using errcode = '22023', detail = v_area;
  end if;
  v_pos := nullif(btrim(coalesce(p_data->>'position', '')), '');
  begin
    v_start := nullif(p_data->>'start_time', '')::time;
    v_end := nullif(p_data->>'end_time', '')::time;
  exception when others then raise exception 'invalid_times' using errcode = '22023';
  end;
  v_wd := nullif(p_data->>'weekday', '')::integer;
  if v_wd is not null and v_wd not between 1 and 7 then raise exception 'invalid_times' using errcode = '22023'; end if;
  if v_id is null then
    v_ed := volunteer_edition(nullif(p_data->>'edition_id', '')::uuid);
    if v_ed is null then raise exception 'edition_required' using errcode = '22023'; end if;
    if v_area is null or v_pos is null or v_start is null or v_end is null then
      raise exception 'fields_required' using errcode = '22023';
    end if;
    if v_start = v_end then raise exception 'invalid_times' using errcode = '22023'; end if;
    insert into shift_template (edition_id, area, position, weekday, start_time, end_time, capacity, overbook, location, briefing_md, sort_order, active)
    values (v_ed, v_area, v_pos, v_wd, v_start, v_end,
            greatest(coalesce((p_data->>'capacity')::integer, 1), 1), greatest(coalesce((p_data->>'overbook')::integer, 0), 0),
            nullif(btrim(coalesce(p_data->>'location', '')), ''), nullif(btrim(coalesce(p_data->>'briefing_md', '')), ''),
            coalesce((p_data->>'sort_order')::integer, 0), coalesce((p_data->>'active')::boolean, true))
    returning id into v_id;
  else
    if not exists (select 1 from shift_template where id = v_id) then raise exception 'template_not_found' using errcode = 'P0002'; end if;
    if v_start is not null and v_end is not null and v_start = v_end then raise exception 'invalid_times' using errcode = '22023'; end if;
    update shift_template set
      area        = coalesce(v_area, area),
      position    = coalesce(v_pos, position),
      weekday     = case when p_data ? 'weekday' then v_wd else weekday end,
      start_time  = coalesce(v_start, start_time),
      end_time    = coalesce(v_end, end_time),
      capacity    = case when p_data ? 'capacity' then greatest((p_data->>'capacity')::integer, 1) else capacity end,
      overbook    = case when p_data ? 'overbook' then greatest((p_data->>'overbook')::integer, 0) else overbook end,
      location    = case when p_data ? 'location' then nullif(btrim(coalesce(p_data->>'location', '')), '') else location end,
      briefing_md = case when p_data ? 'briefing_md' then nullif(btrim(coalesce(p_data->>'briefing_md', '')), '') else briefing_md end,
      sort_order  = case when p_data ? 'sort_order' then (p_data->>'sort_order')::integer else sort_order end,
      active      = case when p_data ? 'active' then (p_data->>'active')::boolean else active end,
      updated_at  = now()
    where id = v_id;
  end if;
  perform log_audit('volunteer.upsert_shift_template', 'shift_template', v_id::text, null, p_data);
  return v_id;
end $$;

create or replace function delete_shift_template(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_volunteer_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from shift_template where id = p_id;
  if not found then raise exception 'template_not_found' using errcode = 'P0002'; end if;
  perform log_audit('volunteer.delete_shift_template', 'shift_template', p_id::text, null, null);
end $$;

-- Legt aus den Vorlagen Schichten für die gewählten Tage an (idempotent). Ortszeit = Zeitzone des
-- Events, zu dem der Tag gehört; Ende <= Beginn heißt Folgetag. Gibt die Zahl neuer Schichten zurück.
create or replace function apply_shift_templates(p_template_ids uuid[], p_day_ids uuid[], p_edition_id uuid default null)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid; v_n integer := 0; v_k integer; t record; d record; v_start timestamptz; v_end timestamptz; v_zone text;
begin
  if not is_volunteer_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_ed := volunteer_edition(p_edition_id);
  if coalesce(cardinality(p_template_ids), 0) = 0 or coalesce(cardinality(p_day_ids), 0) = 0 then
    raise exception 'fields_required' using errcode = '22023';
  end if;
  if cardinality(p_template_ids) > 200 or cardinality(p_day_ids) > 30 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  for d in select * from unnest(p_day_ids) as x(id) loop
    if not day_of_edition(d.id, v_ed) then raise exception 'day_not_found' using errcode = 'P0002', detail = d.id::text; end if;
  end loop;
  for t in select * from shift_template where id = any (p_template_ids) and edition_id = v_ed and active order by sort_order, start_time loop
    for d in select ed.id, ed.day_date, coalesce(e.timezone, 'Europe/Berlin') as zone
               from event_day ed join event e on e.id = ed.event_id
              where ed.id = any (p_day_ids) and (t.weekday is null or t.weekday = extract(isodow from ed.day_date)::integer) loop
      v_start := (d.day_date + t.start_time) at time zone d.zone;
      v_end := (d.day_date + t.end_time + case when t.end_time <= t.start_time then interval '1 day' else interval '0' end) at time zone d.zone;
      insert into shift (edition_id, event_day_id, area, position, start_at, end_at, capacity, overbook, location, briefing_md, active, template_id)
      values (v_ed, d.id, t.area, t.position, v_start, v_end, t.capacity, t.overbook, t.location, t.briefing_md, true, t.id)
      on conflict (template_id, event_day_id) where template_id is not null do nothing;
      get diagnostics v_k = row_count;
      v_n := v_n + v_k;
    end loop;
  end loop;
  perform log_audit('volunteer.apply_shift_templates', 'event', v_ed::text, null,
                    jsonb_build_object('templates', cardinality(p_template_ids), 'days', cardinality(p_day_ids), 'created', v_n));
  return v_n;
end $$;

-- ---------------------------------------------------------------- 3 · Sicherheitsunterweisung

alter table volunteer_profile add column if not exists safety_ack_at timestamptz;
alter table volunteer_profile add column if not exists safety_ack_version text;
comment on column volunteer_profile.safety_ack_at is 'Sicherheitsunterweisung gelesen (VOL-002, K-44: Pflicht für alle), einmal je Edition; safety_ack_version = Fassung des Textes.';

create or replace function ack_volunteer_safety(p_version text, p_edition_id uuid default null)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_pid uuid := current_person_id(); v_ed uuid; v_prof uuid; v_ver text := nullif(btrim(coalesce(p_version, '')), '');
begin
  if v_pid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if v_ver is null or length(v_ver) > 40 then raise exception 'fields_required' using errcode = '22023'; end if;
  v_ed := volunteer_edition(p_edition_id);
  select v.id into v_prof from volunteer_profile v where v.person_id = v_pid and v.edition_id = v_ed and v.status = 'accepted';
  if v_prof is null then raise exception 'not_accepted' using errcode = 'P0001'; end if;
  update volunteer_profile set safety_ack_at = now(), safety_ack_version = v_ver where id = v_prof;
  perform log_audit('volunteer.safety_ack', 'volunteer_profile', v_prof::text, null, jsonb_build_object('version', v_ver));
end $$;

create or replace function my_volunteer_safety(p_edition_id uuid default null)
 RETURNS TABLE(acknowledged_at timestamptz, version text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_pid uuid := current_person_id();
begin
  if v_pid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select v.safety_ack_at, v.safety_ack_version from volunteer_profile v
     where v.person_id = v_pid and v.edition_id = volunteer_edition(p_edition_id);
end $$;

-- Team: angenommene Volunteers, die die Unterweisung noch nicht bestätigt haben.
create or replace function volunteers_without_safety_ack(p_edition_id uuid default null)
 RETURNS TABLE(person_id uuid, name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not is_volunteer_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_ed := volunteer_edition(p_edition_id);
  return query
    select v.person_id, trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
      from volunteer_profile v join person p on p.id = v.person_id and p.deleted_at is null
     where v.edition_id = v_ed and v.status = 'accepted' and v.safety_ack_at is null
     order by p.last_name, p.first_name;
end $$;

-- Live-Fassung aus supabase/snapshot/functions/confirm_shift.sql; neu: Unterweisung vorab.
create or replace function confirm_shift(p_assignment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_pid uuid := current_person_id(); v_a shift_assignment;
begin
  if v_pid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_a from shift_assignment where id = p_assignment_id for update;
  if not found or v_a.person_id <> v_pid then raise exception 'assignment_not_found' using errcode = 'P0002'; end if;
  if v_a.status <> 'assigned' then raise exception 'not_assigned' using errcode = 'P0001', detail = v_a.status; end if;
  if not exists (select 1 from volunteer_profile v join shift s on s.edition_id = v.edition_id
                  where v.person_id = v_pid and s.id = v_a.shift_id and v.safety_ack_at is not null) then
    raise exception 'safety_ack_required' using errcode = 'P0001';
  end if;
  update shift_assignment set status = 'confirmed', confirmed_at = now() where id = p_assignment_id;
  perform log_audit('volunteer.confirm_shift', 'shift_assignment', p_assignment_id::text, null, null);
end $$;

-- ---------------------------------------------------------------- 4 · Wunschschichten

create table if not exists shift_wish (
  person_id  uuid not null references person(id) on delete cascade,
  shift_id   uuid not null references shift(id) on delete cascade,
  rank       integer not null check (rank between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (person_id, shift_id),
  unique (person_id, rank) deferrable initially immediate
);
comment on table shift_wish is 'Wunschschichten (VOL-002, K-44): angenommene Volunteers wählen 1–5 Schichten in Reihenfolge; zugeteilt wird vom Team. Nur über Funktionen.';
alter table shift_wish enable row level security;
revoke all on shift_wish from anon, authenticated;

create or replace function wishable_shifts(p_edition_id uuid default null)
 RETURNS TABLE(id uuid, event_day_id uuid, day_label_de text, day_label_en text, area text, "position" text,
               start_at timestamptz, end_at timestamptz, location text, wish_rank integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_pid uuid := current_person_id(); v_ed uuid;
begin
  if v_pid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := volunteer_edition(p_edition_id);
  if not exists (select 1 from volunteer_profile v where v.person_id = v_pid and v.edition_id = v_ed and v.status = 'accepted') then
    raise exception 'not_accepted' using errcode = 'P0001';
  end if;
  return query
    select s.id, s.event_day_id, d.label_de, d.label_en, s.area, s.position, s.start_at, s.end_at, s.location, w.rank
      from shift s
      left join event_day d on d.id = s.event_day_id
      left join shift_wish w on w.shift_id = s.id and w.person_id = v_pid
     where s.edition_id = v_ed and s.active
     order by s.start_at, s.area, s.position;
end $$;

-- Ersetzt die Wünsche; die Reihenfolge der Liste ist die Rangfolge. Mindestens eine, höchstens fünf.
create or replace function set_my_shift_wishes(p_shift_ids uuid[], p_edition_id uuid default null)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_pid uuid := current_person_id(); v_ed uuid; v_ids uuid[]; v_n integer;
begin
  if v_pid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := volunteer_edition(p_edition_id);
  if not exists (select 1 from volunteer_profile v where v.person_id = v_pid and v.edition_id = v_ed and v.status = 'accepted') then
    raise exception 'not_accepted' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(x.id order by x.o), '{}') into v_ids
    from (select u.id, min(u.o) as o from unnest(coalesce(p_shift_ids, '{}')) with ordinality as u(id, o) group by u.id) x;
  if cardinality(v_ids) = 0 then raise exception 'wish_required' using errcode = 'P0001'; end if;
  if cardinality(v_ids) > 5 then raise exception 'too_many_wishes' using errcode = 'P0001'; end if;
  select count(*) into v_n from shift s where s.id = any (v_ids) and s.edition_id = v_ed and s.active;
  if v_n <> cardinality(v_ids) then raise exception 'shift_not_found' using errcode = 'P0002'; end if;
  delete from shift_wish w where w.person_id = v_pid;
  insert into shift_wish (person_id, shift_id, rank)
  select v_pid, u.id, u.o::integer from unnest(v_ids) with ordinality as u(id, o);
end $$;

create or replace function shift_wishes(p_edition_id uuid default null)
 RETURNS TABLE(shift_id uuid, person_id uuid, name text, rank integer, area_match boolean, assignment_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not is_volunteer_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_ed := volunteer_edition(p_edition_id);
  return query
    select w.shift_id, w.person_id, trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), w.rank,
           coalesce(s.area = any (v.areas), false),
           (select a.status from shift_assignment a where a.shift_id = w.shift_id and a.person_id = w.person_id)
      from shift_wish w
      join shift s on s.id = w.shift_id
      join person p on p.id = w.person_id and p.deleted_at is null
      join volunteer_profile v on v.person_id = w.person_id and v.edition_id = s.edition_id and v.status = 'accepted'
     where s.edition_id = v_ed
     order by s.start_at, w.rank;
end $$;

create or replace function volunteers_without_wish(p_edition_id uuid default null)
 RETURNS TABLE(person_id uuid, name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not is_volunteer_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_ed := volunteer_edition(p_edition_id);
  return query
    select v.person_id, trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
      from volunteer_profile v join person p on p.id = v.person_id and p.deleted_at is null
     where v.edition_id = v_ed and v.status = 'accepted'
       and not exists (select 1 from shift_wish w join shift s on s.id = w.shift_id
                        where w.person_id = v.person_id and s.edition_id = v_ed)
     order by p.last_name, p.first_name;
end $$;

select harden_definer_functions();
