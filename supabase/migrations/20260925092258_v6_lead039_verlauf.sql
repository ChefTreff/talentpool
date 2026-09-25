-- 0190 · Verlauf und Aufgaben der Speaker-Pipeline: speaker_activity (LEAD-039 Schnitt 2, LEAD-025, LEAD-027)
-- Angewendet von der Architektur-Session am 25.09.2026 als 20260925092258.
--
-- Vorschlag der Build-Session Speaker-Domäne. Nummer, Anwenden, Umbenennen und
-- der Eintrag ins Entscheidungslog gehören der Architektur-Session.
--
-- Anlass: LEAD-039 Schnitt 2 nach `docs/vorschlag-lead039-pipeline-felder.md`
-- (B), freigegeben mit K-36 (25.09.). Trägt LEAD-025 (Kommentare je Speaker, eine
-- Übersicht im Speaker-Admin) und LEAD-027 (eigene Aufgaben mit Frist, oben in
-- der Pipeline). Das Kommentar-Protokoll der Arbeitstabelle („Wer / Wann /
-- Kanal“) ist hier `author_person_id`, `occurred_at` und `kind`; der „nächste
-- Schritt mit Wiedervorlage“ ist eine **offene Aufgabe**, kein Feld am Profil.
--
-- Neu:
--   * Vokabular `speaker_activity_kind`: note, email, call, meeting, message,
--     task — mit `vocab_binding`.
--   * Tabelle `speaker_activity`: je Eintrag Art, Text (1–2000 Zeichen), Zeitpunkt
--     (nachtragbar), bei Aufgaben Frist (`due_on`, Pflicht) und Zuständige, dazu
--     erledigt am/von und die schreibende Person. CHECKs halten Aufgabenfelder bei
--     Aufgaben. RLS: lesen wie das Profil (`can_manage_speaker` — K-36 F1: Stage
--     Leads sehen den ganzen Verlauf der Speaker ihrer Bühne); keine Schreib-Grants.
--   * `add_speaker_activity(profile, data)`: wer `can_manage_speaker` hat. Die
--     Zuständige einer Aufgabe ist man selbst (Standard), der Owner des Speakers
--     oder eine Person mit aktiver Rolle `speaker_manager` oder Team-Rolle der
--     Edition — sonst `invalid_assignee`.
--   * `update_speaker_activity(id, data)`, `delete_speaker_activity(id)`: Autor
--     oder Team. `set_speaker_activity_done(id, done)`: Autor, Zuständige, Owner
--     oder Team — nur bei Aufgaben.
--   * `speaker_activities(profile)`: der Verlauf mit Namen, neuester zuerst.
--   * `speaker_activity_overview(edition)`: alle Einträge der Edition fürs Team
--     (LEAD-025, `/admin/speaker/verlauf`).
--   * `manager_speakers`: `open_tasks`, `next_task`, `last_activity_at` (drop +
--     create, der Rückgabetyp wächst hinten — alle alten Spalten bleiben).
--   * `anonymize_person` löscht den Verlauf des Profils.
--
-- Speaker, Assistenz und Partner lesen den Verlauf nie: die Tabelle hat nur die
-- Regel `can_manage_speaker`, und keine ihrer RPCs gibt ihn aus.
--
-- Funktionen aus `supabase/snapshot/functions/`: `manager_speakers`,
-- `anonymize_person`; neu: `speaker_activity_assignee_ok`,
-- `speaker_activity_edit_right` (beide intern), `add_speaker_activity`,
-- `update_speaker_activity`, `set_speaker_activity_done`,
-- `delete_speaker_activity`, `speaker_activities`, `speaker_activity_overview`.
-- Fehlerschlüssel: 22023 `invalid_activity_kind`, `body_required`,
-- `text_too_long`, `due_required`, `invalid_assignee`, `not_a_task`; P0002
-- `activity_not_found`, `speaker_not_found`; 42501 `not allowed`; 28000.

set search_path = public, extensions;

-- ---- 1 · Vokabular
insert into vocab_term (vocabulary, key, label_de, label_en, sort_order) values
  ('speaker_activity_kind', 'note',    'Notiz',     'Note',    1),
  ('speaker_activity_kind', 'email',   'E-Mail',    'Email',   2),
  ('speaker_activity_kind', 'call',    'Anruf',     'Call',    3),
  ('speaker_activity_kind', 'meeting', 'Treffen',   'Meeting', 4),
  ('speaker_activity_kind', 'message', 'Nachricht', 'Message', 5),
  ('speaker_activity_kind', 'task',    'Aufgabe',   'Task',    6)
