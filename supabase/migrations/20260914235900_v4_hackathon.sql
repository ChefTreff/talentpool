-- 0085 · Hackathon: Challenges, Teams, Einreichung, Judging (Welle 4 A3).
--
-- Die Regeln stehen in den Entscheidungen E3–E5:
-- - Anmeldung **als Team** ist Pflicht, 3 bis 8 Personen, Ziel 6. Wer allein
--   kommt, bewirbt sich trotzdem und wird von uns einem Team zugeteilt.
-- - **Keine freie Challenge-Wahl.** Die Challenges werden gleichmässig auf die
--   Teams verteilt (`assign_challenges`), damit keine Challenge leer ausgeht
--   und keine überläuft. Von Hand korrigierbar.
-- - Judging-Kriterien mit **Gewichten** liegen an der Challenge; der Partner
--   trägt sie beim Anlegen ein. Die Gesamtnote rechnet die Datenbank, nicht
--   die Oberfläche — sonst hat am Ende jede Jury-Ansicht ihre eigene Formel.
--
-- **Abweichung vom Arbeitsauftrag, bewusst:** dort steht `hack_team` mit
-- `members[]`. Eine Mitgliedschaft ist aber mehr als ein Name: sie wird
-- eingeladen, angenommen, verlassen, und die Rechteprüfung („darf diese Person
-- für dieses Team einreichen?") muss sie einzeln lesen können. Mit einem Array
-- ginge beides nur über Umwege. Deshalb `hack_team_member` als eigene Tabelle.
--
-- Fehlerschlüssel: 28000, 42501, P0002 `<x>_not_found`, 22023 `invalid_<x>`,
-- P0001 `team_full` / `team_too_small` / `already_in_team` / `not_my_team` /
-- `submission_closed`.
--
-- Abweichungen: `hack_team_member` statt `members[]` (oben begründet).
set search_path = public, extensions;

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active) values
  ('hack_skill', 'frontend',   'Frontend',            'Frontend',            1, true),
  ('hack_skill', 'backend',    'Backend',             'Backend',             2, true),
  ('hack_skill', 'data',       'Daten & KI',          'Data & AI',           3, true),
  ('hack_skill', 'design',     'Design',              'Design',              4, true),
  ('hack_skill', 'business',   'Business & Pitch',    'Business & pitch',    5, true),
  ('hack_skill', 'hardware',   'Hardware',            'Hardware',            6, true),
  ('hack_team_status', 'forming',   'In Bildung',   'Forming',   1, true),
  ('hack_team_status', 'confirmed', 'Bestätigt',    'Confirmed', 2, true),
  ('hack_team_status', 'withdrawn', 'Zurückgezogen','Withdrawn', 3, true)
on conflict (vocabulary, key) do nothing;

-- ---------------------------------------------------------------- Challenges

create table if not exists hack_challenge (
  id              uuid primary key default gen_random_uuid(),
  edition_id      uuid not null references event(id) on delete cascade,
  org_id          uuid references organization(id) on delete set null,
  deliverable_id  uuid references deliverable(id) on delete set null,
  title_de        text,
  title_en        text not null,
  description_de  text,
  description_en  text,
  prizes          text,
  resources       text,
  mentors         jsonb not null default '[]'::jsonb,
  -- [{key, label, weight}] — Gewichte in Prozent, Summe idealerweise 100.
  criteria        jsonb not null default '[]'::jsonb,
  status          text not null default 'draft',
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint hack_challenge_status_chk check (status in ('draft', 'published', 'archived'))
);

create index if not exists hack_challenge_edition_idx on hack_challenge (edition_id, status);

comment on column hack_challenge.criteria is
  'Judging-Kriterien mit Gewichten (E4): [{key, label, weight}]. Die Gesamtnote rechnet `set_hack_score` daraus.';

-- ---------------------------------------------------------------- Teams

