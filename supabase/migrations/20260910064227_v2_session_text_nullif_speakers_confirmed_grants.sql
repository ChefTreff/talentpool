-- =============================================================================
-- 0018 · v2 Programm-Editor: Leertexte werden NULL, Speaker-Bestätigung bleibt
--        erhalten, Tabellen-Grants gehärtet
-- Befunde aus dem zweiten Review-Durchgang zu PR #2 (10.09.2026):
--   1) upsert_session speicherte '' wörtlich; session_publish_check prüft „is null" —
--      die Pflichtfeldregel beim Veröffentlichen (Titel DE+EN, Beschreibung) ließ sich
--      so mit Leerstrings umgehen. Neu: Schlüssel vorhanden + leer/Whitespace ⇒ NULL,
--      Schlüssel fehlt ⇒ Wert bleibt (Teilupdate wie bisher).
--   2) session_publish_check normalisiert die vier Textfelder vor jeder Prüfung —
--      damit gilt die Regel für jeden Schreibweg, nicht nur für die RPC.
--   3) set_session_speakers ersetzt die Zuordnung komplett; fehlte 'confirmed' im JSON,
--      fiel eine bestehende Bestätigung auf false zurück. Neu: fehlt der Schlüssel,
--      bleibt der bisherige Wert der Person erhalten.
--   4) harden_definer_functions() entzieht anon/authenticated zusätzlich TRUNCATE,
--      REFERENCES und TRIGGER auf allen Tabellen in public (Supabase-Standardgrants,
--      nicht RLS-gesteuert, über die API nicht erreichbar — trotzdem weg) und setzt die
--      Default-Privilegien für neue Tabellen des Eigentümers postgres entsprechend.
-- =============================================================================
set search_path = public, extensions;

-- 1) + 2) Veröffentlichungsregel: Leertexte zählen wie NULL --------------------
create or replace function session_publish_check() returns trigger
language plpgsql as $$
begin
  new.title_de       := nullif(btrim(new.title_de), '');
  new.title_en       := nullif(btrim(new.title_en), '');
  new.description_de := nullif(btrim(new.description_de), '');
  new.description_en := nullif(btrim(new.description_en), '');
  if new.publish_status = 'published' then
    if new.slot_id is null then
      raise exception 'publish requires a slot (stage/room)' using errcode = '23514';
    end if;
    if new.title_de is null or new.title_en is null then
      raise exception 'publish requires title_de and title_en' using errcode = '23514';
    end if;
    if coalesce(new.description_de, new.description_en) is null then
      raise exception 'publish requires a description' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

-- 1) upsert_session: Textfelder „Schlüssel da ⇒ setzen (leer ⇒ NULL), sonst behalten"
create or replace function upsert_session(p_data jsonb) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id    uuid := nullif(p_data->>'id', '')::uuid;
  v_event uuid := nullif(p_data->>'event_id', '')::uuid;
  v_pid   uuid := current_person_id();