on conflict (vocabulary, key) do nothing;

-- ---- 2 · Tabelle
create table if not exists speaker_activity (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references speaker_profile(id) on delete cascade,
  kind               text not null,
  body               text not null,
  occurred_at        timestamptz not null default now(),
  due_on             date,
  assignee_person_id uuid references person(id) on delete set null,
  done_at            timestamptz,
  done_by            uuid references person(id) on delete set null,
  author_person_id   uuid references person(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint speaker_activity_body_chk check (length(btrim(body)) between 1 and 2000),
  -- Frist genau bei Aufgaben; Zuständige und „erledigt“ nur bei Aufgaben.
  constraint speaker_activity_task_chk check (
    (kind = 'task') = (due_on is not null)
    and (kind = 'task' or (assignee_person_id is null and done_at is null and done_by is null)))
);
comment on table speaker_activity is
  'Verlauf der Speaker-Pipeline (LEAD-039 Schnitt 2): Notizen, Kontakte, Aufgaben mit Frist. Intern wie das Profil: lesen mit can_manage_speaker, schreiben nur über die RPCs.';
comment on column speaker_activity.kind is 'Vokabular speaker_activity_kind: note, email, call, meeting, message, task.';
comment on column speaker_activity.occurred_at is 'Wann es war — nachtragbar; bei Aufgaben der Zeitpunkt des Anlegens.';
comment on column speaker_activity.due_on is 'Frist einer Aufgabe (Wiedervorlage); gesetzt genau bei kind = task.';
comment on column speaker_activity.assignee_person_id is 'Wer die Aufgabe erledigt; Standard die schreibende Person.';
comment on column speaker_activity.author_person_id is 'Wer den Eintrag geschrieben hat (current_person_id()); bleibt nach dem Löschen einer Person leer.';
create index if not exists speaker_activity_profile_idx on speaker_activity (profile_id, occurred_at desc);
create index if not exists speaker_activity_open_task_idx on speaker_activity (profile_id, due_on) where kind = 'task' and done_at is null;

drop trigger if exists trg_speaker_activity_updated on speaker_activity;
create trigger trg_speaker_activity_updated before update on speaker_activity for each row execute function set_updated_at();

alter table speaker_activity enable row level security;
drop policy if exists sa_manage_sel on speaker_activity;
create policy sa_manage_sel on speaker_activity for select to authenticated using (can_manage_speaker(profile_id));
revoke all on speaker_activity from anon;
revoke insert, update, delete on speaker_activity from authenticated;   -- Schreiben nur per RPC
grant select on speaker_activity to authenticated;

insert into vocab_binding (vocabulary, table_name, column_name, is_array, vocabulary_column, note) values
  ('speaker_activity_kind', 'speaker_activity', 'kind', false, null, 'speaker_activity.kind (LEAD-039 Schnitt 2)')
on conflict (vocabulary, table_name, column_name) do nothing;

-- ---- 3 · Schreibwege
/** Wer eine Person als Zuständige einer Aufgabe eintragen darf: man selbst, der
    Owner des Speakers oder wer an der Edition Speaker-Lead oder Team ist. */
create or replace function speaker_activity_assignee_ok(p_person uuid, p_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(
    p_person = current_person_id()
    or exists (select 1 from speaker_profile sp where sp.id = p_profile_id and sp.owner_person_id = p_person)
    or exists (
      select 1 from role_assignment ra join speaker_profile sp on sp.id = p_profile_id
       where ra.person_id = p_person
         and ra.role in ('speaker_manager', 'admin', 'area_lead_speaker', 'programme_team')
         and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())
         and (ra.scope_type = 'global' or ra.edition_id = sp.edition_id)),
    false)
$$;
revoke execute on function speaker_activity_assignee_ok(uuid, uuid) from public, anon, authenticated;

/** Autor oder Team — wer einen Eintrag ändern oder löschen darf. */
create or replace function speaker_activity_edit_right(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce((
    select a.author_person_id = current_person_id() or is_speaker_team(sp.edition_id)
      from speaker_activity a join speaker_profile sp on sp.id = a.profile_id
     where a.id = p_id), false)
$$;
revoke execute on function speaker_activity_edit_right(uuid) from public, anon, authenticated;

create or replace function add_speaker_activity(p_profile_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id();
  v_kind text := nullif(btrim(p_data->>'kind'), '');
  v_body text := nullif(btrim(p_data->>'body'), '');
  v_due date;
  v_assignee uuid;
  v_id uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from speaker_profile where id = p_profile_id) then
    raise exception 'speaker_not_found' using errcode = 'P0002';
  end if;
  if not coalesce(can_manage_speaker(p_profile_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_kind is null or not is_vocab_key('speaker_activity_kind', v_kind) then
    raise exception 'invalid_activity_kind' using errcode = '22023', detail = coalesce(v_kind, 'null');
  end if;
  if v_body is null then raise exception 'body_required' using errcode = '22023'; end if;
  if length(v_body) > 2000 then raise exception 'text_too_long' using errcode = '22023'; end if;
  if v_kind = 'task' then
    v_due := nullif(p_data->>'due_on', '')::date;
    if v_due is null then raise exception 'due_required' using errcode = '22023'; end if;
    v_assignee := coalesce(nullif(p_data->>'assignee_person_id', '')::uuid, v_me);
    if not speaker_activity_assignee_ok(v_assignee, p_profile_id) then
      raise exception 'invalid_assignee' using errcode = '22023';
    end if;
  end if;
  insert into speaker_activity (profile_id, kind, body, occurred_at, due_on, assignee_person_id, author_person_id)
  values (p_profile_id, v_kind, v_body,
          coalesce(nullif(p_data->>'occurred_at', '')::timestamptz, now()),
          v_due, v_assignee, v_me)
  returning id into v_id;
  -- Das Audit nennt Eintrag und Art, nicht den Text — der steht in der Tabelle.
  perform log_audit('speaker.activity_add', 'speaker_profile', p_profile_id::text, null,
                    jsonb_build_object('activity_id', v_id, 'kind', v_kind));
  return v_id;
end $$;

create or replace function update_speaker_activity(p_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_a speaker_activity%rowtype; v_body text; v_due date; v_assignee uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_a from speaker_activity where id = p_id for update;
  if not found then raise exception 'activity_not_found' using errcode = 'P0002'; end if;
  if not (coalesce(can_manage_speaker(v_a.profile_id), false) and speaker_activity_edit_right(p_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_body := case when p_data ? 'body' then nullif(btrim(p_data->>'body'), '') else v_a.body end;
  if v_body is null then raise exception 'body_required' using errcode = '22023'; end if;
  if length(v_body) > 2000 then raise exception 'text_too_long' using errcode = '22023'; end if;
  if v_a.kind = 'task' then
    v_due := case when p_data ? 'due_on' then nullif(p_data->>'due_on', '')::date else v_a.due_on end;
    if v_due is null then raise exception 'due_required' using errcode = '22023'; end if;
    v_assignee := case when p_data ? 'assignee_person_id'
                       then coalesce(nullif(p_data->>'assignee_person_id', '')::uuid, current_person_id())
                       else v_a.assignee_person_id end;
    if v_assignee is distinct from v_a.assignee_person_id
       and not speaker_activity_assignee_ok(v_assignee, v_a.profile_id) then
      raise exception 'invalid_assignee' using errcode = '22023';
    end if;
  end if;
  update speaker_activity set
    body = v_body,
    occurred_at = case when p_data ? 'occurred_at'
                       then coalesce(nullif(p_data->>'occurred_at', '')::timestamptz, occurred_at)
                       else occurred_at end,
    due_on = v_due,
    assignee_person_id = v_assignee
  where id = p_id;
  perform log_audit('speaker.activity_update', 'speaker_profile', v_a.profile_id::text, null,
                    jsonb_build_object('activity_id', p_id));
  return p_id;
end $$;

create or replace function set_speaker_activity_done(p_id uuid, p_done boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_a speaker_activity%rowtype; v_owner uuid; v_ed uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_a from speaker_activity where id = p_id for update;
  if not found then raise exception 'activity_not_found' using errcode = 'P0002'; end if;
  select sp.owner_person_id, sp.edition_id into v_owner, v_ed from speaker_profile sp where sp.id = v_a.profile_id;
  if not (coalesce(can_manage_speaker(v_a.profile_id), false)
          and coalesce(v_a.author_person_id = v_me or v_a.assignee_person_id = v_me or v_owner = v_me
                       or is_speaker_team(v_ed), false)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_a.kind <> 'task' then raise exception 'not_a_task' using errcode = '22023'; end if;
  update speaker_activity
     set done_at = case when coalesce(p_done, false) then coalesce(done_at, now()) end,
         done_by = case when coalesce(p_done, false) then coalesce(done_by, v_me) end
   where id = p_id;
  perform log_audit('speaker.activity_done', 'speaker_profile', v_a.profile_id::text, null,
                    jsonb_build_object('activity_id', p_id, 'done', coalesce(p_done, false)));
  return p_id;
end $$;

create or replace function delete_speaker_activity(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_a speaker_activity%rowtype;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_a from speaker_activity where id = p_id for update;
  if not found then raise exception 'activity_not_found' using errcode = 'P0002'; end if;
  if not (coalesce(can_manage_speaker(v_a.profile_id), false) and speaker_activity_edit_right(p_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from speaker_activity where id = p_id;
  perform log_audit('speaker.activity_delete', 'speaker_profile', v_a.profile_id::text,
                    jsonb_build_object('activity_id', p_id, 'kind', v_a.kind), null);
end $$;

-- ---- 4 · Lesen
create or replace function speaker_activities(p_profile_id uuid)
 RETURNS TABLE(id uuid, kind text, body text, occurred_at timestamp with time zone, due_on date,
               assignee_person_id uuid, assignee_name text, done_at timestamp with time zone,
               author_person_id uuid, author_name text, can_edit boolean, can_complete boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_team boolean; v_owner uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not coalesce(can_manage_speaker(p_profile_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select is_speaker_team(sp.edition_id), sp.owner_person_id into v_team, v_owner
    from speaker_profile sp where sp.id = p_profile_id;
  return query
    select a.id, a.kind, a.body, a.occurred_at, a.due_on, a.assignee_person_id,
           (select nullif(btrim(coalesce(z.first_name, '') || ' ' || coalesce(z.last_name, '')), '') from person z where z.id = a.assignee_person_id),
           a.done_at, a.author_person_id,
           (select nullif(btrim(coalesce(w.first_name, '') || ' ' || coalesce(w.last_name, '')), '') from person w where w.id = a.author_person_id),
           coalesce(a.author_person_id = v_me or v_team, false),
           coalesce(a.kind = 'task' and (a.author_person_id = v_me or a.assignee_person_id = v_me or v_owner = v_me or v_team), false)
      from speaker_activity a
     where a.profile_id = p_profile_id
     order by (a.kind = 'task' and a.done_at is null) desc, a.due_on nulls last, a.occurred_at desc;
end $$;

create or replace function speaker_activity_overview(p_edition_id uuid)
 RETURNS TABLE(id uuid, profile_id uuid, speaker_name text, pipeline_status text, kind text, body text,
               occurred_at timestamp with time zone, due_on date, done_at timestamp with time zone,
               assignee_name text, author_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not coalesce(is_speaker_team(p_edition_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select a.id, a.profile_id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           sp.pipeline_status, a.kind, a.body, a.occurred_at, a.due_on, a.done_at,
           (select nullif(btrim(coalesce(z.first_name, '') || ' ' || coalesce(z.last_name, '')), '') from person z where z.id = a.assignee_person_id),
           (select nullif(btrim(coalesce(w.first_name, '') || ' ' || coalesce(w.last_name, '')), '') from person w where w.id = a.author_person_id)
      from speaker_activity a
      join speaker_profile sp on sp.id = a.profile_id
      join person p on p.id = sp.person_id
     where sp.edition_id = p_edition_id
       and p.deleted_at is null
     order by a.occurred_at desc
     limit 1000;
end $$;

-- ---- 5 · Pipeline: nächster Schritt, letzte Aktivität (Rückgabetyp wächst)
drop function if exists manager_speakers(uuid);
create function manager_speakers(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, person_id uuid, first_name text, last_name text, title text, email text, job_title text, organization_name text, speaker_type text, pipeline_status text, owner_person_id uuid, owner_name text, reception_eligible boolean, travel_costs_covered boolean, travel_costs_approved boolean, hospitality_status text, hotel_tier text, pass_type text, lounge_access boolean, invited_at timestamp with time zone, confirmed_at timestamp with time zone, declined_at timestamp with time zone, decline_reason text, assistant_name text, sessions jsonb, next_open jsonb, updated_at timestamp with time zone, internal_notes text, category text, topic_cluster text, topic_role text, priority text, recommended_format text, contact_via text, outreach_channel text, stage_candidates jsonb, open_tasks integer, next_task jsonb, last_activity_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not (has_role('speaker_manager') or has_role('admin') or has_role('area_lead_speaker') or has_role('programme_team')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select sp.id, sp.person_id, p.first_name, p.last_name, p.title,
           (select pe.email::text from person_email pe where pe.person_id = p.id and pe.is_primary),
           sp.job_title, sp.organization_name, sp.speaker_type, sp.pipeline_status,
           sp.owner_person_id, (select btrim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, '')) from person o where o.id = sp.owner_person_id),
           sp.reception_eligible, sp.travel_costs_covered, (sp.travel_costs_approved_at is not null),
           sp.hospitality_status, sp.hotel_tier, sp.pass_type, sp.lounge_access, sp.invited_at,
           sp.confirmed_at, sp.declined_at, sp.decline_reason,
           (select string_agg(x.name, ', ' order by x.name) from (
              select nullif(btrim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), '') as name
                from person a where a.id = sp.assistant_person_id
              union
              select nullif(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '')
                from speaker_contact c where c.profile_id = sp.id and c.has_access
            ) x where x.name is not null),
           coalesce((select jsonb_agg(jsonb_build_object('session_id', se.id, 'title_de', se.title_de, 'title_en', se.title_en,
                                                          'publish_status', se.publish_status, 'start_at', sl.start_at, 'stage_name', st.name)
                                       order by sl.start_at nulls last)
                     from session_speaker ss join session se on se.id = ss.session_id join event e on e.id = se.event_id
                     left join slot sl on sl.id = se.slot_id left join stage st on st.id = sl.stage_id
                     where ss.person_id = sp.person_id and (e.edition_id = sp.edition_id or e.id = sp.edition_id)), '[]'::jsonb),
           speaker_next_steps(sp.id)->'open',
           sp.updated_at, sp.internal_notes,
           -- LEAD-039: Einordnung und Bühnen in Frage.
           sp.category, sp.topic_cluster, sp.topic_role, sp.priority, sp.recommended_format,
           sp.contact_via, sp.outreach_channel,
           coalesce((select jsonb_agg(jsonb_build_object('stage_id', st.id, 'name', st.name)
                                      order by st.sort_order, st.name)
                       from speaker_stage_candidate c join stage st on st.id = c.stage_id
                      where c.profile_id = sp.id), '[]'::jsonb),
           -- LEAD-039 Schnitt 2: Verlauf — offene Aufgaben, die früheste als
           -- nächster Schritt, und wann zuletzt etwas geschah (eine Aufgabe zählt
           -- erst, wenn sie erledigt ist).
           (select count(*)::integer from speaker_activity a
             where a.profile_id = sp.id and a.kind = 'task' and a.done_at is null),
           (select jsonb_build_object('id', a.id, 'body', a.body, 'due_on', a.due_on,
                                      'assignee_person_id', a.assignee_person_id,
                                      'assignee_name', (select nullif(btrim(coalesce(z.first_name, '') || ' ' || coalesce(z.last_name, '')), '')
                                                          from person z where z.id = a.assignee_person_id))
              from speaker_activity a
             where a.profile_id = sp.id and a.kind = 'task' and a.done_at is null
             order by a.due_on, a.created_at
             limit 1),
           (select max(case when a.kind = 'task' then a.done_at else a.occurred_at end)
              from speaker_activity a where a.profile_id = sp.id)
    from speaker_profile sp
    join person p on p.id = sp.person_id
    left join vocab_term v on v.vocabulary = 'speaker_pipeline' and v.key = sp.pipeline_status
    where (p_edition_id is null or sp.edition_id = p_edition_id)
      and p.deleted_at is null
      and can_manage_speaker(sp.id)
    order by v.sort_order nulls last, p.last_name nulls last, p.first_name nulls last;
end $$;

-- ---- 6 · Profil löschen
create or replace function anonymize_person(p_person_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_hash text; v_profile uuid[];
begin
  if p_person_id is null then raise exception 'person_not_found' using errcode = 'P0002'; end if;
  perform log_audit('profile.delete', 'person', p_person_id::text, null, null);

  select array_agg(sp.id) into v_profile from speaker_profile sp where sp.person_id = p_person_id;
  v_profile := coalesce(v_profile, '{}');

  -- 1 · Sperrliste. Der Hash bleibt, die Adresse geht.
  insert into suppression (email_hash, reason)
    select email_hash(email::text), 'profile_deleted' from person_email where person_id = p_person_id
  on conflict (email_hash) do nothing;
  select email_hash(pe.email::text) into v_hash
    from person_email pe where pe.person_id = p_person_id and pe.is_primary;

  -- 2 · Dateien zum Wegräumen anmelden, **bevor** die Zeilen fallen: danach
  --     wüsste niemand mehr, welche Pfade gemeint waren.
  insert into storage_purge_queue (bucket, path)
    select 'speaker-assets', sa.storage_path from speaker_asset sa where sa.profile_id = any (v_profile)
  on conflict (bucket, path) do nothing;
  -- Porträt aus dem Teilnehmer-Profil (TAL-012).
  insert into storage_purge_queue (bucket, path)
    select 'person-photos', p.photo_path from person p
     where p.id = p_person_id and p.photo_path is not null
  on conflict (bucket, path) do nothing;
  -- Lebenslauf aus dem Teilnehmer-Profil (TAL-013, B3).
  insert into storage_purge_queue (bucket, path)
    select 'person-cv', p.cv_path from person p
     where p.id = p_person_id and p.cv_path is not null
  on conflict (bucket, path) do nothing;

  -- 3 · Zeilen, die ohne die Person keinen Sinn mehr haben.
  delete from person_interest            where person_id = p_person_id;
  delete from person_acquisition_channel where person_id = p_person_id;
  delete from person_language            where person_id = p_person_id;
  delete from role_assignment            where person_id = p_person_id;
  -- Ansprechperson einer Organisation kann nur sein, wen es gibt.
  delete from org_membership             where person_id = p_person_id;
  delete from speaker_asset  where profile_id = any (v_profile);
  -- Anreise ist reine Logistik eines vergangenen Termins: Flugnummer, Ankunft,
  -- Notiz. Nichts davon trägt eine Zahl, die später jemand braucht.
  delete from speaker_travel where profile_id = any (v_profile);

  -- 4 · Die Person selbst. Grobe Merkmale bleiben für die Statistik
  --     (career_level, study_field, country, tier, occupation_status) — sie
  --     beschreiben eine Gruppe, keinen Menschen. Freitext, Kontaktdaten und
  --     alles nach Art. 9 DSGVO (Ernährung, Geschlecht) fällt weg.
  update person set
    first_name = null, last_name = null, birthdate = null, phone = null, phone_e164 = null,
    linkedin_url = null, linkedin_normalized = null,
    employer_name = null, university = null, title = null, city = null,
    nationality = null, invite_code = null, auth_user_id = null,
    gender = null, diet = null, diet_note = null, photo_path = null,
    job_title = null, study_program_label = null, cv_path = null,
    salutation_de = null, salutation_en = null, self_assessment = null,
    deleted_at = now()
  where id = p_person_id;

  delete from person_email where person_id = p_person_id and not is_primary;
  update person_email
     set email = ('deleted+' || p_person_id::text || '@anonym.invalid')::citext, verified = false
   where person_id = p_person_id and is_primary;

  -- 5 · Mail-Protokoll: die Zeile bleibt als Zahl (wie viele Einladungen gingen
  --     raus), die Adresse wird zum Hash und die eingesetzten Angaben — dort
  --     steht der Name im Klartext — verschwinden.
  update mail_log
     set to_email = ('deleted:' || coalesce(v_hash, p_person_id::text))::citext,
         meta = coalesce(meta, '{}'::jsonb) - 'vars'
   where person_id = p_person_id;

  -- 6 · Freitexte und Fremdschlüssel in allen übrigen Tabellen mit `person_id`.
  --     Was bleibt, ist jeweils der zählbare Teil: Status, Typ, Zeitpunkt.
  update application      set answers = '{}'::jsonb where person_id = p_person_id;
  update hack_application set motivation = null, team_pref = null, note = null where person_id = p_person_id;
  -- Der Einwilligungsnachweis bleibt — er ist der Beleg, dass wir durften, was
  -- wir getan haben. Das Gerät, von dem sie kam, ist dafür ohne Bedeutung.
  update consent_record   set user_agent = null where person_id = p_person_id;
  -- Fremdsystem-Verweise zeigen auf Kopien, die dort noch den Namen tragen;
  -- der Verweis selbst darf nicht bleiben (siehe Kopf, vivenu).
  update registration     set external_ref = null, external_ids = '{}'::jsonb where person_id = p_person_id;
  update shift_assignment set decline_reason = null where person_id = p_person_id;
  update volunteer_profile set availability = null, buddy_note = null, notes_internal = null,
                               decision_note = null, coupon_error = null, buddy_person_id = null
   where person_id = p_person_id;
  update ticket set holder_email = null, holder_first_name = null, holder_last_name = null,
                    holder_company = null, holder_position = null, buyer_email = null,
                    team_note = null, extra_fields = '{}'::jsonb
   where person_id = p_person_id;

  -- 7 · Speaker-Profil und was daran hängt.
  update speaker_profile set
    bio_short_de = null, bio_short_en = null, bio_long_de = null, bio_long_en = null,
    job_title = null, organization_name = null, internal_notes = null,
    -- `tech_rider` und `socials` sind `not null default '{}'` — hier gehoert der
    -- leere Wert hin, nicht `null` (Probelauf der Architektur-Session, 23502).
    tech_rider = '{}'::jsonb, socials = '{}'::jsonb,
    decline_reason = null, photo_asset_id = null,
    -- Der Kontakt ohne Portalzugang (0127) gehoert einer **dritten** Person:
    -- Agentur, Office, Management. Sie hat hier nie ein Konto gehabt und kann
    -- die Loeschung auch nicht selbst verlangen — deshalb faellt sie mit dem
    -- Profil, das sie eingetragen hat. Keine Sperrliste: die Adresse stand nie
    -- in einem Verteiler, das Portal kann an sie gar nicht senden (`queue_mail`
    -- braucht eine `person_id`, und eine hat sie nicht).
    contact_first_name = null, contact_last_name = null, contact_email = null,
    contact_phone = null, contact_kind = null, contact_consent_at = null,
    -- LEAD-039: die Einordnung ist eine Einschätzung über die Person, und
    -- `contact_via` nennt, über wen sie läuft.
    category = null, topic_cluster = null, topic_role = null, priority = null,
    recommended_format = null, contact_via = null, outreach_channel = null
   where person_id = p_person_id;
  delete from speaker_stage_candidate where profile_id = any (v_profile);
  -- LEAD-039 Schnitt 2: der Verlauf über die Person geht mit. Einträge, die sie
  -- selbst über andere geschrieben hat, bleiben; sie zeigen dann den
  -- anonymisierten Namen.
  delete from speaker_activity where profile_id = any (v_profile);
  -- Titel und Beschreibung sind der veröffentlichte Programmpunkt und gehören
  -- zur Veranstaltung, nicht zur Person; die interne Notiz nicht.
  update session_submission  set notes = null      where speaker_profile_id = any (v_profile);
  update hospitality_booking set details = '{}'::jsonb, team_note = null where profile_id = any (v_profile);

  -- 8 · Reisekosten. Der Antrag bleibt als Buchung (§147 AO), die Bankdaten
  --     nicht: bezahlt ist bezahlt, und ein offener Antrag ist eine Hürde, die
  --     bis hierher gar nicht kommt.
  delete from vault.secrets
   where id in (select ec.bank_secret_id from expense_claim ec
                 where ec.profile_id = any (v_profile) and ec.bank_secret_id is not null);
  update expense_claim set bank_secret_id = null, bank_masked = null, bank_holder = null,
                           review_note = null
   where profile_id = any (v_profile);

  -- 9 · Der selbst geschriebene Grund ist Freitext von dieser Person und darf
  --     ihre Löschung nicht überleben. Status, Hürden und Zeitpunkt bleiben —
  --     das ist der Nachweis, und der trägt keinen Personenbezug.
  update profile_deletion_request set reason = null where person_id = p_person_id;
end $$;

select harden_definer_functions();
