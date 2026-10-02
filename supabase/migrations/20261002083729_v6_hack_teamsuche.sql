-- 0249 · Hackathon-Teamsuche: offene Teams und suchende Personen, Beitrittsanfragen mit Zusage, keine Kontaktdaten (HACK-016)
-- Angewendet von der Architektur-Session am 02.10.2026 als 20261002083729.
-- Beitritt über Anfrage mit Zusage — nie über Kontaktdaten.
--
-- Anlass: Konrad im Call 24.09. (HACK-014-Abgleich): Teams finden sich heute nur über den
-- Beitrittscode, der außerhalb geteilt wird. Auftrag der Architektur-Session (01.10.):
-- Teilnehmende ohne Team finden offene Teams (Challenge, freie Plätze, gesuchte Skills), Teams
-- finden Einzelpersonen mit „suche Team“ — nur Vorname, Studienfeld, Skills, Track-Wunsch,
-- keine Kontaktdaten; Kontakt über eine Beitrittsanfrage mit Zusage, Definer-Funktionen, Audit.
--
-- Diese Migration:
--   1 `hack_team.looking` (+ `looking_skills` vocab hack_skill ≤ 8, `looking_note` ≤ 200),
--     `hack_application.seeking_team`.
--   2 Tabelle `hack_join_request` (Richtung `to_team` = Person fragt an, `to_person` = Team
--     lädt ein; Status pending/accepted/declined/withdrawn; Nachricht ≤ 300; höchstens eine
--     offene Anfrage je Team und Person): RLS an, **keine Grants** — nur über Funktionen.
--   3 Wer darf suchen: **Teilnehmende** = angenommene Bewerbung (`accepted`) oder Mitglied
--     eines Teams der Edition (`hack_is_participant`). Alle anderen 42501.
--   4 Markieren: `set_hack_team_looking` (Kapitän des eigenen Teams), `set_hack_seeking`
--     (eigene angenommene Bewerbung, ohne Team).
--   5 Listen: `hack_team_search` (offene Teams mit freien Plätzen, Challenge, Track, gesuchte
--     Skills, eigene offene Anfrage), `hack_people_search` (nur für Teammitglieder: Personen mit
--     „suche Team“ ohne Team — **Vorname**, Studienfeld, Skills der Bewerbung, Track-Wunsch;
--     kein Nachname, keine E-Mail, kein Telefon, keine Links).
--   6 Anfragen: `request_hack_join` (Person ohne Team → offenes Team), `invite_hack_person`
--     (Kapitän → Person mit „suche Team“), `answer_hack_request` (Kapitän bei `to_team`, Person
--     bei `to_person`; Zusage fügt die Person ein — dieselben Regeln wie `join_hack_team`:
--     ein Team je Edition, höchstens 8 — und schließt ihre übrigen offenen Anfragen),
--     `withdraw_hack_request` (wer die Anfrage gestellt hat), `my_hack_requests` (eigene Sicht:
--     als Person und als Kapitän). Audit je Schritt.
--   7 `my_hack` liefert `application.seeking_team`.
-- Fehlerschlüssel neu: `not_participant`, `not_captain`, `team_not_looking`,
-- `person_not_seeking`, `request_pending`, `request_closed` (lib/rpc-error.ts + Wörterbücher).
-- Test: supabase/tests/v6_hack_teamsuche.sql
set search_path = public, extensions;

-- ---------------------------------------------------------------- 1 · Spalten

alter table hack_team
  add column if not exists looking boolean not null default false,
  add column if not exists looking_skills text[] not null default '{}',
  add column if not exists looking_note text;
alter table hack_team drop constraint if exists hack_team_looking_chk;
alter table hack_team add constraint hack_team_looking_chk
  check (cardinality(looking_skills) <= 8 and (looking_note is null or length(looking_note) <= 200));
