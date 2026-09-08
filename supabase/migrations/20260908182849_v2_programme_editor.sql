-- =============================================================================
-- 0015 · v2 Programm-Editor-Backend (Welle 1 A4)
--   can_edit_session() · session_speakers_public() · View programme_board ·
--   RPCs upsert_session, set_session_speakers, attach_session_to_slot,
--   detach_session, publish_session, unpublish_session
-- Rechte: Programm-Team/Admin (Edition oder global) bearbeiten alles;
-- Speaker-Manager und Standbühnen-Editoren nur Sessions auf Slots ihres Scopes
-- sowie Backlog-Sessions, die sie selbst angelegt haben.
-- Veröffentlichen prüft zusätzlich zur Trigger-Regel (Slot, Titel DE+EN,
-- Beschreibung) mindestens einen Speaker bei Inhaltsformaten.
-- =============================================================================
set search_path = public, extensions;

alter table session add column if not exists created_by uuid references person (id) on delete set null;
alter table session add column if not exists updated_by uuid references person (id) on delete set null;

-- === Rechte ================================================================
create or replace function is_programme_editor(p_event_id uuid) returns boolean
  language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1
    from event ev
    join active_roles() ra on true
    where ev.id = p_event_id
      and (
           (ra.role in ('admin','programme_team') and ra.scope_type = 'global')
        or (ra.role in ('admin','programme_team') and ra.scope_type = 'edition'
            and ra.edition_id in (ev.id, ev.edition_id))
      )
  )
$$;

create or replace function can_edit_session(p_session_id uuid) returns boolean
  language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1
    from session se
    where se.id = p_session_id
      and (
           is_programme_editor(se.event_id)
        or (se.slot_id is not null and can_edit_slot(se.slot_id))
        or (se.slot_id is null and se.created_by = current_person_id()
            and (has_role('speaker_manager') or has_role('standbuehne_editor')))
      )
  )
$$;

-- === Speaker-Namen für sichtbare Sessions (person-RLS wird gezielt umgangen) ==
create or replace function session_speakers_public(p_session_id uuid) returns jsonb
  language sql stable security definer set search_path = public, extensions as $$
  select case when is_session_visible(p_session_id) then coalesce((
    select jsonb_agg(jsonb_build_object(
             'person_id', ss.person_id,
             'role', ss.role,
             'first_name', p.first_name,
             'last_name', p.last_name,
             'employer_name', p.employer_name,
             'confirmed', ss.confirmed)
           order by ss.sort_order, p.last_name)
    from session_speaker ss
    join person p on p.id = ss.person_id
    where ss.session_id = p_session_id), '[]'::jsonb)
  else '[]'::jsonb end
$$;

-- === View programme_board: ein Tag, alle Bühnen, Slots mit Session ==========
create or replace view programme_board with (security_invoker = true) as
  select
    sl.id            as slot_id,
    sl.stage_id,
    st.name          as stage_name,
    st.slug          as stage_slug,
    st.type          as stage_type,
    st.room,
    st.sort_order    as stage_sort,
    st.changeover_min,
    st.default_duration_min,
    sl.event_day_id,
    ed.day_date,
    ed.event_id,
    sl.start_at,
    sl.end_at,
    sl.slot_type,
    sl.status        as slot_status,
    sl.sort_order    as slot_sort,
    se.id            as session_id,
    se.title_de,
    se.title_en,
    se.format,
    se.language,
    se.access_mode,
    se.publish_status,
    se.capacity,
    se.host_org_id,
    se.track_id,
    session_speakers_public(se.id) as speakers,
    can_edit_slot(sl.id) as can_edit
  from slot sl
  join stage st     on st.id = sl.stage_id
  join event_day ed on ed.id = sl.event_day_id
  left join session se on se.slot_id = sl.id;
comment on view programme_board is 'Board-Sicht je Tag: Slots × Bühnen mit Session und Speakern; can_edit für den Aufrufer.';

-- Backlog: Sessions ohne Slot (für die Seitenleiste)
create or replace view programme_backlog with (security_invoker = true) as
  select se.id as session_id, se.event_id, se.title_de, se.title_en, se.format, se.language,
         se.access_mode, se.publish_status, se.host_org_id, se.created_by, se.created_at,
         session_speakers_public(se.id) as speakers,
         can_edit_session(se.id) as can_edit
  from session se
  where se.slot_id is null;