create table if not exists hack_team (
  id            uuid primary key default gen_random_uuid(),
  edition_id    uuid not null references event(id) on delete cascade,
  name          text not null,
  challenge_id  uuid references hack_challenge(id) on delete set null,
  -- Kurz und ohne I, O, 0, 1: der Code wird vorgelesen und abgetippt.
  join_code     text not null,
  status        text not null default 'forming',
  discord_url   text,
  note_internal text,
  created_by    uuid references person(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint hack_team_status_chk check (status in ('forming', 'confirmed', 'withdrawn'))
);

create unique index if not exists hack_team_join_code_idx on hack_team (edition_id, join_code);
create index if not exists hack_team_challenge_idx on hack_team (challenge_id);

create table if not exists hack_team_member (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references hack_team(id) on delete cascade,
  person_id   uuid not null references person(id) on delete cascade,
  -- Doppelt gehalten, damit „eine Person, ein Team je Edition" als Constraint
  -- greift: ein Index kann keine Unterabfrage auf `hack_team` enthalten. Ein
  -- Trigger füllt die Spalte aus dem Team, niemand setzt sie von Hand.
  edition_id  uuid not null references event(id) on delete cascade,
  role        text,
  is_captain  boolean not null default false,
  joined_at   timestamptz not null default now(),
  unique (team_id, person_id),
  unique (person_id, edition_id)
);

/**
 * Obergrenze 8 (E5) als Trigger, nicht nur in `join_hack_team`.
 *
 * Der Smoke-Test hat es gezeigt: über den Beitrittscode greift die Prüfung,
 * über jeden anderen Weg — Zuteilung durch uns, Nachtrag, Skript — nicht. Eine
 * Regel, die nur an einer Tür hängt, ist keine Regel. Die Untergrenze 3 bleibt
 * dagegen bewusst an der Einreichung: ein Team muss klein anfangen dürfen.
 */
create or replace function trg_hack_team_size() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare v_n integer;
begin
  select count(*) into v_n from hack_team_member where team_id = new.team_id;
  if v_n >= 8 then
    raise exception 'team_full' using errcode = 'P0001', detail = '8';
  end if;
  return new;
end $$;

drop trigger if exists hack_team_size on hack_team_member;
create trigger hack_team_size before insert on hack_team_member
  for each row execute function trg_hack_team_size();

create or replace function trg_hack_member_edition() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  select t.edition_id into new.edition_id from hack_team t where t.id = new.team_id;
  if new.edition_id is null then raise exception 'team_not_found' using errcode = 'P0002'; end if;
  return new;
end $$;

drop trigger if exists hack_member_edition on hack_team_member;
create trigger hack_member_edition before insert or update of team_id on hack_team_member
  for each row execute function trg_hack_member_edition();

create table if not exists hack_application (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references person(id) on delete cascade,
  edition_id  uuid not null references event(id) on delete cascade,
  skills      text[] not null default '{}',
  motivation  text,
  team_pref   text,
  team_id     uuid references hack_team(id) on delete set null,
  status      text not null default 'applied',
  applied_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references person(id) on delete set null,
  note        text,
  unique (person_id, edition_id),
  constraint hack_application_status_chk check (status in ('applied', 'accepted', 'declined', 'withdrawn'))
);

create table if not exists hack_submission (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references hack_team(id) on delete cascade,
  url           text,
  repo_url      text,
  notes         text,
  files         jsonb not null default '[]'::jsonb,
  submitted_at  timestamptz,
  submitted_by  uuid references person(id) on delete set null,
  updated_at    timestamptz not null default now(),
  unique (team_id)
);

create table if not exists hack_judging_score (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references hack_team(id) on delete cascade,
  judge_id     uuid not null references person(id) on delete cascade,
  -- {kriterium_key: punkte 0..10}
  criteria     jsonb not null default '{}'::jsonb,
  total        numeric(6,2),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (team_id, judge_id)
);

alter table hack_challenge enable row level security;
alter table hack_team enable row level security;
alter table hack_team_member enable row level security;
alter table hack_application enable row level security;
alter table hack_submission enable row level security;
alter table hack_judging_score enable row level security;

revoke all on hack_challenge, hack_team, hack_team_member, hack_application, hack_submission, hack_judging_score
  from anon, authenticated;
grant all on hack_challenge, hack_team, hack_team_member, hack_application, hack_submission, hack_judging_score
  to service_role;

-- ---------------------------------------------------------------- Rechte

create or replace function is_hack_team() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select has_role('admin') or has_role('area_lead_hackathon')
$$;

/** Jury: wer bewerten darf. Mentoren der Partner zählen nicht dazu. */
create or replace function is_hack_judge() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select is_hack_team() or has_role('hackathon_partner')
$$;

/** Die laufende Edition mit Hackathon — dieselbe Wahl wie bei den Volunteers. */
create or replace function hack_edition(p_edition_id uuid default null) returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(p_edition_id,
    (select e.id from event e
      where e.is_edition and (e.end_date is null or e.end_date >= current_date)
      order by e.start_date limit 1))
$$;

create or replace function my_hack_team_id(p_edition_id uuid default null) returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select m.team_id from hack_team_member m join hack_team t on t.id = m.team_id
   where m.person_id = current_person_id() and t.edition_id = hack_edition(p_edition_id)
   limit 1
$$;

-- ---------------------------------------------------------------- Teilnehmer

create or replace function hack_challenges(p_edition_id uuid default null)
returns table(id uuid, title text, description text, prizes text, resources text,
              mentors jsonb, criteria jsonb, org_name text, teams integer)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select c.id, coalesce(c.title_en, c.title_de), coalesce(c.description_en, c.description_de),
           c.prizes, c.resources, c.mentors, c.criteria,
           coalesce(o.communication_name, o.legal_name),
           (select count(*)::integer from hack_team t where t.challenge_id = c.id and t.status <> 'withdrawn')
      from hack_challenge c
      left join organization o on o.id = c.org_id
     where c.edition_id = hack_edition(p_edition_id) and c.status = 'published'
     order by c.sort_order, coalesce(c.title_en, c.title_de);
end $$;

/** Eigene Bewerbung, Team und Einreichung in einem Zug. */
create or replace function my_hack(p_edition_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_ed uuid; v_app hack_application; v_team hack_team;
        v_sub hack_submission; v_ch hack_challenge;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := hack_edition(p_edition_id);
  select * into v_app from hack_application where person_id = v_me and edition_id = v_ed;
  select t.* into v_team from hack_team t join hack_team_member m on m.team_id = t.id
   where m.person_id = v_me and t.edition_id = v_ed;
  if v_team.id is not null then
    select * into v_sub from hack_submission where team_id = v_team.id;
    select * into v_ch from hack_challenge where id = v_team.challenge_id;
  end if;

  return jsonb_build_object(
    'edition_id', v_ed,
    'application', case when v_app.id is null then null else jsonb_build_object(
      'id', v_app.id, 'status', v_app.status, 'skills', to_jsonb(v_app.skills),
      'motivation', v_app.motivation, 'team_pref', v_app.team_pref, 'applied_at', v_app.applied_at) end,
    'team', case when v_team.id is null then null else jsonb_build_object(
      'id', v_team.id, 'name', v_team.name, 'status', v_team.status,
      -- Den Beitrittscode sieht nur, wer schon drin ist.
      'join_code', v_team.join_code, 'discord_url', v_team.discord_url,
      'members', (select coalesce(jsonb_agg(jsonb_build_object(
                    'person_id', p.id, 'name', nullif(btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''),
                    'is_captain', m.is_captain) order by m.joined_at), '[]'::jsonb)
                  from hack_team_member m join person p on p.id = m.person_id where m.team_id = v_team.id)) end,
    'challenge', case when v_ch.id is null then null else jsonb_build_object(
      'id', v_ch.id, 'title', coalesce(v_ch.title_en, v_ch.title_de),
      'description', coalesce(v_ch.description_en, v_ch.description_de),
      'prizes', v_ch.prizes, 'resources', v_ch.resources, 'criteria', v_ch.criteria) end,
    'submission', case when v_sub.id is null then null else jsonb_build_object(
      'url', v_sub.url, 'repo_url', v_sub.repo_url, 'notes', v_sub.notes,
      'submitted_at', v_sub.submitted_at) end);
end $$;

create or replace function apply_hackathon(p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_ed uuid; v_id uuid; v_skill text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := hack_edition(nullif(p_data->>'edition_id', '')::uuid);
  if v_ed is null then raise exception 'edition_not_found' using errcode = 'P0002'; end if;

  foreach v_skill in array coalesce(
    (select array_agg(value::text) from jsonb_array_elements_text(p_data->'skills') as t(value)), '{}') loop
    if not is_vocab_key('hack_skill', v_skill) then
      raise exception 'invalid_skill' using errcode = '22023', detail = v_skill;
    end if;
  end loop;

  insert into hack_application (person_id, edition_id, skills, motivation, team_pref)
  values (v_me, v_ed,
          coalesce((select array_agg(value::text) from jsonb_array_elements_text(p_data->'skills') as t(value)), '{}'),
          nullif(btrim(p_data->>'motivation'), ''), nullif(btrim(p_data->>'team_pref'), ''))
  on conflict (person_id, edition_id) do update set
    skills = excluded.skills, motivation = excluded.motivation, team_pref = excluded.team_pref,
    status = case when hack_application.status = 'withdrawn' then 'applied' else hack_application.status end
  returning id into v_id;

  perform log_audit('hack.applied', 'hack_application', v_id::text, null, null);
  return v_id;
end $$;

/** Code für den Beitritt: kurz, ohne I, O, 0 und 1. */
create or replace function hack_join_code() returns text
language sql volatile security definer set search_path = public, extensions as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                           (floor(random() * 32) + 1)::integer, 1), '')
    from generate_series(1, 6)
$$;

create or replace function create_hack_team(p_name text, p_edition_id uuid default null) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_ed uuid; v_id uuid; v_code text; v_try integer := 0;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := hack_edition(p_edition_id);
  if nullif(btrim(p_name), '') is null then
    raise exception 'invalid_name' using errcode = '22023', detail = 'Teamname fehlt';
  end if;
  if my_hack_team_id(v_ed) is not null then
    raise exception 'already_in_team' using errcode = 'P0001';
  end if;

  loop
    v_code := hack_join_code();
    exit when not exists (select 1 from hack_team t where t.edition_id = v_ed and t.join_code = v_code);
    v_try := v_try + 1;
    if v_try > 20 then raise exception 'join_code_exhausted' using errcode = 'P0001'; end if;
  end loop;

  insert into hack_team (edition_id, name, join_code, created_by)
  values (v_ed, btrim(p_name), v_code, v_me) returning id into v_id;
  insert into hack_team_member (team_id, person_id, edition_id, is_captain) values (v_id, v_me, v_ed, true);
  perform log_audit('hack.team_created', 'hack_team', v_id::text, null, jsonb_build_object('name', p_name));
  return v_id;
end $$;

create or replace function join_hack_team(p_code text, p_edition_id uuid default null) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_ed uuid; v_team hack_team; v_n integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := hack_edition(p_edition_id);
  if my_hack_team_id(v_ed) is not null then raise exception 'already_in_team' using errcode = 'P0001'; end if;

  select * into v_team from hack_team
   where edition_id = v_ed and upper(btrim(join_code)) = upper(btrim(p_code)) and status <> 'withdrawn';
  if not found then raise exception 'team_not_found' using errcode = 'P0002'; end if;

  select count(*) into v_n from hack_team_member where team_id = v_team.id;
  -- Maximum 8 (E5). Die Untergrenze gilt erst bei der Bestätigung — ein Team
  -- muss ja klein anfangen dürfen.
  if v_n >= 8 then raise exception 'team_full' using errcode = 'P0001', detail = '8'; end if;

  insert into hack_team_member (team_id, person_id, edition_id) values (v_team.id, v_me, v_ed);
  update hack_application set team_id = v_team.id where person_id = v_me and edition_id = v_ed;
  perform log_audit('hack.team_joined', 'hack_team', v_team.id::text, null, null);
  return v_team.id;
end $$;

create or replace function leave_hack_team(p_edition_id uuid default null) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_team uuid; v_rest integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_team := my_hack_team_id(p_edition_id);
  if v_team is null then raise exception 'team_not_found' using errcode = 'P0002'; end if;
  delete from hack_team_member where team_id = v_team and person_id = v_me;
  update hack_application set team_id = null where person_id = v_me and team_id = v_team;

  -- Das letzte Mitglied nimmt das Team mit: ein leeres Team ist kein Team.
  select count(*) into v_rest from hack_team_member where team_id = v_team;
  if v_rest = 0 then
    update hack_team set status = 'withdrawn', updated_at = now() where id = v_team;
  else
    -- Ohne Kapitän wird das älteste Mitglied Kapitän.
    if not exists (select 1 from hack_team_member where team_id = v_team and is_captain) then
      update hack_team_member set is_captain = true
       where id = (select id from hack_team_member where team_id = v_team order by joined_at limit 1);
    end if;
  end if;
  perform log_audit('hack.team_left', 'hack_team', v_team::text, null, null);
end $$;

create or replace function submit_hack(p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_team uuid; v_id uuid; v_n integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_team := my_hack_team_id(nullif(p_data->>'edition_id', '')::uuid);
  if v_team is null then raise exception 'not_my_team' using errcode = 'P0001'; end if;

  select count(*) into v_n from hack_team_member where team_id = v_team;
  if v_n < 3 then
    raise exception 'team_too_small' using errcode = 'P0001', detail = v_n::text;
  end if;

  insert into hack_submission (team_id, url, repo_url, notes, submitted_at, submitted_by)
  values (v_team, nullif(btrim(p_data->>'url'), ''), nullif(btrim(p_data->>'repo_url'), ''),
          nullif(btrim(p_data->>'notes'), ''), now(), v_me)
  on conflict (team_id) do update set
    url = excluded.url, repo_url = excluded.repo_url, notes = excluded.notes,
    submitted_at = now(), submitted_by = v_me, updated_at = now()
  returning id into v_id;

  perform log_audit('hack.submitted', 'hack_team', v_team::text, null, null);
  return v_id;
end $$;

-- ---------------------------------------------------------------- Team (wir)

create or replace function hack_admin_overview(p_edition_id uuid default null)
returns table(team_id uuid, team_name text, status text, members integer, captain text,
              challenge_id uuid, challenge_title text, submitted_at timestamptz,
              scores integer, avg_total numeric)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select t.id, t.name, t.status,
           (select count(*)::integer from hack_team_member m where m.team_id = t.id),
           (select nullif(btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), '')
              from hack_team_member m join person p on p.id = m.person_id
             where m.team_id = t.id and m.is_captain limit 1),
           t.challenge_id, coalesce(c.title_en, c.title_de),
           s.submitted_at,
           (select count(*)::integer from hack_judging_score j where j.team_id = t.id),
           (select round(avg(j.total), 2) from hack_judging_score j where j.team_id = t.id)
      from hack_team t
      left join hack_challenge c on c.id = t.challenge_id
      left join hack_submission s on s.team_id = t.id
     where t.edition_id = hack_edition(p_edition_id) and t.status <> 'withdrawn'
     order by t.name;
end $$;

/**
 * Challenges gleichmässig auf die Teams verteilen (E5).
 *
 * Reihum: das Team ohne Challenge bekommt die Challenge mit den wenigsten
 * Teams. Das ist bewusst stumpf — Ausgleich der Zahl, keine Passung nach
 * Inhalt. Wer eine Challenge bewusst setzen will, nimmt `set_team_challenge`;
 * ein zweiter Lauf fasst gesetzte Zuordnungen nicht an.
 */
create or replace function assign_challenges(p_edition_id uuid default null) returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_ed uuid; v_team record; v_ch uuid; v_n integer := 0;
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_ed := hack_edition(p_edition_id);
  for v_team in
    select t.id from hack_team t
     where t.edition_id = v_ed and t.challenge_id is null and t.status <> 'withdrawn'
     order by t.created_at
  loop
    select c.id into v_ch from hack_challenge c
     where c.edition_id = v_ed and c.status = 'published'
     order by (select count(*) from hack_team x where x.challenge_id = c.id and x.status <> 'withdrawn'),
              c.sort_order, c.id
     limit 1;
    exit when v_ch is null;
    update hack_team set challenge_id = v_ch, updated_at = now() where id = v_team.id;
    v_n := v_n + 1;
  end loop;
  perform log_audit('hack.challenges_assigned', 'event', v_ed::text, null, jsonb_build_object('teams', v_n));
  return v_n;
end $$;

create or replace function set_team_challenge(p_team_id uuid, p_challenge_id uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  update hack_team set challenge_id = p_challenge_id, updated_at = now() where id = p_team_id;
  if not found then raise exception 'team_not_found' using errcode = 'P0002'; end if;
  perform log_audit('hack.challenge_set', 'hack_team', p_team_id::text, null,
                    jsonb_build_object('challenge_id', p_challenge_id));
end $$;

create or replace function set_hack_application_status(p_id uuid, p_status text, p_note text default null)
returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('applied', 'accepted', 'declined') then
    raise exception 'invalid_status' using errcode = '22023', detail = p_status;
  end if;
  update hack_application set status = p_status, note = nullif(btrim(p_note), ''),
         decided_at = now(), decided_by = current_person_id()
   where id = p_id;
  if not found then raise exception 'application_not_found' using errcode = 'P0002'; end if;
  perform log_audit('hack.application_' || p_status, 'hack_application', p_id::text, null, null);
end $$;

/**
 * Challenge aus der Partner-Pflicht übernehmen.
 *
 * Der Partner füllt das Formular (`deliverable` mit Vorlage
 * `hackathon_challenge`); freigegeben wird es vom Team, und erst dann entsteht
 * die Challenge. So steht nichts im Teilnehmerportal, was niemand gelesen hat.
 */
create or replace function publish_hack_challenge(p_deliverable_id uuid) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_d deliverable; v_oe org_edition; v_a jsonb; v_id uuid; v_crit jsonb := '[]'::jsonb; i integer;
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_d from deliverable where id = p_deliverable_id;
  if not found then raise exception 'deliverable_not_found' using errcode = 'P0002'; end if;
  select * into v_oe from org_edition where id = v_d.org_edition_id;
  v_a := coalesce(v_d.answers, '{}'::jsonb);

  -- Vier Kriterien als feste Felder: die Formular-Engine kennt keine
  -- Wiederholgruppen. Leere Zeilen fallen weg.
  for i in 1..4 loop
    if nullif(btrim(coalesce(v_a->>('criterion_' || i || '_label'), '')), '') is not null then
      v_crit := v_crit || jsonb_build_array(jsonb_build_object(
        'key', 'c' || i,
        'label', v_a->>('criterion_' || i || '_label'),
        'weight', coalesce((v_a->>('criterion_' || i || '_weight'))::numeric, 25)));
    end if;
  end loop;

  insert into hack_challenge (edition_id, org_id, deliverable_id, title_en, title_de,
                              description_en, description_de, prizes, resources, mentors, criteria, status)
  values (v_oe.edition_id, v_oe.org_id, p_deliverable_id,
          coalesce(nullif(btrim(v_a->>'title_en'), ''), nullif(btrim(v_a->>'title'), ''), 'Challenge'),
          nullif(btrim(v_a->>'title_de'), ''),
          nullif(btrim(v_a->>'description_en'), ''), nullif(btrim(v_a->>'description_de'), ''),
          nullif(btrim(v_a->>'prizes'), ''), nullif(btrim(v_a->>'resources'), ''),
          coalesce(v_a->'mentors', '[]'::jsonb), v_crit, 'published')
  on conflict (deliverable_id) do update set
    title_en = excluded.title_en, title_de = excluded.title_de,
    description_en = excluded.description_en, description_de = excluded.description_de,
    prizes = excluded.prizes, resources = excluded.resources,
    mentors = excluded.mentors, criteria = excluded.criteria,
    status = 'published', updated_at = now()
  returning id into v_id;

  perform log_audit('hack.challenge_published', 'hack_challenge', v_id::text, null, null);
  return v_id;
end $$;

create unique index if not exists hack_challenge_deliverable_idx
  on hack_challenge (deliverable_id) where deliverable_id is not null;

-- ---------------------------------------------------------------- Jury

create or replace function hack_judging(p_edition_id uuid default null)
returns table(team_id uuid, team_name text, challenge_title text, criteria jsonb,
              submission_url text, repo_url text, notes text, submitted_at timestamptz,
              my_criteria jsonb, my_total numeric, my_note text)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_hack_judge() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select t.id, t.name, coalesce(c.title_en, c.title_de), coalesce(c.criteria, '[]'::jsonb),
           s.url, s.repo_url, s.notes, s.submitted_at,
           j.criteria, j.total, j.note
      from hack_team t
      left join hack_challenge c on c.id = t.challenge_id
      left join hack_submission s on s.team_id = t.id
      left join hack_judging_score j on j.team_id = t.id and j.judge_id = current_person_id()
     where t.edition_id = hack_edition(p_edition_id) and t.status <> 'withdrawn'
     order by t.name;
end $$;

/**
 * Bewertung speichern. Die Gesamtnote rechnet **die Datenbank** aus den
 * Gewichten der Challenge — sonst hat am Ende jede Ansicht ihre eigene Formel
 * und zwei Jurymitglieder sehen verschiedene Zahlen zur selben Bewertung.
 */
create or replace function set_hack_score(p_team_id uuid, p_criteria jsonb, p_note text default null)
returns numeric
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_crit jsonb; v_f jsonb;
        v_sum numeric := 0; v_weight numeric := 0; v_total numeric; v_points numeric;
begin
  if not is_hack_judge() then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(c.criteria, '[]'::jsonb) into v_crit
    from hack_team t left join hack_challenge c on c.id = t.challenge_id where t.id = p_team_id;
  if not found then raise exception 'team_not_found' using errcode = 'P0002'; end if;

  for v_f in select * from jsonb_array_elements(v_crit) loop
    v_points := nullif(p_criteria->>(v_f->>'key'), '')::numeric;
    if v_points is not null then
      if v_points < 0 or v_points > 10 then
        raise exception 'invalid_score' using errcode = '22023', detail = v_f->>'key';
      end if;
      v_sum := v_sum + v_points * coalesce((v_f->>'weight')::numeric, 0);
      v_weight := v_weight + coalesce((v_f->>'weight')::numeric, 0);
    end if;
  end loop;
  v_total := case when v_weight > 0 then round(v_sum / v_weight, 2) else null end;

  insert into hack_judging_score (team_id, judge_id, criteria, total, note)
  values (p_team_id, v_me, coalesce(p_criteria, '{}'::jsonb), v_total, nullif(btrim(p_note), ''))
  on conflict (team_id, judge_id) do update set
    criteria = excluded.criteria, total = excluded.total, note = excluded.note, updated_at = now();

  perform log_audit('hack.scored', 'hack_team', p_team_id::text, null, jsonb_build_object('total', v_total));
  return v_total;
end $$;

-- ---------------------------------------------------------------- Partner-Pflicht

insert into deliverable_template
  (key, product_sku, category, type, label_de, label_en, description_de, description_en,
   due_rule, file_rules, required, audience_roles, sort, active, answers_schema)
values (
  'hackathon_challenge', 'I-37220', 'hackathon', 'form',
  'Hackathon-Challenge', 'Hackathon challenge',
  'Eure Aufgabe für die Teams: Titel, Beschreibung, Preise, Mentoren und die Kriterien, nach denen bewertet wird.',
  'Your task for the teams: title, description, prizes, mentors and the criteria you want them judged by.',
  '{"weeks_before": 8}'::jsonb, '{}'::jsonb, true, '{partner_contact}', 60, true,
  jsonb_build_array(
    jsonb_build_object('key','title_en','type','text','required',true,'label_de','Titel (englisch)','label_en','Title (English)'),
    jsonb_build_object('key','description_en','type','textarea','required',true,'label_de','Beschreibung (englisch)','label_en','Description (English)'),
    jsonb_build_object('key','prizes','type','textarea','required',false,'label_de','Preise','label_en','Prizes'),
    jsonb_build_object('key','resources','type','textarea','required',false,'label_de','Ressourcen (Daten, APIs, Hardware)','label_en','Resources (data, APIs, hardware)'),
    jsonb_build_object('key','mentor_names','type','textarea','required',false,'label_de','Mentorinnen und Mentoren (Name, Rolle)','label_en','Mentors (name, role)'),
    jsonb_build_object('key','criterion_1_label','type','text','required',true,'label_de','Kriterium 1','label_en','Criterion 1'),
    jsonb_build_object('key','criterion_1_weight','type','number','required',true,'label_de','Gewicht 1 (%)','label_en','Weight 1 (%)'),
    jsonb_build_object('key','criterion_2_label','type','text','required',false,'label_de','Kriterium 2','label_en','Criterion 2'),
    jsonb_build_object('key','criterion_2_weight','type','number','required',false,'label_de','Gewicht 2 (%)','label_en','Weight 2 (%)'),
    jsonb_build_object('key','criterion_3_label','type','text','required',false,'label_de','Kriterium 3','label_en','Criterion 3'),
    jsonb_build_object('key','criterion_3_weight','type','number','required',false,'label_de','Gewicht 3 (%)','label_en','Weight 3 (%)'),
    jsonb_build_object('key','criterion_4_label','type','text','required',false,'label_de','Kriterium 4','label_en','Criterion 4'),
    jsonb_build_object('key','criterion_4_weight','type','number','required',false,'label_de','Gewicht 4 (%)','label_en','Weight 4 (%)'))
)
-- Der Schlüssel der Vorlage ist dreiteilig: (key, product_sku, category).
on conflict (key, product_sku, category) do update set
  answers_schema = excluded.answers_schema,
  description_de = excluded.description_de,
  description_en = excluded.description_en,
  active = true;

select harden_definer_functions();