comment on column hack_team.looking is 'Team sucht noch Mitglieder (HACK-016), gesetzt vom Kapitän über set_hack_team_looking.';
comment on column hack_team.looking_skills is 'Gesuchte Skills (vocab hack_skill, HACK-016).';
comment on column hack_team.looking_note is 'Eine Zeile, wen das Team sucht (HACK-016), ≤ 200 Zeichen. Keine Kontaktdaten.';

alter table hack_application add column if not exists seeking_team boolean not null default false;
comment on column hack_application.seeking_team is 'Person sucht ein Team (HACK-016), gesetzt über set_hack_seeking.';

insert into vocab_binding (vocabulary, table_name, column_name, is_array, note)
values ('hack_skill', 'hack_team', 'looking_skills', true, 'Gesuchte Skills eines Teams (HACK-016)')
on conflict (vocabulary, table_name, column_name) do nothing;

-- ---------------------------------------------------------------- 2 · Anfragen

create table if not exists hack_join_request (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references hack_team(id) on delete cascade,
  person_id   uuid not null references person(id) on delete cascade,
  edition_id  uuid not null references event(id) on delete cascade,
  direction   text not null check (direction in ('to_team', 'to_person')),
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  message     text check (message is null or length(message) <= 300),
  created_by  uuid references person(id) on delete set null,
  created_at  timestamptz not null default now(),
  decided_by  uuid references person(id) on delete set null,
  decided_at  timestamptz
);
create unique index if not exists hack_join_request_open_idx on hack_join_request (team_id, person_id) where status = 'pending';
create index if not exists hack_join_request_person_idx on hack_join_request (person_id);
comment on table hack_join_request is
  'Beitrittsanfragen im Hackathon (HACK-016): to_team = Person fragt beim Team an, to_person = Team lädt ein. Zugriff nur über Funktionen; nie Kontaktdaten.';
alter table hack_join_request enable row level security;
revoke all on hack_join_request from anon, authenticated;

-- ---------------------------------------------------------------- 3 · Hilfen

create or replace function hack_is_participant(p_edition_id uuid default null)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select current_person_id() is not null and (
    exists (select 1 from hack_application a where a.person_id = current_person_id()
             and a.edition_id = hack_edition(p_edition_id) and a.status = 'accepted')
    or my_hack_team_id(hack_edition(p_edition_id)) is not null)
$$;