comment on view programme_backlog is 'Sessions ohne Slot (Backlog-Leiste des Boards).';

-- === RPC: upsert_session ===================================================
-- p_data: {id?, event_id, title_de, title_en, description_de, description_en, format,
--          language, access_mode, eligibility_rule, capacity, ticket_required,
--          application_deadline, confirm_by_hours, host_org_id, track_id,
--          moderation_person_id, tags}
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
      event_id, title_de, title_en, description_de, description_en, format, language, access_mode,
      eligibility_rule, capacity, ticket_required, application_deadline, confirm_by_hours,
      host_org_id, track_id, moderation_person_id, tags, created_by, updated_by
    ) values (
      v_event,
      p_data->>'title_de', p_data->>'title_en', p_data->>'description_de', p_data->>'description_en',
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
    title_de             = coalesce(p_data->>'title_de', title_de),
    title_en             = coalesce(p_data->>'title_en', title_en),
    description_de       = coalesce(p_data->>'description_de', description_de),
    description_en       = coalesce(p_data->>'description_en', description_en),
    format               = coalesce(p_data->>'format', format),
    language             = coalesce(p_data->>'language', language),
    access_mode          = coalesce(p_data->>'access_mode', access_mode),
    eligibility_rule     = coalesce(p_data->'eligibility_rule', eligibility_rule),
    capacity             = case when p_data ? 'capacity' then nullif(p_data->>'capacity', '')::integer else capacity end,
    ticket_required      = coalesce((p_data->>'ticket_required')::boolean, ticket_required),
    application_deadline = case when p_data ? 'application_deadline' then nullif(p_data->>'application_deadline', '')::timestamptz else application_deadline end,
    confirm_by_hours     = coalesce(nullif(p_data->>'confirm_by_hours', '')::integer, confirm_by_hours),
    host_org_id          = case when p_data ? 'host_org_id' then nullif(p_data->>'host_org_id', '')::uuid else host_org_id end,
    track_id             = case when p_data ? 'track_id' then nullif(p_data->>'track_id', '')::uuid else track_id end,
    moderation_person_id = case when p_data ? 'moderation_person_id' then nullif(p_data->>'moderation_person_id', '')::uuid else moderation_person_id end,
    tags                 = case when p_data ? 'tags' then coalesce((select array_agg(x) from jsonb_array_elements_text(p_data->'tags') x), '{}') else tags end,
    updated_by           = v_pid
  where id = v_id;
  perform log_audit('session.update', 'session', v_id::text, null, p_data);
  return v_id;
end $$;

-- === RPC: set_session_speakers ============================================
-- p_speakers: [{person_id, role?, sort_order?, confirmed?}] — ersetzt die Zuordnung komplett
create or replace function set_session_speakers(p_session_id uuid, p_speakers jsonb) returns integer
  language plpgsql security definer set search_path = public, extensions as $$
declare v_n integer;
begin
  if not can_edit_session(p_session_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from session_speaker where session_id = p_session_id;
  insert into session_speaker (session_id, person_id, role, sort_order, confirmed)
  select p_session_id,
         (x->>'person_id')::uuid,
         coalesce(x->>'role', 'speaker'),
         coalesce((x->>'sort_order')::integer, ord::integer),
         coalesce((x->>'confirmed')::boolean, false)
  from jsonb_array_elements(coalesce(p_speakers, '[]'::jsonb)) with ordinality as t(x, ord);
  get diagnostics v_n = row_count;
  perform log_audit('session.speakers', 'session', p_session_id::text, null, p_speakers);
  return v_n;
end $$;

-- === RPC: attach_session_to_slot / detach_session ==========================
create or replace function attach_session_to_slot(p_session_id uuid, p_slot_id uuid) returns void
  language plpgsql security definer set search_path = public, extensions as $$
declare v_s session%rowtype; v_sl slot%rowtype;
begin
  select * into v_s from session where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  select * into v_sl from slot where id = p_slot_id for update;
  if not found then
    raise exception 'slot_not_found' using errcode = 'P0002';
  end if;
  if not (can_edit_session(p_session_id) and can_edit_slot(p_slot_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from stage st where st.id = v_sl.stage_id and st.event_id <> v_s.event_id) then
    raise exception 'slot belongs to another event' using errcode = '22023';
  end if;
  if exists (select 1 from session o where o.slot_id = p_slot_id and o.id <> p_session_id) then
    raise exception 'slot_occupied' using errcode = '23505';
  end if;
  update session set slot_id = p_slot_id, updated_by = current_person_id() where id = p_session_id;
  insert into slot_history (slot_id, changed_by, action, after)
    values (p_slot_id, current_person_id(), 'attach', jsonb_build_object('session_id', p_session_id));
  perform log_audit('session.attach', 'session', p_session_id::text, jsonb_build_object('slot_id', v_s.slot_id), jsonb_build_object('slot_id', p_slot_id));
end $$;

create or replace function detach_session(p_session_id uuid) returns void
  language plpgsql security definer set search_path = public, extensions as $$
declare v_s session%rowtype;
begin
  select * into v_s from session where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  if not can_edit_session(p_session_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_s.publish_status = 'published' then
    raise exception 'unpublish_first' using errcode = 'P0001';
  end if;
  update session set slot_id = null, updated_by = current_person_id() where id = p_session_id;
  if v_s.slot_id is not null then
    insert into slot_history (slot_id, changed_by, action, before)
      values (v_s.slot_id, current_person_id(), 'detach', jsonb_build_object('session_id', p_session_id));
  end if;
  perform log_audit('session.detach', 'session', p_session_id::text, jsonb_build_object('slot_id', v_s.slot_id), null);
end $$;

-- === RPC: publish_session / unpublish_session ===============================
create or replace function publish_session(p_session_id uuid) returns void
  language plpgsql security definer set search_path = public, extensions as $$
declare v_s session%rowtype;
begin
  select * into v_s from session where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  if not is_programme_editor(v_s.event_id) then
    raise exception 'not allowed' using errcode = '42501';   -- Veröffentlichen nur Programm-Team/Admin
  end if;
  if v_s.format not in ('break','opening','closing','networking','reception','side_event')
     and not exists (select 1 from session_speaker where session_id = p_session_id) then
    raise exception 'publish requires at least one speaker' using errcode = '23514';
  end if;
  update session set publish_status = 'published', updated_by = current_person_id() where id = p_session_id;
  -- Slot-Status folgt: veröffentlicht = final
  update slot set status = 'final', updated_by = current_person_id()
   where id = v_s.slot_id and status <> 'final';
  perform log_audit('session.publish', 'session', p_session_id::text, jsonb_build_object('publish_status', v_s.publish_status), jsonb_build_object('publish_status', 'published'));
end $$;

create or replace function unpublish_session(p_session_id uuid, p_reason text default null) returns void
  language plpgsql security definer set search_path = public, extensions as $$
declare v_s session%rowtype;
begin
  select * into v_s from session where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  if not is_programme_editor(v_s.event_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update session set publish_status = 'draft', updated_by = current_person_id() where id = p_session_id;
  perform log_audit('session.unpublish', 'session', p_session_id::text, jsonb_build_object('publish_status', v_s.publish_status), jsonb_build_object('publish_status', 'draft', 'reason', p_reason));
end $$;

-- === GRANTs =================================================================
grant select on programme_board, programme_backlog to authenticated;
grant all on programme_board, programme_backlog to service_role;
grant execute on function is_programme_editor(uuid)                    to authenticated;
grant execute on function can_edit_session(uuid)                       to authenticated;
grant execute on function session_speakers_public(uuid)                to authenticated;
grant execute on function upsert_session(jsonb)                        to authenticated;
grant execute on function set_session_speakers(uuid, jsonb)            to authenticated;
grant execute on function attach_session_to_slot(uuid, uuid)           to authenticated;
grant execute on function detach_session(uuid)                         to authenticated;
grant execute on function publish_session(uuid)                        to authenticated;
grant execute on function unpublish_session(uuid, text)                to authenticated;

select harden_definer_functions();
