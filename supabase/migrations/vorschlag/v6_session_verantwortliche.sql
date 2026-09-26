-- 00NN · ADM-018: Verantwortliche je Session — aus den Stage Leads abgeleitet, je Session übersteuerbar
--
-- Vorschlag der Build-Session Speaker-Domäne. Nummer, Anwenden, Umbenennen und
-- der Eintrag ins Entscheidungslog gehören der Architektur-Session.
--
-- Konrad 25.09. zu ADM-018: „ableiten als Vorgabe, aber je Session bearbeitbar —
-- manchmal zwei Leads je Bühne, die sich Tage aufteilen (Feld
-- session.owner_person_id als Übersteuerung)“.
--
--   * Abgeleitet wird aus den aktiven `speaker_manager`-Rollen (PORT3: Bühne,
--     Bühnentag, Slot), **die engste Stufe gewinnt**: Leads des Slots, sonst
--     des Bühnentags, sonst der Bühne. Zwei Leads, die sich Tage teilen, tragen
--     Tag-Scopes — dann stimmt die Ableitung schon ohne Übersteuerung.
--   * `session.owner_person_id` übersteuert; leer heisst „abgeleitet“. Setzen
--     nur die Programmleitung (`is_programme_editor`), nur auf einen aktiven
--     Stage Lead derselben Veranstaltung, mit Audit-Eintrag. `session` ist für
--     Clients nicht beschreibbar (revoke insert/update/delete, v3) — die Spalte
--     geht also nur über `set_session_owner`.
--   * `session_responsibles` liefert der Programmtabelle je Session beides:
--     Übersteuerung und Ableitung. Die Programmleitung sieht alle Sessions der
--     Veranstaltung, ein Stage Lead nur die, deren Slot er bearbeiten darf
--     (`can_edit_slot`) — keine fremden Entwürfe, auch nicht als Kennung.
--
-- Die Sicht `programme_board` bleibt unverändert (Board und Tabellen teilen sie).

set search_path = public, extensions;

-- ---- 1 · Übersteuerung je Session
alter table session add column if not exists owner_person_id uuid references person(id) on delete set null;
comment on column session.owner_person_id is
  'Verantwortliche Person, wenn sie von der Ableitung aus den Stage Leads abweicht (ADM-018). Leer = abgeleitet (Slot, Bühnentag, Bühne). Gesetzt nur über set_session_owner.';

-- ---- 2 · Aktive Stage Leads einer Veranstaltung (intern)
create or replace function event_stage_leads(p_event_id uuid)
 RETURNS TABLE(person_id uuid, scope_type text, scope_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select ra.person_id, ra.scope_type, ra.scope_id
    from role_assignment ra
    join person p on p.id = ra.person_id and p.deleted_at is null and p.access_blocked_at is null
    join stage st on st.id = scope_stage_id(ra.scope_type, ra.scope_id)
   where ra.role = 'speaker_manager'
     and ra.scope_type in ('stage', 'stage_day', 'slot')
     and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())
     and st.event_id = p_event_id
$$;
revoke execute on function event_stage_leads(uuid) from public, anon, authenticated;

-- ---- 3 · Abgeleitete Leads eines Slots, engste Stufe zuerst (intern)
create or replace function slot_stage_leads(p_slot_id uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  with s as (
    select sl.id, sl.stage_id, st.event_id, sd.id as stage_day_id
      from slot sl
      join stage st on st.id = sl.stage_id
      left join stage_day sd on sd.stage_id = sl.stage_id and sd.event_day_id = sl.event_day_id
     where sl.id = p_slot_id
  ), l as (
    select e.* from s, event_stage_leads(s.event_id) e
  )
  select coalesce(
    (select array_agg(distinct l.person_id) from l, s where l.scope_type = 'slot' and l.scope_id = s.id),
    (select array_agg(distinct l.person_id) from l, s where l.scope_type = 'stage_day' and l.scope_id = s.stage_day_id),
    (select array_agg(distinct l.person_id) from l, s where l.scope_type = 'stage' and l.scope_id = s.stage_id),
    '{}'::uuid[])
$$;
revoke execute on function slot_stage_leads(uuid) from public, anon, authenticated;

-- ---- 4 · Lesen für die Programmtabelle
create or replace function session_responsibles(p_event_id uuid)
 RETURNS TABLE(session_id uuid, owner_person_id uuid, owner_name text, derived_person_ids uuid[], derived_names text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_editor boolean;
begin
  if not coalesce(can_search_board(p_event_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_editor := coalesce(is_programme_editor(p_event_id), false);
  return query
    select se.id, se.owner_person_id,
           (select nullif(btrim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, '')), '')
              from person o where o.id = se.owner_person_id),
           d.ids,
           (select coalesce(array_agg(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
                                      order by p.last_name, p.first_name), '{}'::text[])
              from person p where p.id = any(d.ids))
      from session se
      join slot sl on sl.id = se.slot_id
      cross join lateral (select slot_stage_leads(sl.id) as ids) d
     where se.event_id = p_event_id
       and (v_editor or can_edit_slot(sl.id));
end $$;
grant execute on function session_responsibles(uuid) to authenticated;

-- ---- 5 · Auswahl für die Übersteuerung (nur Programmleitung)
create or replace function session_owner_candidates(p_event_id uuid)
 RETURNS TABLE(person_id uuid, name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not coalesce(is_programme_editor(p_event_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select p.id, nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
      from person p
     where p.id in (select l.person_id from event_stage_leads(p_event_id) l)
     order by p.last_name, p.first_name;
end $$;
grant execute on function session_owner_candidates(uuid) to authenticated;

-- ---- 6 · Übersteuern oder zurück auf „abgeleitet“ (null)
create or replace function set_session_owner(p_session_id uuid, p_person_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_se session%rowtype;
begin
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  if not coalesce(is_programme_editor(v_se.event_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_person_id is not null
     and not exists (select 1 from event_stage_leads(v_se.event_id) l where l.person_id = p_person_id) then
    raise exception 'owner_not_lead' using errcode = '22023';
  end if;
  -- Nichts geändert, nichts zu protokollieren.
  if v_se.owner_person_id is not distinct from p_person_id then return p_person_id; end if;
  update session set owner_person_id = p_person_id where id = p_session_id;
  perform log_audit('session.owner', 'session', p_session_id::text,
                    jsonb_build_object('owner_person_id', v_se.owner_person_id),
                    jsonb_build_object('owner_person_id', p_person_id));
  return p_person_id;
end $$;
grant execute on function set_session_owner(uuid, uuid) to authenticated;

select harden_definer_functions();
