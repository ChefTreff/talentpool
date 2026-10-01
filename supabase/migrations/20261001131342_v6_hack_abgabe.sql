-- 0244 · Abgabe über das Portal: privater Bucket hack-submissions mit Pfadregel, Frist je Challenge, verspätet statt gesperrt (HACK-011)
-- Angewendet von der Architektur-Session am 01.10.2026 als 20261001131342.
-- Bucket hack-submissions, Frist je Challenge, danach „verspätet“.
--
-- Anlass: Emilio (Call 24.09., HACK-006): Abgaben laufen außerhalb der Plattform; Lastspitze
-- ~300 Uploads zur Deadline. Backlog-Empfehlung: `hack_submission` gibt es schon (Link, Repo,
-- Notiz) — Dateien direkt aus dem Browser in einen privaten Bucket (signierte Upload-Adresse,
-- keine Server-Last), Größenlimit je Datei, Frist je Challenge, nach der Frist nur „verspätet“.
--
-- Diese Migration:
--   1 `hack_challenge.submission_deadline` (Frist je Challenge, gesetzt vom Hack-Team über
--     `set_hack_challenge_deadline`, Audit). `hack_submission.late`.
--   2 Bucket `hack-submissions`: **privat**, 50 MB je Datei, Abgabeformate als MIME-Liste.
--   3 Tabelle `hack_submission_file` (bis 10 Dateien je Team, je Datei `late`): RLS an,
--     **keine Grants** — nur über Funktionen.
--   4 Rechte: Schreiben = **Mitglied des Teams** (`my_hack_team_id`); Lesen = Team,
--     Jury der Challenge und Hack-Team (`can_judge_hack_team`).
--   5 Storage-Policies auf `storage.objects` für `hack-submissions`:
--      * **Lesen** (select, authenticated): `hack_submission_path_allowed(name)` — Pfad
--        `<team_id>/<datei>`; nur eingetragene Dateien; Objekte ohne Zeile nur das Hack-Team.
--      * **Schreiben/Ändern/Löschen: keine Policy.** Hochladen nur über
--        `/api/hackathon/submission`: prüft `can_write_hack_submission` mit der Sitzung und
--        signiert mit service_role genau einen selbst gebauten Pfad `<team_id>/<uuid>-<name>`;
--        die Bytes gehen direkt vom Browser zu Supabase (keine Server-Last zur Deadline).
--        Entfernen über `remove_hack_submission_file` (Recht, Audit), das Objekt löscht die
--        Route danach mit service_role.
--   6 `register_hack_submission_file` (Recht, Pfad, Objekt, Größe, höchstens 10, `late` nach
--     Frist, Audit), `hack_submission_files(p_team_id)` (Team/Jury/Hack-Team, sonst 42501;
--     ohne Team: alle Dateien, die die Person lesen darf).
--   7 `submit_hack` setzt `late`; `my_hack` liefert `challenge.submission_deadline` und
--     `submission.late`; `hack_judging`, `hack_admin_overview`, `hack_challenges` liefern
--     `late` bzw. die Frist (Rückgabetyp ⇒ drop + create).
-- Basis: supabase/snapshot/functions/{submit_hack,my_hack,hack_judging,hack_admin_overview,hack_challenges}.sql
-- Fehlerschlüssel neu: `too_many_files` (lib/rpc-error.ts + Wörterbücher im selben PR).
-- Test: supabase/tests/v6_hack_abgabe.sql
set search_path = public, extensions;

-- ---------------------------------------------------------------- 1 · Frist, verspätet

alter table hack_challenge add column if not exists submission_deadline timestamptz;
comment on column hack_challenge.submission_deadline is 'Abgabefrist der Challenge (HACK-011); danach gelten Abgaben als verspätet. Gesetzt über set_hack_challenge_deadline.';
alter table hack_submission add column if not exists late boolean not null default false;
comment on column hack_submission.late is 'Abgabe nach der Frist der Challenge (HACK-011), gesetzt von submit_hack.';

