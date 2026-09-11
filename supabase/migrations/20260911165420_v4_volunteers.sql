-- 0065 · Volunteers, Schichten, Zuteilung (Arbeitsauftrag Welle 4, A1; Entscheidungen E1 und E9).
-- Zuteilung macht das Team (Antwort 26), keine Selbstbuchung. Mindestalter 18 am ersten Eventtag (E1), Geburtsdatum kommt aus der Bewerbung.
-- Kapazität je Schicht ist `capacity + overbook` (E9: bewusste Überbuchung); darüber hinaus landet eine Person auf der Warteliste,
-- eine Absage zieht die erste Wartende automatisch nach. Bewerbung nur mit Einwilligung zu Bedingungen und Datenschutz.
-- Abweichungen: `is_volunteer_team()` umfasst zusätzlich `area_lead_volunteers` — der Auftrag nennt nur admin/volunteer_lead,
--   die Bereichsleitung wäre damit aus ihrem eigenen Bereich ausgesperrt (in der PR-Beschreibung benannt).
-- Vokabular `volunteer_area` bleibt in dieser Migration leer: die Liste kommt aus dem Airtable-Export 2026 und wird über den
--   Vokabular-Admin gepflegt (E1). Bereichswünsche sind deshalb freiwillig; angegebene Werte müssen im Vokabular stehen.
set search_path = public, extensions;

-- === Vokabular =============================================================
insert into vocab_term (vocabulary, key, label_de, label_en, sort_order) values
  ('shirt_size', 'S', 'S', 'S', 10), ('shirt_size', 'M', 'M', 'M', 20), ('shirt_size', 'L', 'L', 'L', 30),
  ('shirt_size', 'XL', 'XL', 'XL', 40), ('shirt_size', 'XXL', 'XXL', 'XXL', 50)
on conflict (vocabulary, key) do nothing;

-- === Tabellen ==============================================================

create table if not exists volunteer_profile (
  id               uuid primary key default gen_random_uuid(),
  person_id        uuid not null references person(id) on delete cascade,
  edition_id       uuid not null references event(id) on delete cascade,
  status           text not null default 'applied' check (status in ('applied', 'accepted', 'declined', 'withdrawn')),
  shirt_size       text,
  areas            text[] not null default '{}',          -- Wünsche, Vokabular volunteer_area
  day_prefs        uuid[] not null default '{}',          -- event_day
  availability     jsonb,                                 -- freie Angabe, z. B. {"fr":"ab 12","sa":"ganztags"}
  buddy_person_id  uuid references person(id) on delete set null,
  buddy_note       text,                                  -- Wunsch als Text, wenn die Person kein Profil hat
  notes_internal   text,                                  -- nur Team
  applied_at       timestamptz not null default now(),
  decided_at       timestamptz,
  decided_by       uuid references person(id) on delete set null,
  decision_note    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (person_id, edition_id)
);
create index if not exists volunteer_profile_edition_idx on volunteer_profile (edition_id, status);

create table if not exists shift (
  id              uuid primary key default gen_random_uuid(),
  edition_id      uuid not null references event(id) on delete cascade,
  event_day_id    uuid references event_day(id) on delete set null,
  area            text not null,
  position        text not null,
  start_at        timestamptz not null,
  end_at          timestamptz not null,
  capacity        integer not null default 1 check (capacity >= 0),
  overbook        integer not null default 0 check (overbook >= 0),
  location        text,
  lead_person_id  uuid references person(id) on delete set null,
  briefing_md     text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_at > start_at)
);
create index if not exists shift_edition_idx on shift (edition_id, start_at);