create or replace function hack_is_captain(p_team_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select exists (select 1 from hack_team_member m where m.team_id = p_team_id
                  and m.person_id = current_person_id() and m.is_captain)
$$;

-- ---------------------------------------------------------------- 4 · Markieren

create or replace function set_hack_team_looking(p_looking boolean, p_skills text[] default '{}', p_note text default null)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_team uuid := my_hack_team_id(null); v_k text;
        v_skills text[] := coalesce((select array_agg(distinct btrim(x)) from unnest(p_skills) x where btrim(x) <> ''), '{}');
        v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if v_team is null then raise exception 'not_my_team' using errcode = 'P0001'; end if;
  if not hack_is_captain(v_team) then raise exception 'not_captain' using errcode = '42501'; end if;
  foreach v_k in array v_skills loop
    if not is_vocab_key('hack_skill', v_k) then raise exception 'invalid_skill' using errcode = '22023', detail = v_k; end if;
  end loop;
  if cardinality(v_skills) > 8 then raise exception 'invalid_skill' using errcode = '22023', detail = 'max 8'; end if;
  if length(v_note) > 200 then raise exception 'too_long' using errcode = '22023', detail = '200'; end if;
  update hack_team set looking = coalesce(p_looking, false), looking_skills = v_skills, looking_note = v_note, updated_at = now()
   where id = v_team;
  perform log_audit('hack.team_looking', 'hack_team', v_team::text, null,
                    jsonb_build_object('looking', coalesce(p_looking, false), 'skills', v_skills));
end $$;

create or replace function set_hack_seeking(p_seeking boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_ed uuid := hack_edition(null); v_app uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select id into v_app from hack_application where person_id = v_me and edition_id = v_ed and status = 'accepted';
  if v_app is null then raise exception 'not_participant' using errcode = '42501'; end if;
  if coalesce(p_seeking, false) and my_hack_team_id(v_ed) is not null then
    raise exception 'already_in_team' using errcode = 'P0001';
  end if;
  update hack_application set seeking_team = coalesce(p_seeking, false) where id = v_app;
  perform log_audit('hack.seeking', 'hack_application', v_app::text, null, jsonb_build_object('seeking', coalesce(p_seeking, false)));
end $$;

-- ---------------------------------------------------------------- 5 · Listen

create or replace function hack_team_search(p_edition_id uuid default null, p_language text default 'en')
 RETURNS TABLE(team_id uuid, team_name text, challenge_title text, track text, members integer, free_slots integer,
               looking_skills text[], looking_note text, my_request text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid := hack_edition(p_edition_id); v_me uuid := current_person_id();
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not hack_is_participant(v_ed) then raise exception 'not_participant' using errcode = '42501'; end if;
  return query
    select t.id, t.name, hack_text(c.title_de, c.title_en, p_language), c.track,
           x.n, 8 - x.n, t.looking_skills, t.looking_note,
           (select r.direction from hack_join_request r
             where r.team_id = t.id and r.person_id = v_me and r.status = 'pending' limit 1)
      from hack_team t
      left join hack_challenge c on c.id = t.challenge_id
      cross join lateral (select count(*)::integer as n from hack_team_member m where m.team_id = t.id) x
     where t.edition_id = v_ed and t.status <> 'withdrawn' and t.looking and x.n < 8
     order by t.name;
end $$;

create or replace function hack_people_search(p_edition_id uuid default null)
 RETURNS TABLE(person_id uuid, first_name text, study_field text, skills text[], track_prefs text[], invited boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid := hack_edition(p_edition_id); v_team uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_team := my_hack_team_id(v_ed);
  -- Nur wer in einem Team ist, sucht Personen.
  if v_team is null then raise exception 'not_participant' using errcode = '42501'; end if;
  return query
    select p.id, p.first_name, p.study_field, a.skills, a.track_prefs,
           exists (select 1 from hack_join_request r where r.team_id = v_team and r.person_id = p.id and r.status = 'pending')
      from hack_application a
      join person p on p.id = a.person_id and p.deleted_at is null
     where a.edition_id = v_ed and a.status = 'accepted' and a.seeking_team
       and not exists (select 1 from hack_team_member m where m.person_id = a.person_id and m.edition_id = v_ed)
     order by p.first_name;
end $$;

-- ---------------------------------------------------------------- 6 · Anfragen

create or replace function request_hack_join(p_team_id uuid, p_message text default null)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_t hack_team; v_id uuid; v_msg text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_t from hack_team where id = p_team_id and status <> 'withdrawn';
  if not found then raise exception 'team_not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from hack_application a where a.person_id = v_me and a.edition_id = v_t.edition_id and a.status = 'accepted') then
    raise exception 'not_participant' using errcode = '42501';
  end if;
  if my_hack_team_id(v_t.edition_id) is not null then raise exception 'already_in_team' using errcode = 'P0001'; end if;
  if not v_t.looking then raise exception 'team_not_looking' using errcode = 'P0001'; end if;
  if length(v_msg) > 300 then raise exception 'too_long' using errcode = '22023', detail = '300'; end if;
  if exists (select 1 from hack_join_request r where r.team_id = p_team_id and r.person_id = v_me and r.status = 'pending') then
    raise exception 'request_pending' using errcode = 'P0001';
  end if;
  insert into hack_join_request (team_id, person_id, edition_id, direction, message, created_by)
  values (p_team_id, v_me, v_t.edition_id, 'to_team', v_msg, v_me) returning id into v_id;
  perform log_audit('hack.join_requested', 'hack_team', p_team_id::text, null, jsonb_build_object('request_id', v_id));
  return v_id;
end $$;

create or replace function invite_hack_person(p_person_id uuid, p_message text default null)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_ed uuid := hack_edition(null); v_team uuid; v_id uuid;
        v_msg text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_team := my_hack_team_id(v_ed);
  if v_team is null then raise exception 'not_my_team' using errcode = 'P0001'; end if;
  if not hack_is_captain(v_team) then raise exception 'not_captain' using errcode = '42501'; end if;
  if not exists (select 1 from hack_application a where a.person_id = p_person_id and a.edition_id = v_ed
                  and a.status = 'accepted' and a.seeking_team)
     or exists (select 1 from hack_team_member m where m.person_id = p_person_id and m.edition_id = v_ed) then
    raise exception 'person_not_seeking' using errcode = 'P0001';
  end if;
  if length(v_msg) > 300 then raise exception 'too_long' using errcode = '22023', detail = '300'; end if;
  if exists (select 1 from hack_join_request r where r.team_id = v_team and r.person_id = p_person_id and r.status = 'pending') then
    raise exception 'request_pending' using errcode = 'P0001';
  end if;
  insert into hack_join_request (team_id, person_id, edition_id, direction, message, created_by)
  values (v_team, p_person_id, v_ed, 'to_person', v_msg, v_me) returning id into v_id;
  perform log_audit('hack.person_invited', 'hack_team', v_team::text, null, jsonb_build_object('request_id', v_id));
  return v_id;
end $$;

create or replace function answer_hack_request(p_request_id uuid, p_accept boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_r hack_join_request; v_n integer; v_t hack_team;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_r from hack_join_request where id = p_request_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- Antworten darf die Gegenseite: Kapitän bei einer Anfrage ans Team, die Person bei einer Einladung.
  if not ((v_r.direction = 'to_team' and hack_is_captain(v_r.team_id))
          or (v_r.direction = 'to_person' and v_r.person_id = v_me)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_r.status <> 'pending' then raise exception 'request_closed' using errcode = 'P0001'; end if;

  if coalesce(p_accept, false) then
    -- Alle Regeln von join_hack_team noch einmal, unter Zeilensperre auf Team und Bewerbung:
    -- zwei gleichzeitige Zusagen warten aufeinander und sehen danach den neuen Stand.
    select * into v_t from hack_team where id = v_r.team_id for update;
    if not found or v_t.status = 'withdrawn' then raise exception 'team_not_found' using errcode = 'P0002'; end if;
    perform 1 from hack_application a where a.person_id = v_r.person_id and a.edition_id = v_r.edition_id for update;
    if exists (select 1 from hack_team_member m where m.person_id = v_r.person_id and m.edition_id = v_r.edition_id) then
      raise exception 'already_in_team' using errcode = 'P0001';
    end if;
    -- Anfrage ans Team gilt nur, solange das Team sucht; eine Einladung nur, solange die Person
    -- eine angenommene Bewerbung hat.
    if v_r.direction = 'to_team' and not v_t.looking then
      raise exception 'team_not_looking' using errcode = 'P0001';
    end if;
    if not exists (select 1 from hack_application a where a.person_id = v_r.person_id
                    and a.edition_id = v_r.edition_id and a.status = 'accepted') then
      raise exception 'not_participant' using errcode = '42501';
    end if;
    select count(*) into v_n from hack_team_member where team_id = v_r.team_id;
    if v_n >= 8 then raise exception 'team_full' using errcode = 'P0001', detail = '8'; end if;
    insert into hack_team_member (team_id, person_id, edition_id) values (v_r.team_id, v_r.person_id, v_r.edition_id);
    update hack_application set team_id = v_r.team_id, seeking_team = false
     where person_id = v_r.person_id and edition_id = v_r.edition_id;
    update hack_join_request set status = 'accepted', decided_by = v_me, decided_at = now() where id = v_r.id;
    -- Übrige offene Anfragen der Person sind erledigt.
    update hack_join_request set status = 'withdrawn', decided_at = now()
     where person_id = v_r.person_id and edition_id = v_r.edition_id and status = 'pending' and id <> v_r.id;
    perform log_audit('hack.join_accepted', 'hack_team', v_r.team_id::text, null, jsonb_build_object('request_id', v_r.id));
  else
    update hack_join_request set status = 'declined', decided_by = v_me, decided_at = now() where id = v_r.id;
    perform log_audit('hack.join_declined', 'hack_team', v_r.team_id::text, null, jsonb_build_object('request_id', v_r.id));
  end if;
end $$;

create or replace function withdraw_hack_request(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_r hack_join_request;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_r from hack_join_request where id = p_request_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- Zurückziehen darf, wer gefragt hat: die Person (to_team) oder der Kapitän (to_person).
  if not ((v_r.direction = 'to_team' and v_r.person_id = v_me)
          or (v_r.direction = 'to_person' and hack_is_captain(v_r.team_id))) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_r.status <> 'pending' then raise exception 'request_closed' using errcode = 'P0001'; end if;
  update hack_join_request set status = 'withdrawn', decided_by = v_me, decided_at = now() where id = v_r.id;
  perform log_audit('hack.join_withdrawn', 'hack_team', v_r.team_id::text, null, jsonb_build_object('request_id', v_r.id));
end $$;

create or replace function my_hack_requests(p_edition_id uuid default null)
 RETURNS TABLE(request_id uuid, direction text, status text, team_id uuid, team_name text,
               person_first_name text, message text, created_at timestamp with time zone, mine_to_answer boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_ed uuid := hack_edition(p_edition_id); v_team uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_team := my_hack_team_id(v_ed);
  return query
    select r.id, r.direction, r.status, t.id, t.name, p.first_name, r.message, r.created_at,
           (r.status = 'pending' and ((r.direction = 'to_person' and r.person_id = v_me)
                                      or (r.direction = 'to_team' and hack_is_captain(r.team_id))))
      from hack_join_request r
      join hack_team t on t.id = r.team_id
      join person p on p.id = r.person_id
     where r.edition_id = v_ed
       and (r.person_id = v_me or (v_team is not null and r.team_id = v_team))
     order by (r.status = 'pending') desc, r.created_at desc;
end $$;

-- ---------------------------------------------------------------- 7 · Eigene Sicht

-- my_hack liefert zusätzlich application.seeking_team (Schalter „Ich suche ein Team“).
-- Basis: supabase/snapshot/functions/my_hack.sql
create or replace function my_hack(p_edition_id uuid DEFAULT NULL::uuid, p_language text DEFAULT 'en'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
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
      'motivation', v_app.motivation, 'team_pref', v_app.team_pref, 'applied_at', v_app.applied_at,
      'github_url', v_app.github_url, 'website_url', v_app.website_url, 'behance_url', v_app.behance_url,
      'track_prefs', to_jsonb(v_app.track_prefs), 'seeking_team', v_app.seeking_team) end,
    'team', case when v_team.id is null then null else jsonb_build_object(
      'id', v_team.id, 'name', v_team.name, 'status', v_team.status,
      -- Den Beitrittscode sieht nur, wer schon drin ist.
      'join_code', v_team.join_code, 'discord_url', v_team.discord_url,
      'members', (select coalesce(jsonb_agg(jsonb_build_object(
                    'person_id', p.id, 'name', nullif(btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''),
                    'is_captain', m.is_captain) order by m.joined_at), '[]'::jsonb)
                  from hack_team_member m join person p on p.id = m.person_id where m.team_id = v_team.id)) end,
    'challenge', case when v_ch.id is null then null else jsonb_build_object(
      'id', v_ch.id, 'title', hack_text(v_ch.title_de, v_ch.title_en, p_language),
      'description', hack_text(v_ch.description_de, v_ch.description_en, p_language),
      'prizes', v_ch.prizes, 'resources', v_ch.resources, 'criteria', v_ch.criteria,
      'track', v_ch.track, 'submission_deadline', v_ch.submission_deadline) end,
    'submission', case when v_sub.id is null then null else jsonb_build_object(
      'url', v_sub.url, 'repo_url', v_sub.repo_url, 'notes', v_sub.notes,
      'submitted_at', v_sub.submitted_at, 'late', v_sub.late) end);
end $$;

select harden_definer_functions();
