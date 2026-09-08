-- =============================================================================
-- 0016 · Board-Realtime, Fragen-RPCs, Startzeiten Summit 27 (Review PR #2)
--   1. Realtime: Board-Änderungen kommen aus der Datenbank (Trigger → realtime.send
--      auf privaten Kanal `programme-board:<event_id>`, minimale Payload {table,id}).
--      Kein Client muss senden; empfangen dürfen nur Programm-Leser (RLS auf
--      realtime.messages). Keine Postgres-Changes-Publikation für `slot`, weil die
--      interne Spalten enthält, die Realtime nicht spaltenweise filtert.
--   2. set_session_questions / approve_session_questions statt service_role.
--   3. Programmzeiten Summit 27 (Vorschlag nach FLS26-Muster, änderbar).
-- =============================================================================
set search_path = public, extensions;

-- === 1 · Realtime aus der Datenbank ========================================
create or replace function programme_board_notify() returns trigger
  language plpgsql security definer set search_path = public, extensions as $$
declare
  v_event uuid;
  v_id    uuid;
begin
  if tg_table_name = 'slot' then
    select st.event_id into v_event from stage st where st.id = coalesce(new.stage_id, old.stage_id);
    v_id := coalesce(new.id, old.id);
  else
    v_event := coalesce(new.event_id, old.event_id);
    v_id    := coalesce(new.id, old.id);
  end if;
  if v_event is null then
    return null;
  end if;
  -- realtime.send(payload, event, topic, private) — vorhanden auf aktuellen Supabase-Projekten
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'realtime' and p.proname = 'send') then
    perform realtime.send(
      jsonb_build_object('table', tg_table_name, 'id', v_id, 'op', tg_op),
      'changed',
      'programme-board:' || v_event::text,
      true
    );
  end if;
  return null;
end $$;
revoke execute on function programme_board_notify() from public, anon, authenticated;

-- Speaker-Änderungen: über die Session auflösen
create or replace function programme_board_notify_speaker() returns trigger
  language plpgsql security definer set search_path = public, extensions as $$
declare v_event uuid; v_sess uuid := coalesce(new.session_id, old.session_id);
begin
  select event_id into v_event from session where id = v_sess;
  if v_event is not null and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                     where n.nspname = 'realtime' and p.proname = 'send') then
    perform realtime.send(jsonb_build_object('table', 'session_speaker', 'id', v_sess, 'op', tg_op),
                          'changed', 'programme-board:' || v_event::text, true);
  end if;
  return null;
end $$;
revoke execute on function programme_board_notify_speaker() from public, anon, authenticated;

drop trigger if exists trg_slot_board_notify on slot;
create trigger trg_slot_board_notify after insert or update or delete on slot
  for each row execute function programme_board_notify();
drop trigger if exists trg_session_board_notify on session;
create trigger trg_session_board_notify after insert or update or delete on session
  for each row execute function programme_board_notify();
drop trigger if exists trg_session_speaker_board_notify on session_speaker;
create trigger trg_session_speaker_board_notify after insert or update or delete on session_speaker
  for each row execute function programme_board_notify_speaker();

-- Private Kanäle: nur Programm-Leser dürfen empfangen; senden darf kein Client
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'realtime' and table_name = 'messages') then
    begin
      execute 'drop policy if exists programme_board_receive on realtime.messages';
      execute $p$create policy programme_board_receive on realtime.messages
                for select to authenticated
                using (realtime.topic() like 'programme-board:%' and public.is_programme_reader())$p$;
    exception when others then
      raise notice 'realtime.messages policy nicht angelegt: %', sqlerrm;
    end;
  end if;
end $$;

-- === 2 · Fragen je Session per RPC ==========================================
-- p_questions: [{question_id?, label_de?, label_en?, type?, options?, required?, sort_order?}]
-- Ersetzt die Katalogfragen; eigene Fragen (ohne question_id) bleiben, außer p_replace_custom = true.
-- Eigene Fragen gelten erst nach Freigabe
-- durch das Programm-Team; legt ein Programm-Editor sie selbst an, sind sie sofort freigegeben.
create or replace function set_session_questions(p_session_id uuid, p_questions jsonb, p_replace_custom boolean default false) returns integer
  language plpgsql security definer set search_path = public, extensions as $$
declare
  v_event  uuid;
  v_editor boolean;
  v_n      integer;
begin
  if not can_edit_session(p_session_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select event_id into v_event from session where id = p_session_id;
  v_editor := is_programme_editor(v_event);

  delete from session_question
   where session_id = p_session_id and (p_replace_custom or question_id is not null);
  insert into session_question (session_id, question_id, label_de, label_en, type, options, required, sort_order, approved_by, approved_at)
  select p_session_id,
         nullif(x->>'question_id', '')::uuid,
         x->>'label_de', x->>'label_en',
         x->>'type', x->'options',
         coalesce((x->>'required')::boolean, false),
         coalesce((x->>'sort_order')::integer, ord::integer),
         case when (x->>'question_id') is not null and x->>'question_id' <> '' or v_editor then current_person_id() end,
         case when (x->>'question_id') is not null and x->>'question_id' <> '' or v_editor then now() end
  from jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) with ordinality as t(x, ord);
  get diagnostics v_n = row_count;
  perform log_audit('session.questions', 'session', p_session_id::text, null, p_questions);
  return v_n;
end $$;

create or replace function approve_session_questions(p_session_id uuid) returns integer
  language plpgsql security definer set search_path = public, extensions as $$
declare v_event uuid; v_n integer;
begin
  select event_id into v_event from session where id = p_session_id;
  if v_event is null then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  if not is_programme_editor(v_event) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update session_question set approved_by = current_person_id(), approved_at = now()
   where session_id = p_session_id and approved_at is null;
  get diagnostics v_n = row_count;
  perform log_audit('session.questions.approve', 'session', p_session_id::text, null, jsonb_build_object('approved', v_n));
  return v_n;
end $$;

grant execute on function set_session_questions(uuid, jsonb, boolean) to authenticated;
grant execute on function approve_session_questions(uuid)      to authenticated;

-- === 3 · Programmzeiten Summit 27 (Vorschlag nach FLS26, nur wo leer) =======
update event_day ed set doors_open = '12:00', programme_start = '13:00', programme_end = '20:30'
  from event e where e.id = ed.event_id and e.slug = 'summit-27' and ed.day_date = '2027-04-16' and ed.programme_start is null;
update event_day ed set doors_open = '11:00', programme_start = '12:00', programme_end = '19:30'
  from event e where e.id = ed.event_id and e.slug = 'summit-27' and ed.day_date = '2027-04-17' and ed.programme_start is null;
update stage_day sd set open_from = ed.programme_start, open_to = ed.programme_end
  from event_day ed where ed.id = sd.event_day_id and sd.open_from is null and ed.programme_start is not null;

select harden_definer_functions();