create table if not exists shift_assignment (
  id             uuid primary key default gen_random_uuid(),
  shift_id       uuid not null references shift(id) on delete cascade,
  person_id      uuid not null references person(id) on delete cascade,
  status         text not null default 'assigned' check (status in ('assigned', 'confirmed', 'declined', 'no_show', 'waitlisted')),
  confirmed_at   timestamptz,
  declined_at    timestamptz,
  decline_reason text,
  reminded_at    timestamptz,                              -- Erinnerung genau einmal je Zuweisung
  assigned_by    uuid references person(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (shift_id, person_id)
);
create index if not exists shift_assignment_person_idx on shift_assignment (person_id, status);

-- RLS an, keine Grants: gelesen und geschrieben wird ausschließlich über die RPCs unten.
alter table volunteer_profile enable row level security;
alter table shift enable row level security;
alter table shift_assignment enable row level security;
revoke all on volunteer_profile from anon, authenticated;
revoke all on shift from anon, authenticated;
revoke all on shift_assignment from anon, authenticated;

drop trigger if exists trg_volunteer_profile_updated on volunteer_profile;
create trigger trg_volunteer_profile_updated before update on volunteer_profile for each row execute function set_updated_at();
drop trigger if exists trg_shift_updated on shift;
create trigger trg_shift_updated before update on shift for each row execute function set_updated_at();
drop trigger if exists trg_shift_assignment_updated on shift_assignment;
create trigger trg_shift_assignment_updated before update on shift_assignment for each row execute function set_updated_at();

-- === Helfer ================================================================

/** Volunteer-Team: Admin, Bereichsleitung Volunteers und Volunteer-Leads. */
create or replace function is_volunteer_team() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select has_role('admin') or has_role('area_lead_volunteers') or has_role('volunteer_lead')
$$;

/** Belegte Plätze einer Schicht — Warteliste und Absagen zählen nicht mit. */
create or replace function shift_taken(p_shift_id uuid) returns integer
language sql stable security definer set search_path = public, extensions as $$
  select count(*)::integer from shift_assignment a
   where a.shift_id = p_shift_id and a.status in ('assigned', 'confirmed')
$$;
revoke execute on function shift_taken(uuid) from public, anon, authenticated;

/** Die laufende Edition, wenn keine mitgegeben wurde: die nächste, die nicht vorbei ist. */
create or replace function volunteer_edition(p_edition_id uuid default null) returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(p_edition_id,
    (select e.id from event e where e.is_edition and coalesce(e.end_date, current_date) >= current_date
      order by e.start_date nulls last limit 1))
$$;
revoke execute on function volunteer_edition(uuid) from public, anon, authenticated;

-- === Bewerbung und Profil ==================================================

/**
 * Bewerbung als Volunteer.
 *
 * `p_data`: edition_id?, birthdate (Pflicht, wenn die Person keins hinterlegt
 * hat), shirt_size?, areas[]?, day_prefs[]?, availability?, buddy_person_id?,
 * buddy_note?.
 *
 * Mindestalter 18 am **ersten Eventtag** (E1) — nicht heute, sonst dürfte
 * jemand mitmachen, der am Summit noch 17 ist.
 */
create or replace function apply_volunteer(p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_pid uuid := current_person_id(); v_ed uuid; v_start date; v_bd date; v_id uuid; v_shirt text; v_areas text[]; v_days uuid[]; a text; d uuid;
begin
  if v_pid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := volunteer_edition(nullif(p_data->>'edition_id', '')::uuid);
  if v_ed is null then raise exception 'edition_required' using errcode = '22023'; end if;

  -- Einwilligung: Bedingungen und Datenschutz müssen zugestimmt vorliegen.
  if not exists (select 1 from consent_current c where c.person_id = v_pid and c.consent_type = 'terms' and c.granted)
     or not exists (select 1 from consent_current c where c.person_id = v_pid and c.consent_type = 'privacy' and c.granted) then
    raise exception 'consent_required' using errcode = 'P0001';
  end if;

  v_bd := coalesce(nullif(p_data->>'birthdate', '')::date, (select p.birthdate from person p where p.id = v_pid));
  if v_bd is null then raise exception 'birthdate_required' using errcode = '22023'; end if;
  select e.start_date into v_start from event e where e.id = v_ed;
  if v_bd > coalesce(v_start, current_date) - interval '18 years' then
    raise exception 'too_young' using errcode = 'P0001', detail = to_char(coalesce(v_start, current_date), 'YYYY-MM-DD');
  end if;
  update person set birthdate = v_bd where id = v_pid and birthdate is distinct from v_bd;

  v_shirt := nullif(btrim(coalesce(p_data->>'shirt_size', '')), '');
  if v_shirt is not null and not is_vocab_key('shirt_size', v_shirt) then
    raise exception 'invalid_shirt_size' using errcode = '22023', detail = v_shirt;
  end if;

  -- Bereichswünsche sind freiwillig; was angegeben wird, muss im Vokabular stehen.
  v_areas := coalesce((select array_agg(x) from jsonb_array_elements_text(p_data->'areas') x), '{}');
  foreach a in array v_areas loop
    if not is_vocab_key('volunteer_area', a) then raise exception 'invalid_area' using errcode = '22023', detail = a; end if;
  end loop;
  v_days := coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_data->'day_prefs') x), '{}');
  foreach d in array v_days loop
    if not exists (select 1 from event_day ed where ed.id = d and ed.event_id = v_ed) then
      raise exception 'day_not_found' using errcode = 'P0002', detail = d::text;
    end if;
  end loop;

  insert into volunteer_profile (person_id, edition_id, shirt_size, areas, day_prefs, availability, buddy_person_id, buddy_note)
  values (v_pid, v_ed, v_shirt, v_areas, v_days, p_data->'availability',
          nullif(p_data->>'buddy_person_id', '')::uuid, nullif(btrim(coalesce(p_data->>'buddy_note', '')), ''))
  on conflict (person_id, edition_id) do update
    set status = 'applied', applied_at = now(), shirt_size = excluded.shirt_size, areas = excluded.areas,
        day_prefs = excluded.day_prefs, availability = excluded.availability,
        buddy_person_id = excluded.buddy_person_id, buddy_note = excluded.buddy_note,
        decided_at = null, decided_by = null, decision_note = null
    where volunteer_profile.status = 'withdrawn'
  returning id into v_id;
  if v_id is null then raise exception 'already_applied' using errcode = '23505'; end if;

  perform queue_mail('volunteer_applied', v_pid, jsonb_build_object('edition', (select e.name from event e where e.id = v_ed)), 'volunteer_profile', v_id);
  perform log_audit('volunteer.apply', 'volunteer_profile', v_id::text, null, jsonb_build_object('edition_id', v_ed));
  return v_id;
