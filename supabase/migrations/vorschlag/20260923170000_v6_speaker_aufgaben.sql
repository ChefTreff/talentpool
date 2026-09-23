-- 0149 · Welle 6 · Aufgaben, die der Speaker selbst abhakt (SPK-024)
--
-- Nummer 0149 von der Architektur-Session zugeteilt (23.09.). Vorschlag der
-- Build-Session Speaker-Domäne; Anwenden, Umbenennen und der Eintrag ins
-- Entscheidungslog gehören ihr.
--
-- Anlass: Konrad am 23.09. — „Es wird auch Punkte geben, die sie selbst
-- abhaken können müssen."
--
-- **Abgrenzung zu `next_steps` (von der Architektur-Session bestätigt):** die
-- Checkliste auf der Übersicht führt heute abgeleitete Schritte — ob ein Foto
-- liegt, ob die Einwilligung steht, weiss das Portal selbst. Solche Schritte
-- bekommen **keinen** Selbst-Haken: ein Häkchen neben „Foto hochladen" wäre
-- eine zweite Wahrheit neben dem Bucket, und die erste, die auseinanderläuft.
-- Diese Tabelle ist ausschliesslich für Erledigungen da, die das Portal nicht
-- beobachten kann („Ich habe mich beim Hotel gemeldet", „Vertrag
-- unterschrieben zurückgeschickt") — deshalb steht die Aufgabe in einer
-- eigenen Tabelle und nicht als weiterer Schlüssel in `next_steps`.
--
-- **Gepflegt wird im Admin** (`/admin/speaker/aufgaben`, „Admin zuerst"), je
-- Edition. Der Speaker sieht nur aktive Aufgaben seiner eigenen Edition.
--
-- **Gelöscht wird eine Aufgabe nur, solange niemand sie abgehakt hat.** Sonst
-- verschwände mit der Zeile auch die Auskunft, wer wann gesagt hat „erledigt";
-- danach hilft nur noch `is_active = false` — die Aufgabe verschwindet aus dem
-- Portal, die Haken bleiben nachlesbar.
--
-- **Keine Grants auf den Tabellen.** Beide tragen RLS ohne Policy; gelesen und
-- geschrieben wird ausschliesslich über die Funktionen hier, die vorher die
-- Zugehörigkeit prüfen.
--
-- Fehlerschlüssel: 28000 ohne Login · 42501 ohne Recht ·
-- P0002 `task_not_found` / `speaker_not_found` · P0001 `task_inactive` ·
-- P0001 `task_wrong_edition` · P0001 `task_has_ticks` ·
-- 22023 `task_key_required` / `task_label_required`.

set search_path = public, extensions;

create table if not exists speaker_task (
  id             uuid primary key default gen_random_uuid(),
  edition_id     uuid not null references event(id) on delete cascade,
  key            text not null,
  label_de       text not null,
  label_en       text not null,
  description_de text,
  description_en text,
  -- Optionaler Bezug auf `deadline.key`: die Frist wird dort gepflegt, nicht
  -- hier zweimal. Bewusst **kein** Fremdschlüssel — eine Aufgabe darf schon
  -- stehen, bevor jemand die Frist anlegt, und soll nicht mit ihr fallen.
  deadline_key   text,
  sort_order     integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint speaker_task_key_chk check (btrim(key) <> ''),
  constraint speaker_task_label_chk check (btrim(label_de) <> '' and btrim(label_en) <> '')
);

comment on table speaker_task is
  'Aufgaben, die der Speaker selbst abhakt (SPK-024, 0149) — je Edition, im Admin gepflegt. Nur für Erledigungen, die das Portal nicht selbst beobachten kann; Abgeleitetes bleibt in `next_steps`.';
comment on column speaker_task.deadline_key is
  'Verweist auf `deadline.key` derselben Edition, ohne Fremdschlüssel: die Aufgabe darf vor der Frist da sein und soll nicht mit ihr verschwinden.';

create unique index if not exists speaker_task_edition_key_uidx
  on speaker_task (edition_id, key);

create table if not exists speaker_task_tick (
  profile_id uuid not null references speaker_profile(id) on delete cascade,
  task_id    uuid not null references speaker_task(id) on delete cascade,
  done_at    timestamptz not null default now(),
  -- Wer den Haken gesetzt hat — die Speakerin oder ihre Assistenz. Ohne das
  -- stünde später nur da, dass jemand es war.
  done_by    uuid not null references person(id),
  primary key (profile_id, task_id)
);

comment on table speaker_task_tick is
  'Ein Haken je Speaker und Aufgabe (0149). Der Haken ist eine Aussage der Speakerin, kein beobachteter Zustand — deshalb steht dabei, wer ihn wann gesetzt hat.';

alter table speaker_task enable row level security;
alter table speaker_task_tick enable row level security;
revoke all on speaker_task from anon, authenticated;
revoke all on speaker_task_tick from anon, authenticated;

-- ---------------------------------------------------------- Speaker: lesen
/**
 * Die eigenen Aufgaben mit ihrem Haken.
 *
 * Eigenes Profil oder Assistenz — `coalesce`, weil der Vergleich mit NULL
 * weder wahr noch falsch ist und `if not NULL` dann nicht auslöst (Lehre aus
 * 0118). Aktive Aufgaben der eigenen Edition, in der gepflegten Reihenfolge.
 */
create or replace function my_speaker_tasks(p_profile_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id();
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile
   where id = coalesce(p_profile_id, my_speaker_profile_id(null));
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce((v_sp.person_id = v_me or v_sp.assistant_person_id = v_me
                   or can_manage_speaker(v_sp.id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', st.id, 'key', st.key,
             'label_de', st.label_de, 'label_en', st.label_en,
             'description_de', st.description_de, 'description_en', st.description_en,
             'deadline_key', st.deadline_key,
             'done_at', tk.done_at)
           order by st.sort_order, st.key)
      from speaker_task st
      left join speaker_task_tick tk on tk.task_id = st.id and tk.profile_id = v_sp.id
     where st.edition_id = v_sp.edition_id and st.is_active), '[]'::jsonb);
end $$;

revoke all on function my_speaker_tasks(uuid) from public, anon;
grant execute on function my_speaker_tasks(uuid) to authenticated;

-- -------------------------------------------------------- Speaker: abhaken
/**
 * Haken setzen oder wieder wegnehmen.
 *
 * Abgewiesen werden eine stillgelegte Aufgabe und eine aus einer fremden
 * Edition — sonst könnte jemand mit einer geratenen Kennung Haken setzen, die
 * im eigenen Portal nie auftauchen.
 */
create or replace function set_speaker_task_tick(
  p_task_id uuid, p_done boolean, p_profile_id uuid default null)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_task speaker_task%rowtype;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile
   where id = coalesce(p_profile_id, my_speaker_profile_id(null));
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce((v_sp.person_id = v_me or v_sp.assistant_person_id = v_me), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_task from speaker_task where id = p_task_id;
  if not found then raise exception 'task_not_found' using errcode = 'P0002'; end if;
  if v_task.edition_id <> v_sp.edition_id then
    raise exception 'task_wrong_edition' using errcode = 'P0001';
  end if;
  if not v_task.is_active then
    raise exception 'task_inactive' using errcode = 'P0001';
  end if;

  if p_done then
    insert into speaker_task_tick (profile_id, task_id, done_by)
    values (v_sp.id, p_task_id, v_me)
    on conflict (profile_id, task_id) do nothing;
  else
    delete from speaker_task_tick where profile_id = v_sp.id and task_id = p_task_id;
  end if;
end $$;

revoke all on function set_speaker_task_tick(uuid, boolean, uuid) from public, anon;
grant execute on function set_speaker_task_tick(uuid, boolean, uuid) to authenticated;

-- ------------------------------------------------------------ Admin: Liste
/**
 * Die Aufgaben einer Edition, mit der Zahl der gesetzten Haken.
 *
 * Die Zahl entscheidet im Admin, ob „Löschen" überhaupt angeboten wird —
 * sonst liefe man in `task_has_ticks` und wüsste erst hinterher, warum.
 */
create or replace function speaker_tasks_admin(p_edition_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_speaker_team(p_edition_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', st.id, 'edition_id', st.edition_id, 'key', st.key,
             'label_de', st.label_de, 'label_en', st.label_en,
             'description_de', st.description_de, 'description_en', st.description_en,
             'deadline_key', st.deadline_key, 'sort_order', st.sort_order,
             'is_active', st.is_active,
             'tick_count', (select count(*) from speaker_task_tick tk where tk.task_id = st.id))
           order by st.sort_order, st.key)
      from speaker_task st
     where st.edition_id = p_edition_id), '[]'::jsonb);
end $$;

revoke all on function speaker_tasks_admin(uuid) from public, anon;
grant execute on function speaker_tasks_admin(uuid) to authenticated;

-- ------------------------------------------------------------ Admin: Pflege
/** Aufgabe anlegen oder ändern; der Schlüssel ist je Edition eindeutig. */
create or replace function upsert_speaker_task(p_data jsonb)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_ed uuid := (p_data->>'edition_id')::uuid; v_key text := btrim(coalesce(p_data->>'key', ''));
begin
  if not is_speaker_team(v_ed) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_key = '' then raise exception 'task_key_required' using errcode = '22023'; end if;
  if btrim(coalesce(p_data->>'label_de', '')) = '' or btrim(coalesce(p_data->>'label_en', '')) = '' then
    raise exception 'task_label_required' using errcode = '22023';
  end if;

  insert into speaker_task (edition_id, key, label_de, label_en, description_de, description_en,
                            deadline_key, sort_order, is_active)
  values (v_ed, v_key, p_data->>'label_de', p_data->>'label_en',
          nullif(btrim(coalesce(p_data->>'description_de', '')), ''),
          nullif(btrim(coalesce(p_data->>'description_en', '')), ''),
          nullif(btrim(coalesce(p_data->>'deadline_key', '')), ''),
          coalesce(nullif(p_data->>'sort_order', '')::integer, 0),
          coalesce((p_data->>'is_active')::boolean, true))
  on conflict (edition_id, key) do update set
    label_de = excluded.label_de, label_en = excluded.label_en,
    description_de = excluded.description_de, description_en = excluded.description_en,
    deadline_key = excluded.deadline_key, sort_order = excluded.sort_order,
    is_active = excluded.is_active, updated_at = now()
  returning id into v_id;

  perform log_audit('speaker_task.upsert', 'speaker_task', v_id::text, null, p_data);
  return v_id;
end $$;

revoke all on function upsert_speaker_task(jsonb) from public, anon;
grant execute on function upsert_speaker_task(jsonb) to authenticated;

/**
 * Aufgabe löschen — **nur solange niemand sie abgehakt hat.**
 *
 * Danach bleibt `is_active = false`: die Aufgabe verschwindet aus dem Portal,
 * die Haken bleiben nachlesbar. Ein `on delete cascade` würde sie stillschweigend
 * mitnehmen, und genau das soll hier nicht passieren.
 */
create or replace function delete_speaker_task(p_task_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_task speaker_task%rowtype; v_n integer;
begin
  select * into v_task from speaker_task where id = p_task_id;
  if not found then raise exception 'task_not_found' using errcode = 'P0002'; end if;
  if not is_speaker_team(v_task.edition_id) then raise exception 'not allowed' using errcode = '42501'; end if;

  select count(*) into v_n from speaker_task_tick where task_id = p_task_id;
  if v_n > 0 then
    raise exception 'task_has_ticks' using errcode = 'P0001', detail = v_n::text;
  end if;

  delete from speaker_task where id = p_task_id;
  perform log_audit('speaker_task.delete', 'speaker_task', p_task_id::text,
                    jsonb_build_object('key', v_task.key), null);
end $$;

revoke all on function delete_speaker_task(uuid) from public, anon;
grant execute on function delete_speaker_task(uuid) to authenticated;

select harden_definer_functions();