create or replace function hack_submission_is_late(p_team_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce((select now() > c.submission_deadline from hack_team t
                     join hack_challenge c on c.id = t.challenge_id where t.id = p_team_id), false)
$$;

create or replace function set_hack_challenge_deadline(p_challenge_id uuid, p_deadline timestamptz)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_old timestamptz;
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  select submission_deadline into v_old from hack_challenge where id = p_challenge_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update hack_challenge set submission_deadline = p_deadline, updated_at = now() where id = p_challenge_id;
  perform log_audit('hack.challenge_deadline', 'hack_challenge', p_challenge_id::text,
                    jsonb_build_object('deadline', v_old), jsonb_build_object('deadline', p_deadline));
end $$;

-- ---------------------------------------------------------------- 2 · Bucket

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hack-submissions', 'hack-submissions', false, 52428800,
        array['application/pdf', 'application/zip', 'application/x-zip-compressed',
              'application/vnd.openxmlformats-officedocument.presentationml.presentation',
              'application/vnd.ms-powerpoint', 'application/vnd.apple.keynote',
              'image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/quicktime',
              'text/plain', 'text/csv', 'application/json', 'application/octet-stream'])
on conflict (id) do update set
  public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------- 3 · Tabelle

create table if not exists hack_submission_file (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references hack_team(id) on delete cascade,
  storage_path text not null unique,
  filename     text not null check (length(filename) between 1 and 200),
  mime         text,
  size_bytes   bigint check (size_bytes is null or size_bytes between 1 and 52428800),
  late         boolean not null default false,
  uploaded_by  uuid references person(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists hack_submission_file_team_idx on hack_submission_file (team_id);
comment on table hack_submission_file is
  'Dateien einer Hackathon-Abgabe (HACK-011) im privaten Bucket hack-submissions (<team_id>/<datei>). Zugriff nur über Funktionen.';
alter table hack_submission_file enable row level security;
revoke all on hack_submission_file from anon, authenticated;

-- ---------------------------------------------------------------- 4 · Rechte

create or replace function can_write_hack_submission(p_team_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select current_person_id() is not null and exists (
    select 1 from hack_team t join hack_team_member m on m.team_id = t.id
     where t.id = p_team_id and t.status <> 'withdrawn' and m.person_id = current_person_id())
$$;

create or replace function can_read_hack_submission(p_team_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select current_person_id() is not null
     and (can_write_hack_submission(p_team_id) or can_judge_hack_team(p_team_id))
$$;

-- ---------------------------------------------------------------- 5 · Storage-Policy

create or replace function hack_submission_path_allowed(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_team uuid;
begin
  if current_person_id() is null or p_name is null then return false; end if;
  begin v_team := split_part(p_name, '/', 1)::uuid; exception when others then return false; end;
  if not exists (select 1 from hack_submission_file f where f.storage_path = p_name and f.team_id = v_team) then
    return is_hack_team();   -- Waisen: nur das Hack-Team
  end if;
  return can_read_hack_submission(v_team);
end $$;
revoke all on function hack_submission_path_allowed(text) from public, anon;
grant execute on function hack_submission_path_allowed(text) to authenticated;
comment on function hack_submission_path_allowed(text) is
  'Pfadregel (HACK-011) für den Bucket hack-submissions: eingetragene Dateien lesen Team, Jury der Challenge und Hack-Team; Waisen nur das Hack-Team.';

drop policy if exists "hack submissions read" on storage.objects;
create policy "hack submissions read" on storage.objects
  for select to authenticated
  using (bucket_id = 'hack-submissions' and hack_submission_path_allowed(name));

-- ---------------------------------------------------------------- 6 · Dateien

create or replace function register_hack_submission_file(p_team_id uuid, p_storage_path text, p_filename text,
                                                         p_mime text default null, p_size_bytes bigint default null)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_id uuid; v_late boolean;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not can_write_hack_submission(p_team_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_storage_path is null or p_storage_path not like p_team_id::text || '/%'
     or split_part(p_storage_path, '/', 3) <> '' or split_part(p_storage_path, '/', 2) = '' then
    raise exception 'path_mismatch' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'hack-submissions' and o.name = p_storage_path) then
    raise exception 'object_not_found' using errcode = 'P0002';
  end if;
  if p_size_bytes is not null and (p_size_bytes < 1 or p_size_bytes > 52428800) then
    raise exception 'file_rules' using errcode = '22023', detail = 'max_bytes';
  end if;
  perform 1 from hack_team where id = p_team_id for update;   -- Zählen und Einfügen ohne Wettlauf
  if (select count(*) from hack_submission_file where team_id = p_team_id) >= 10 then
    raise exception 'too_many_files' using errcode = '22023', detail = '10';
  end if;
  v_late := hack_submission_is_late(p_team_id);
  insert into hack_submission_file (team_id, storage_path, filename, mime, size_bytes, late, uploaded_by)
  values (p_team_id, p_storage_path, left(coalesce(nullif(btrim(p_filename), ''), 'datei'), 200),
          nullif(btrim(coalesce(p_mime, '')), ''), p_size_bytes, v_late, v_me)
  returning id into v_id;
  perform log_audit('hack.submission_file', 'hack_team', p_team_id::text, null,
                    jsonb_build_object('file_id', v_id, 'filename', p_filename, 'late', v_late));
  return v_id;
end $$;

create or replace function remove_hack_submission_file(p_file_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_f hack_submission_file;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_f from hack_submission_file where id = p_file_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not can_write_hack_submission(v_f.team_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from hack_submission_file where id = p_file_id;
  perform log_audit('hack.submission_file_removed', 'hack_team', v_f.team_id::text,
                    jsonb_build_object('file_id', v_f.id, 'filename', v_f.filename), null);
  return v_f.storage_path;
end $$;

create or replace function hack_submission_files(p_team_id uuid default null, p_edition_id uuid default null)
 RETURNS TABLE(file_id uuid, team_id uuid, storage_path text, filename text, mime text, size_bytes bigint,
               late boolean, uploaded_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_team_id is not null and not can_read_hack_submission(p_team_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select f.id, f.team_id, f.storage_path, f.filename, f.mime, f.size_bytes, f.late, f.created_at
      from hack_submission_file f
      join hack_team t on t.id = f.team_id
     where (p_team_id is null or f.team_id = p_team_id)
       and t.edition_id = hack_edition(p_edition_id)
       and can_read_hack_submission(f.team_id)
     order by f.team_id, f.created_at;
end $$;

-- ---------------------------------------------------------------- 7 · Bestehende Funktionen

create or replace function submit_hack(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_team uuid; v_id uuid; v_n integer; v_late boolean;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_team := my_hack_team_id(nullif(p_data->>'edition_id', '')::uuid);
  if v_team is null then raise exception 'not_my_team' using errcode = 'P0001'; end if;

  select count(*) into v_n from hack_team_member where team_id = v_team;
  if v_n < 3 then
    raise exception 'team_too_small' using errcode = 'P0001', detail = v_n::text;
  end if;

  -- Frist je Challenge (HACK-011): danach geht die Abgabe noch, ist aber „verspätet“.
  v_late := hack_submission_is_late(v_team);

  insert into hack_submission (team_id, url, repo_url, notes, submitted_at, submitted_by, late)
  values (v_team, nullif(btrim(p_data->>'url'), ''), nullif(btrim(p_data->>'repo_url'), ''),
          nullif(btrim(p_data->>'notes'), ''), now(), v_me, v_late)
  on conflict (team_id) do update set
    url = excluded.url, repo_url = excluded.repo_url, notes = excluded.notes,
    submitted_at = now(), submitted_by = v_me, late = excluded.late, updated_at = now()
  returning id into v_id;

  perform log_audit('hack.submitted', 'hack_team', v_team::text, null, jsonb_build_object('late', v_late));
  return v_id;
end $$;

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
      'track_prefs', to_jsonb(v_app.track_prefs)) end,
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

drop function if exists hack_judging(uuid, text);
create or replace function hack_judging(p_edition_id uuid DEFAULT NULL::uuid, p_language text DEFAULT 'en'::text)
 RETURNS TABLE(team_id uuid, team_name text, challenge_title text, criteria jsonb, submission_url text, repo_url text, notes text, submitted_at timestamp with time zone, my_criteria jsonb, my_total numeric, my_note text, judging_mode text, metric_label text, metric_value numeric, metric_confirmed boolean, late boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_hack_judge() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select t.id, t.name, hack_text(c.title_de, c.title_en, p_language), coalesce(c.criteria, '[]'::jsonb),
           s.url, s.repo_url, s.notes, s.submitted_at,
           j.criteria, j.total, j.note,
           coalesce(c.judging_mode, 'jury'), c.metric_label, r.value, r.confirmed_at is not null,
           coalesce(s.late, false)
      from hack_team t
      left join hack_challenge c on c.id = t.challenge_id
      left join hack_submission s on s.team_id = t.id
      left join hack_judging_score j on j.team_id = t.id and j.judge_id = current_person_id()
      left join hack_metric_result r on r.team_id = t.id
     where t.edition_id = hack_edition(p_edition_id) and t.status <> 'withdrawn'
       -- Partner-Jury: nur die Teams der eigenen Challenge.
       and can_judge_hack_team(t.id)
     order by t.name;
end $$;

drop function if exists hack_admin_overview(uuid, text);
create or replace function hack_admin_overview(p_edition_id uuid DEFAULT NULL::uuid, p_language text DEFAULT 'en'::text)
 RETURNS TABLE(team_id uuid, team_name text, status text, members integer, captain text, challenge_id uuid, challenge_title text, submitted_at timestamp with time zone, scores integer, avg_total numeric, late boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select t.id, t.name, t.status,
           (select count(*)::integer from hack_team_member m where m.team_id = t.id),
           (select nullif(btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), '')
              from hack_team_member m join person p on p.id = m.person_id
             where m.team_id = t.id and m.is_captain limit 1),
           t.challenge_id, hack_text(c.title_de, c.title_en, p_language),
           s.submitted_at,
           (select count(*)::integer from hack_judging_score j where j.team_id = t.id),
           (select round(avg(j.total), 2) from hack_judging_score j where j.team_id = t.id),
           coalesce(s.late, false)
      from hack_team t
      left join hack_challenge c on c.id = t.challenge_id
      left join hack_submission s on s.team_id = t.id
     where t.edition_id = hack_edition(p_edition_id) and t.status <> 'withdrawn'
     order by t.name;
end $$;

drop function if exists hack_challenges(uuid, text);
create or replace function hack_challenges(p_edition_id uuid DEFAULT NULL::uuid, p_language text DEFAULT 'en'::text)
 RETURNS TABLE(id uuid, title text, description text, prizes text, resources text, mentors jsonb, criteria jsonb, org_name text, teams integer, track text, judging_mode text, metric_label text, metric_higher_better boolean,
               submission_deadline timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select c.id, hack_text(c.title_de, c.title_en, p_language),
           hack_text(c.description_de, c.description_en, p_language),
           c.prizes, c.resources, c.mentors, c.criteria,
           coalesce(o.communication_name, o.legal_name),
           (select count(*)::integer from hack_team t where t.challenge_id = c.id and t.status <> 'withdrawn'),
           c.track, c.judging_mode, c.metric_label, c.metric_higher_better, c.submission_deadline
      from hack_challenge c
      left join organization o on o.id = c.org_id
     where c.edition_id = hack_edition(p_edition_id) and c.status = 'published'
     order by c.sort_order, hack_text(c.title_de, c.title_en, p_language);
end $$;

select harden_definer_functions();