end $$;

create or replace function my_volunteer_profile(p_edition_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_pid uuid := current_person_id(); v_ed uuid; v_p volunteer_profile;
begin
  if v_pid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := volunteer_edition(p_edition_id);
  select * into v_p from volunteer_profile where person_id = v_pid and edition_id = v_ed;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', v_p.id, 'edition_id', v_p.edition_id, 'status', v_p.status, 'shirt_size', v_p.shirt_size,
    'areas', to_jsonb(v_p.areas), 'day_prefs', to_jsonb(v_p.day_prefs), 'availability', v_p.availability,
    'buddy_person_id', v_p.buddy_person_id, 'buddy_note', v_p.buddy_note,
    'applied_at', v_p.applied_at, 'decided_at', v_p.decided_at, 'decision_note', v_p.decision_note,
    'shifts', (select count(*) from shift_assignment a where a.person_id = v_pid and a.status in ('assigned', 'confirmed')));
end $$;

/** Was die Person selbst ändern darf — Status und interne Notiz gehören dem Team. */
create or replace function update_my_volunteer_profile(p_data jsonb, p_edition_id uuid default null) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_pid uuid := current_person_id(); v_ed uuid; v_p volunteer_profile; v_shirt text; v_areas text[]; a text;
begin
  if v_pid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := volunteer_edition(p_edition_id);
  select * into v_p from volunteer_profile where person_id = v_pid and edition_id = v_ed for update;
  if not found then raise exception 'profile_not_found' using errcode = 'P0002'; end if;
  if v_p.status = 'declined' then raise exception 'not_editable' using errcode = 'P0001', detail = v_p.status; end if;

  if p_data ? 'shirt_size' then
    v_shirt := nullif(btrim(coalesce(p_data->>'shirt_size', '')), '');
    if v_shirt is not null and not is_vocab_key('shirt_size', v_shirt) then
      raise exception 'invalid_shirt_size' using errcode = '22023', detail = v_shirt;
    end if;
  end if;
  if p_data ? 'areas' then
    v_areas := coalesce((select array_agg(x) from jsonb_array_elements_text(p_data->'areas') x), '{}');
    foreach a in array v_areas loop
      if not is_vocab_key('volunteer_area', a) then raise exception 'invalid_area' using errcode = '22023', detail = a; end if;
    end loop;
  end if;

  update volunteer_profile set
    shirt_size   = case when p_data ? 'shirt_size' then v_shirt else shirt_size end,
    areas        = case when p_data ? 'areas' then v_areas else areas end,
    day_prefs    = case when p_data ? 'day_prefs'
                        then coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_data->'day_prefs') x), '{}')
                        else day_prefs end,
    availability = case when p_data ? 'availability' then p_data->'availability' else availability end,
    buddy_note   = case when p_data ? 'buddy_note' then nullif(btrim(coalesce(p_data->>'buddy_note', '')), '') else buddy_note end,
    -- Zurückziehen darf die Person selbst; alles andere entscheidet das Team.
    status       = case when coalesce(p_data->>'status', '') = 'withdrawn' then 'withdrawn' else status end
  where id = v_p.id;
  perform log_audit('volunteer.update_profile', 'volunteer_profile', v_p.id::text, null, p_data - 'availability');
end $$;

-- === Schichten aus Sicht der Volunteers ====================================

create or replace function my_shifts(p_edition_id uuid default null)
returns table (assignment_id uuid, shift_id uuid, status text, area text, "position" text, start_at timestamptz, end_at timestamptz,
               location text, briefing_md text, lead_name text, confirmed_at timestamptz, day_label_de text, day_label_en text)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_pid uuid := current_person_id(); v_ed uuid;
begin
  if v_pid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := volunteer_edition(p_edition_id);
  return query
    select a.id, s.id, a.status, s.area, s.position, s.start_at, s.end_at, s.location, s.briefing_md,
           (select trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) from person p where p.id = s.lead_person_id),
           a.confirmed_at, d.label_de, d.label_en
      from shift_assignment a join shift s on s.id = a.shift_id
      left join event_day d on d.id = s.event_day_id
     where a.person_id = v_pid and s.edition_id = v_ed and a.status <> 'declined'
     order by s.start_at;