begin
  if v_pid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if v_id is null then
    if v_event is null then
      raise exception 'event_id required' using errcode = '22023';
    end if;
    if not (is_programme_editor(v_event) or has_role('speaker_manager') or has_role('standbuehne_editor')) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    insert into session (
      event_id, title_de, title_en, description_de, description_en,
      format, language, access_mode, eligibility_rule, capacity, ticket_required,
      application_deadline, confirm_by_hours, host_org_id, track_id, moderation_person_id,
      tags, created_by, updated_by
    ) values (
      v_event,
      nullif(btrim(p_data->>'title_de'), ''),
      nullif(btrim(p_data->>'title_en'), ''),
      nullif(btrim(p_data->>'description_de'), ''),
      nullif(btrim(p_data->>'description_en'), ''),
      coalesce(p_data->>'format', 'keynote'),
      coalesce(p_data->>'language', 'de'),
      coalesce(p_data->>'access_mode', 'open'),
      p_data->'eligibility_rule',
      nullif(p_data->>'capacity', '')::integer,
      coalesce((p_data->>'ticket_required')::boolean, true),
      nullif(p_data->>'application_deadline', '')::timestamptz,
      coalesce(nullif(p_data->>'confirm_by_hours', '')::integer, 72),
      nullif(p_data->>'host_org_id', '')::uuid,
      nullif(p_data->>'track_id', '')::uuid,
      nullif(p_data->>'moderation_person_id', '')::uuid,
      coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_data->'tags', '[]'::jsonb)) x), '{}'),
      v_pid, v_pid
    ) returning id into v_id;
    perform log_audit('session.create', 'session', v_id::text, null, p_data);
    return v_id;
  end if;

  if not can_edit_session(v_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update session set
    title_de       = case when p_data ? 'title_de'       then nullif(btrim(p_data->>'title_de'), '')       else title_de       end,
    title_en       = case when p_data ? 'title_en'       then nullif(btrim(p_data->>'title_en'), '')       else title_en       end,
    description_de = case when p_data ? 'description_de' then nullif(btrim(p_data->>'description_de'), '') else description_de end,
    description_en = case when p_data ? 'description_en' then nullif(btrim(p_data->>'description_en'), '') else description_en end,
    format         = coalesce(p_data->>'format', format),
    language       = coalesce(p_data->>'language', language),
    access_mode    = coalesce(p_data->>'access_mode', access_mode),
    eligibility_rule = coalesce(p_data->'eligibility_rule', eligibility_rule),
    capacity       = case when p_data ? 'capacity' then nullif(p_data->>'capacity', '')::integer else capacity end,
    ticket_required = coalesce((p_data->>'ticket_required')::boolean, ticket_required),
    application_deadline = case when p_data ? 'application_deadline' then nullif(p_data->>'application_deadline', '')::timestamptz else application_deadline end,
    confirm_by_hours = coalesce(nullif(p_data->>'confirm_by_hours', '')::integer, confirm_by_hours),
    host_org_id    = case when p_data ? 'host_org_id' then nullif(p_data->>'host_org_id', '')::uuid else host_org_id end,
    track_id       = case when p_data ? 'track_id' then nullif(p_data->>'track_id', '')::uuid else track_id end,
    moderation_person_id = case when p_data ? 'moderation_person_id' then nullif(p_data->>'moderation_person_id', '')::uuid else moderation_person_id end,
    tags           = case when p_data ? 'tags' then coalesce((select array_agg(x) from jsonb_array_elements_text(p_data->'tags') x), '{}') else tags end,
    updated_by     = v_pid
  where id = v_id;
  perform log_audit('session.update', 'session', v_id::text, null, p_data);
  return v_id;
end $$;

-- 3) set_session_speakers: Bestätigung bleibt, wenn der Aufrufer sie nicht mitschickt
create or replace function set_session_speakers(p_session_id uuid, p_speakers jsonb) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_n   integer;
  v_old jsonb;
begin
  if not can_edit_session(p_session_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(jsonb_object_agg(person_id::text, confirmed), '{}'::jsonb)
    into v_old
    from session_speaker where session_id = p_session_id;
  delete from session_speaker where session_id = p_session_id;
  insert into session_speaker (session_id, person_id, role, sort_order, confirmed)
  select p_session_id,
         (x->>'person_id')::uuid,
         coalesce(x->>'role', 'speaker'),
         coalesce((x->>'sort_order')::integer, ord::integer),
         coalesce((x->>'confirmed')::boolean, (v_old->>(x->>'person_id'))::boolean, false)
  from jsonb_array_elements(coalesce(p_speakers, '[]'::jsonb)) with ordinality as t(x, ord);
  get diagnostics v_n = row_count;
  perform log_audit('session.speakers', 'session', p_session_id::text, null, p_speakers);
  return v_n;
end $$;

-- 4) Härtung erweitert: Tabellen-Grants -----------------------------------------
create or replace function harden_definer_functions() returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare
  r record;
  n integer := 0;
begin
  -- SECURITY-DEFINER-Funktionen: anon/public verlieren EXECUTE
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    n := n + 1;
  end loop;
  -- search_path pinnen, wo er fehlt
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prokind = 'f'
      and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
  loop
    execute format('alter function %s set search_path = public, extensions', r.sig);
  end loop;
  execute 'grant execute on all functions in schema public to service_role';
  -- Tabellen: Privilegien, die RLS nicht steuert, gehören nicht zu API-Rollen
  for r in
    select c.oid::regclass as tbl
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('revoke truncate, references, trigger on table %s from anon, authenticated', r.tbl);
  end loop;
  execute 'alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from anon, authenticated';
  return n;
end $$;

select harden_definer_functions();