end $$;

create or replace function confirm_shift(p_assignment_id uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_pid uuid := current_person_id(); v_a shift_assignment;
begin
  if v_pid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_a from shift_assignment where id = p_assignment_id for update;
  if not found or v_a.person_id <> v_pid then raise exception 'assignment_not_found' using errcode = 'P0002'; end if;
  if v_a.status <> 'assigned' then raise exception 'not_assigned' using errcode = 'P0001', detail = v_a.status; end if;
  update shift_assignment set status = 'confirmed', confirmed_at = now() where id = p_assignment_id;
  perform log_audit('volunteer.confirm_shift', 'shift_assignment', p_assignment_id::text, null, null);
end $$;

/** Absage — zieht sofort die erste Wartende nach (E9), damit niemand von Hand nachsehen muss. */
create or replace function decline_shift(p_assignment_id uuid, p_reason text default null) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_pid uuid := current_person_id(); v_a shift_assignment;
begin
  if v_pid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_a from shift_assignment where id = p_assignment_id for update;
  if not found or v_a.person_id <> v_pid then raise exception 'assignment_not_found' using errcode = 'P0002'; end if;
  if v_a.status not in ('assigned', 'confirmed', 'waitlisted') then raise exception 'not_assigned' using errcode = 'P0001', detail = v_a.status; end if;
  update shift_assignment set status = 'declined', declined_at = now(),
         decline_reason = nullif(btrim(coalesce(p_reason, '')), '') where id = p_assignment_id;
  perform promote_shift_waitlist(v_a.shift_id);
  perform log_audit('volunteer.decline_shift', 'shift_assignment', p_assignment_id::text,
                    jsonb_build_object('status', v_a.status), jsonb_build_object('reason', p_reason));
end $$;

/** Wartende nachrücken, solange Platz ist. Gibt die Zahl der Nachgerückten zurück. */
create or replace function promote_shift_waitlist(p_shift_id uuid) returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_s shift; v_free integer; v_n integer := 0; r record;
begin
  select * into v_s from shift where id = p_shift_id;
  if not found then return 0; end if;
  v_free := v_s.capacity + v_s.overbook - shift_taken(p_shift_id);
  for r in select a.id, a.person_id from shift_assignment a
            where a.shift_id = p_shift_id and a.status = 'waitlisted' order by a.created_at limit greatest(v_free, 0)
  loop
    update shift_assignment set status = 'assigned' where id = r.id;
    perform queue_mail('shift_assigned', r.person_id,
                       jsonb_build_object('area', v_s.area, 'position', v_s.position,
                                          'start_at', mail_fmt_ts(v_s.start_at, coalesce((select e.timezone from event e where e.id = v_s.edition_id), 'Europe/Berlin'),
                                                                  coalesce((select p.preferred_language from person p where p.id = r.person_id), 'de')),
                                          'location', coalesce(v_s.location, '')),
                       'shift_assignment', r.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function promote_shift_waitlist(uuid) from public, anon, authenticated;

-- === Team ==================================================================

create or replace function volunteer_admin_overview(p_edition_id uuid default null)
returns table (profile_id uuid, person_id uuid, display_name text, email text, status text, shirt_size text, areas text[],
               day_prefs uuid[], availability jsonb, buddy_note text, notes_internal text, applied_at timestamptz,
               decided_at timestamptz, shifts_assigned integer, shifts_confirmed integer, birthdate date)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid;
begin
  if not is_volunteer_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_ed := volunteer_edition(p_edition_id);
  return query
    select v.id, v.person_id, trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), pe.email::text,
           v.status, v.shirt_size, v.areas, v.day_prefs, v.availability, v.buddy_note, v.notes_internal, v.applied_at, v.decided_at,
           (select count(*)::integer from shift_assignment a where a.person_id = v.person_id and a.status = 'assigned'),
           (select count(*)::integer from shift_assignment a where a.person_id = v.person_id and a.status = 'confirmed'),
           p.birthdate
      from volunteer_profile v join person p on p.id = v.person_id
      left join person_email pe on pe.person_id = p.id and pe.is_primary
     where v.edition_id = v_ed
     order by v.applied_at;
end $$;

/**
 * Status setzen. `accepted` gibt die Rolle `volunteer` für die Edition,
 * `declined`/`withdrawn` beendet sie.
 *
 * Die Rolle wird hier direkt geschrieben, nicht über `assign_role`: das
 * verlangt `has_role('admin')` und würde eine Volunteer-Leitung aussperren.
 */
create or replace function set_volunteer_status(p_profile_id uuid, p_status text, p_note text default null) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_v volunteer_profile; v_me uuid := current_person_id(); v_end date; v_locale text;
begin
  if not is_volunteer_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('applied', 'accepted', 'declined', 'withdrawn') then raise exception 'invalid_status' using errcode = '22023', detail = p_status; end if;
  select * into v_v from volunteer_profile where id = p_profile_id for update;
  if not found then raise exception 'profile_not_found' using errcode = 'P0002'; end if;

  update volunteer_profile set status = p_status, decided_at = now(), decided_by = v_me,
         decision_note = nullif(btrim(coalesce(p_note, '')), '') where id = p_profile_id;

  select coalesce(e.end_date, current_date) into v_end from event e where e.id = v_v.edition_id;
  if p_status = 'accepted' then
    insert into role_assignment (person_id, role, scope_type, edition_id, valid_from, valid_to, granted_by, note)
    values (v_v.person_id, 'volunteer', 'edition', v_v.edition_id, now(), (v_end + 1)::timestamptz, v_me, 'auto:volunteer_accepted')
    on conflict (person_id, role, scope_type,
                 coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 coalesce(edition_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 coalesce(portal, ''))
    do update set valid_from = now(), valid_to = (v_end + 1)::timestamptz, granted_by = v_me;
  elsif p_status in ('declined', 'withdrawn') then
    -- Beenden über `valid_to`; `role_assignment_valid_chk` verlangt valid_to > valid_from.
    update role_assignment set valid_to = greatest(now(), valid_from + interval '1 second')
     where person_id = v_v.person_id and role = 'volunteer' and scope_type = 'edition' and edition_id = v_v.edition_id
       and (valid_to is null or valid_to > now());
  end if;

  if p_status in ('accepted', 'declined') then
    select coalesce(p.preferred_language, 'de') into v_locale from person p where p.id = v_v.person_id;
    perform queue_mail(case when p_status = 'accepted' then 'volunteer_accepted' else 'volunteer_declined' end, v_v.person_id,
                       jsonb_build_object('edition', (select e.name from event e where e.id = v_v.edition_id),
                                          'note', coalesce(nullif(btrim(coalesce(p_note, '')), ''), '')),
                       'volunteer_profile', p_profile_id);
  end if;
  perform log_audit('volunteer.set_status', 'volunteer_profile', p_profile_id::text,
                    jsonb_build_object('status', v_v.status), jsonb_build_object('status', p_status, 'note', p_note));
end $$;

/** Schicht anlegen oder ändern. `p_data.id` ⇒ ändern. */
create or replace function upsert_shift(p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_id uuid := nullif(p_data->>'id', '')::uuid; v_ed uuid; v_area text;
begin
  if not is_volunteer_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_area := nullif(btrim(coalesce(p_data->>'area', '')), '');
  if v_area is not null and not is_vocab_key('volunteer_area', v_area) then
    raise exception 'invalid_area' using errcode = '22023', detail = v_area;
  end if;
  if v_id is null then
    v_ed := volunteer_edition(nullif(p_data->>'edition_id', '')::uuid);
    if v_ed is null then raise exception 'edition_required' using errcode = '22023'; end if;
    if v_area is null or nullif(btrim(coalesce(p_data->>'position', '')), '') is null
       or nullif(p_data->>'start_at', '') is null or nullif(p_data->>'end_at', '') is null then
      raise exception 'fields_required' using errcode = '22023';
    end if;
    insert into shift (edition_id, event_day_id, area, position, start_at, end_at, capacity, overbook, location, lead_person_id, briefing_md, active)
    values (v_ed, nullif(p_data->>'event_day_id', '')::uuid, v_area, btrim(p_data->>'position'),
            (p_data->>'start_at')::timestamptz, (p_data->>'end_at')::timestamptz,
            coalesce((p_data->>'capacity')::integer, 1), coalesce((p_data->>'overbook')::integer, 0),
            nullif(btrim(coalesce(p_data->>'location', '')), ''), nullif(p_data->>'lead_person_id', '')::uuid,
            nullif(btrim(coalesce(p_data->>'briefing_md', '')), ''), coalesce((p_data->>'active')::boolean, true))
    returning id into v_id;
  else
    update shift set
      event_day_id   = case when p_data ? 'event_day_id' then nullif(p_data->>'event_day_id', '')::uuid else event_day_id end,
      area           = coalesce(v_area, area),
      position       = coalesce(nullif(btrim(coalesce(p_data->>'position', '')), ''), position),
      start_at       = coalesce(nullif(p_data->>'start_at', '')::timestamptz, start_at),
      end_at         = coalesce(nullif(p_data->>'end_at', '')::timestamptz, end_at),
      capacity       = case when p_data ? 'capacity' then (p_data->>'capacity')::integer else capacity end,
      overbook       = case when p_data ? 'overbook' then (p_data->>'overbook')::integer else overbook end,
      location       = case when p_data ? 'location' then nullif(btrim(coalesce(p_data->>'location', '')), '') else location end,
      lead_person_id = case when p_data ? 'lead_person_id' then nullif(p_data->>'lead_person_id', '')::uuid else lead_person_id end,
      briefing_md    = case when p_data ? 'briefing_md' then nullif(btrim(coalesce(p_data->>'briefing_md', '')), '') else briefing_md end,
      active         = case when p_data ? 'active' then (p_data->>'active')::boolean else active end
    where id = v_id;
    if not found then raise exception 'shift_not_found' using errcode = 'P0002'; end if;
  end if;
  perform log_audit('volunteer.upsert_shift', 'shift', v_id::text, null, p_data);
  return v_id;
end $$;

/**
 * Zuteilen. Ohne `p_status` entscheidet der Platz: ist die Schicht voll
 * (`capacity + overbook`), landet die Person auf der Warteliste statt an
 * einem Fehler. Wer ausdrücklich `assigned` verlangt, bekommt `shift_full`.
 */
create or replace function assign_shift(p_shift_id uuid, p_person_id uuid, p_status text default null) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_s shift; v_free integer; v_status text; v_id uuid; v_other record; v_locale text;
begin
  if not is_volunteer_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_s from shift where id = p_shift_id for update;
  if not found then raise exception 'shift_not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from person p where p.id = p_person_id and p.deleted_at is null) then
    raise exception 'person_not_found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from volunteer_profile v where v.person_id = p_person_id and v.edition_id = v_s.edition_id and v.status = 'accepted') then
    raise exception 'not_accepted' using errcode = 'P0001', detail = p_person_id::text;
  end if;
  if p_status is not null and p_status not in ('assigned', 'waitlisted') then
    raise exception 'invalid_status' using errcode = '22023', detail = p_status;
  end if;

  -- Zwei Schichten zur selben Zeit gehen nicht; das fällt sonst erst vor Ort auf.
  select s2.id, s2.area, s2.position into v_other
    from shift_assignment a join shift s2 on s2.id = a.shift_id
   where a.person_id = p_person_id and a.shift_id <> p_shift_id and a.status in ('assigned', 'confirmed')
     and tstzrange(s2.start_at, s2.end_at) && tstzrange(v_s.start_at, v_s.end_at)
   limit 1;
  if v_other.id is not null then
    raise exception 'shift_overlap' using errcode = 'P0001', detail = v_other.area || ' / ' || v_other.position;
  end if;

  v_free := v_s.capacity + v_s.overbook - shift_taken(p_shift_id);
  if p_status = 'assigned' and v_free <= 0 then
    raise exception 'shift_full' using errcode = 'P0001', detail = shift_taken(p_shift_id)::text || '/' || (v_s.capacity + v_s.overbook)::text;
  end if;
  v_status := coalesce(p_status, case when v_free > 0 then 'assigned' else 'waitlisted' end);

  insert into shift_assignment (shift_id, person_id, status, assigned_by)
  values (p_shift_id, p_person_id, v_status, current_person_id())
  on conflict (shift_id, person_id) do update
    set status = v_status, declined_at = null, decline_reason = null,
        confirmed_at = case when v_status = 'assigned' then null else shift_assignment.confirmed_at end
  returning id into v_id;

  if v_status = 'assigned' then
    select coalesce(p.preferred_language, 'de') into v_locale from person p where p.id = p_person_id;
    perform queue_mail('shift_assigned', p_person_id,
                       jsonb_build_object('area', v_s.area, 'position', v_s.position,
                                          'start_at', mail_fmt_ts(v_s.start_at, coalesce((select e.timezone from event e where e.id = v_s.edition_id), 'Europe/Berlin'), v_locale),
                                          'location', coalesce(v_s.location, '')),
                       'shift_assignment', v_id);
  end if;
  perform log_audit('volunteer.assign_shift', 'shift_assignment', v_id::text, null,
                    jsonb_build_object('shift_id', p_shift_id, 'person_id', p_person_id, 'status', v_status));
  return v_id;
end $$;

create or replace function unassign_shift(p_assignment_id uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_a shift_assignment;
begin
  if not is_volunteer_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_a from shift_assignment where id = p_assignment_id;
  if not found then raise exception 'assignment_not_found' using errcode = 'P0002'; end if;
  delete from shift_assignment where id = p_assignment_id;
  perform promote_shift_waitlist(v_a.shift_id);
  perform log_audit('volunteer.unassign_shift', 'shift_assignment', p_assignment_id::text,
                    jsonb_build_object('shift_id', v_a.shift_id, 'person_id', v_a.person_id), null);
end $$;

create or replace function shift_plan(p_edition_id uuid default null, p_day uuid default null)
returns table (id uuid, event_day_id uuid, area text, "position" text, start_at timestamptz, end_at timestamptz,
               capacity integer, overbook integer, location text, lead_person_id uuid, lead_name text, briefing_md text,
               active boolean, taken integer, waitlisted integer, people jsonb)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid;
begin
  if not is_volunteer_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_ed := volunteer_edition(p_edition_id);
  return query
    select s.id, s.event_day_id, s.area, s.position, s.start_at, s.end_at, s.capacity, s.overbook, s.location, s.lead_person_id,
           (select trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) from person p where p.id = s.lead_person_id),
           s.briefing_md, s.active, shift_taken(s.id),
           (select count(*)::integer from shift_assignment a where a.shift_id = s.id and a.status = 'waitlisted'),
           coalesce((select jsonb_agg(jsonb_build_object('assignment_id', a.id, 'person_id', a.person_id, 'status', a.status,
                                                          'name', trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')))
                              order by a.created_at)
                       from shift_assignment a join person p on p.id = a.person_id
                      where a.shift_id = s.id and a.status <> 'declined'), '[]'::jsonb)
      from shift s
     where s.edition_id = v_ed and (p_day is null or s.event_day_id = p_day)
     order by s.start_at, s.area, s.position;
end $$;

-- === Housekeeping ==========================================================

/** Erinnerung 48 Stunden vor der Schicht, genau einmal je Zuweisung. */
create or replace function send_shift_reminders() returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
declare r record; v_n integer := 0; v_locale text;
begin
  for r in
    select a.id, a.person_id, s.area, s.position, s.start_at, s.location, s.edition_id, s.briefing_md
      from shift_assignment a join shift s on s.id = a.shift_id
     where a.status in ('assigned', 'confirmed') and a.reminded_at is null
       and s.start_at between now() and now() + interval '48 hours'
  loop
    select coalesce(p.preferred_language, 'de') into v_locale from person p where p.id = r.person_id;
    perform queue_mail('shift_reminder', r.person_id,
                       jsonb_build_object('area', r.area, 'position', r.position,
                                          'start_at', mail_fmt_ts(r.start_at, coalesce((select e.timezone from event e where e.id = r.edition_id), 'Europe/Berlin'), v_locale),
                                          'location', coalesce(r.location, '')),
                       'shift_assignment', r.id);
    update shift_assignment set reminded_at = now() where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function send_shift_reminders() from public, anon, authenticated;

create or replace function run_volunteer_housekeeping() returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_reminders integer; v_promoted integer := 0; r record;
begin
  if not (auth.uid() is null or has_role('admin')) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_reminders := send_shift_reminders();
  -- Nachrücken auch dann, wenn eine Absage über einen anderen Weg kam.
  for r in select s.id from shift s
            where s.active and s.end_at > now()
              and exists (select 1 from shift_assignment a where a.shift_id = s.id and a.status = 'waitlisted')
  loop
    v_promoted := v_promoted + promote_shift_waitlist(r.id);
  end loop;
  return jsonb_build_object('reminders', v_reminders, 'promoted', v_promoted);
end $$;
revoke execute on function run_volunteer_housekeeping() from public, anon, authenticated;

create or replace function run_application_housekeeping() returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_expired integer; v_promoted integer := 0; v_reminders integer; v_free integer; v_n integer; r record; v_partner jsonb; v_volunteers jsonb;
begin
  if not (auth.uid() is null or has_role('admin') or has_role('programme_team')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_expired := expire_overdue_applications();
  for r in
    select s.id, s.capacity
    from session s
    where s.access_mode = 'application' and s.capacity is not null
      and exists (select 1 from decision_release d where d.session_id = s.id)
      and exists (select 1 from application a where a.session_id = s.id and a.status = 'waitlisted')
  loop
    select r.capacity - count(*) into v_free
      from application a where a.session_id = r.id and a.status in ('accepted', 'promoted', 'confirmed');
    if v_free > 0 then
      v_n := promote_waitlist(r.id, v_free);
      v_promoted := v_promoted + coalesce(v_n, 0);
    end if;
  end loop;
  v_reminders := send_presentation_reminders();
  v_partner := run_partner_housekeeping();
  v_volunteers := run_volunteer_housekeeping();
  if v_expired > 0 or v_promoted > 0 then
    insert into audit_log (action, object_type, object_id, after)
    values ('application.housekeeping', 'system', 'cron', jsonb_build_object('expired', v_expired, 'promoted', v_promoted));
  end if;
  return jsonb_build_object('expired', v_expired, 'promoted', v_promoted, 'reminders', v_reminders,
                            'partner', v_partner, 'volunteers', v_volunteers);
end $$;

-- === Mail-Vorlagen =========================================================

insert into mail_template (key, locale, version, subject, body_md, description, active) values
('volunteer_applied', 'de', 1, 'Deine Bewerbung als Volunteer ist da',
 E'Hallo {{first_name}},\n\ndeine Bewerbung als Volunteer für **{{edition}}** ist bei uns eingegangen. Wir schauen sie durch und melden uns mit der Zusage und deinen Schichten.\n\nDein Profil: [Volunteer-Bereich]({{portal_url}}/volunteers)\n\nDanke und bis bald,\nChefTreff',
 'Eingangsbestätigung der Volunteer-Bewerbung', true),
('volunteer_applied', 'en', 1, 'We received your volunteer application',
 E'Hi {{first_name}},\n\nyour volunteer application for **{{edition}}** has reached us. We will review it and get back to you with the confirmation and your shifts.\n\nYour profile: [Volunteer area]({{portal_url}}/volunteers)\n\nThanks and see you soon,\nChefTreff',
 'Receipt confirmation of the volunteer application', true),
('volunteer_accepted', 'de', 1, 'Du bist dabei — Volunteer bei {{edition}}',
 E'Hallo {{first_name}},\n\nwir freuen uns: du bist als Volunteer für **{{edition}}** dabei. Deine Schichten siehst du im Portal, sobald die Einteilung steht — bitte bestätige sie dort.\n\n{{note}}\n\nZu deinen Schichten: [Volunteer-Bereich]({{portal_url}}/volunteers/schichten)\n\nBis bald,\nChefTreff',
 'Zusage an eine Volunteer-Bewerbung', true),
('volunteer_accepted', 'en', 1, 'You are in — volunteering at {{edition}}',
 E'Hi {{first_name}},\n\ngood news: you are on the volunteer team for **{{edition}}**. Your shifts will appear in the portal once the plan is set — please confirm them there.\n\n{{note}}\n\nYour shifts: [Volunteer area]({{portal_url}}/volunteers/schichten)\n\nSee you soon,\nChefTreff',
 'Acceptance of a volunteer application', true),
('volunteer_declined', 'de', 1, 'Deine Volunteer-Bewerbung für {{edition}}',
 E'Hallo {{first_name}},\n\ndanke, dass du dich als Volunteer für **{{edition}}** beworben hast. Diesmal hat es leider nicht geklappt — es gab mehr Bewerbungen als Plätze.\n\n{{note}}\n\nWir freuen uns, wenn du es beim nächsten Mal wieder versuchst.\n\nViele Grüße,\nChefTreff',
 'Absage an eine Volunteer-Bewerbung', true),
('volunteer_declined', 'en', 1, 'Your volunteer application for {{edition}}',
 E'Hi {{first_name}},\n\nthank you for applying as a volunteer for **{{edition}}**. Unfortunately it did not work out this time — there were more applications than places.\n\n{{note}}\n\nWe would be glad to see you apply again next time.\n\nBest,\nChefTreff',
 'Rejection of a volunteer application', true),
('shift_assigned', 'de', 1, 'Deine Schicht: {{area}} am {{start_at}}',
 E'Hallo {{first_name}},\n\ndu bist eingeteilt:\n\n- **{{area}} · {{position}}**\n- {{start_at}}\n- {{location}}\n\nBitte bestätige die Schicht im Portal, damit wir sicher planen können. Wenn es nicht passt, sag bitte ebenfalls dort ab — dann rückt jemand von der Warteliste nach.\n\n[Meine Schichten]({{portal_url}}/volunteers/schichten)\n\nBis bald,\nChefTreff',
 'Zuteilung einer Schicht (auch beim Nachrücken)', true),
('shift_assigned', 'en', 1, 'Your shift: {{area}} on {{start_at}}',
 E'Hi {{first_name}},\n\nyou are scheduled:\n\n- **{{area}} · {{position}}**\n- {{start_at}}\n- {{location}}\n\nPlease confirm the shift in the portal so we can plan reliably. If it does not work for you, decline it there as well — someone from the waiting list moves up.\n\n[My shifts]({{portal_url}}/volunteers/schichten)\n\nSee you soon,\nChefTreff',
 'Assignment of a shift (also when moving up from the waiting list)', true),
('shift_reminder', 'de', 1, 'Übermorgen: {{area}} um {{start_at}}',
 E'Hallo {{first_name}},\n\nkurze Erinnerung an deine Schicht:\n\n- **{{area}} · {{position}}**\n- {{start_at}}\n- {{location}}\n\nDas Briefing findest du im Portal.\n\n[Meine Schichten]({{portal_url}}/volunteers/schichten)\n\nBis gleich,\nChefTreff',
 'Erinnerung 48 Stunden vor der Schicht', true),
('shift_reminder', 'en', 1, 'Coming up: {{area}} at {{start_at}}',
 E'Hi {{first_name}},\n\na quick reminder of your shift:\n\n- **{{area}} · {{position}}**\n- {{start_at}}\n- {{location}}\n\nYou will find the briefing in the portal.\n\n[My shifts]({{portal_url}}/volunteers/schichten)\n\nSee you there,\nChefTreff',
 'Reminder 48 hours before the shift', true)
on conflict (key, locale) do nothing;

select harden_definer_functions();
