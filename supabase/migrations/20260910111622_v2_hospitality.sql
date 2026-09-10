-- =============================================================================
-- 0030 · v2 Hospitality (Welle 2 A5): Kontingente, Buchungen, Freischaltung, Warteliste
--   hospitality_quota (je Edition: hotel mit Tier standard/premium/vip · shuttle), hospitality_booking
--   Gate: speaker_profile.hospitality_status in (eligible, requested, booked) UND Consent hospitality_data
--   des Speakers; Hotels nur bis zum eigenen hotel_tier; Überbuchung ⇒ waitlisted statt Fehler.
--   Team (is_staff) bestätigt/lehnt ab und pflegt Kontingente; Bestätigung löst Mail hospitality_confirmed aus.
--   Seed 2027: Radisson Blu Hamburg Dammtor (standard), Grand Elysée (premium), The Fontenay (vip) mit
--   Platzhalter-Kapazitäten (Zahlen von Laura bis 01.11.), zwei inaktive Shuttle-Platzhalter.
-- =============================================================================
set search_path = public, extensions;

create table if not exists hospitality_quota (
  id             uuid primary key default gen_random_uuid(),
  edition_id     uuid not null references event (id) on delete cascade,
  kind           text not null check (kind in ('hotel', 'shuttle')),
  tier           text,                                   -- vocab hotel_tier (nur hotel)
  label_de       text not null,
  label_en       text not null,
  description_de text,
  description_en text,
  location       text,                                   -- Adresse bzw. Abholort
  capacity       integer not null default 0 check (capacity >= 0),   -- hotel: Zimmer · shuttle: Plätze
  window_from    timestamptz,                            -- hotel: erste Nacht · shuttle: Abfahrt
  window_to      timestamptz,                            -- hotel: letzte Nacht (Abreise) · shuttle: Ankunft
  notes          text,                                   -- intern
  active         boolean not null default true,
  sort_order     integer not null default 100,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check ((kind = 'hotel') = (tier is not null))
);
create index if not exists hospitality_quota_edition_idx on hospitality_quota (edition_id, kind, active);
comment on table hospitality_quota is 'Hospitality-Kontingente je Edition: Hotels nach Tier, Shuttles. Kapazität hotel = Zimmer, shuttle = Plätze.';
drop trigger if exists trg_hospitality_quota_updated on hospitality_quota;
create trigger trg_hospitality_quota_updated before update on hospitality_quota for each row execute function set_updated_at();

create table if not exists hospitality_booking (
  id           uuid primary key default gen_random_uuid(),
  quota_id     uuid not null references hospitality_quota (id) on delete restrict,
  profile_id   uuid not null references speaker_profile (id) on delete cascade,
  kind         text not null check (kind in ('hotel', 'shuttle')),
  status       text not null default 'requested' check (status in ('requested', 'confirmed', 'waitlisted', 'cancelled')),
  guests       integer not null default 1 check (guests between 1 and 4),
  details      jsonb not null default '{}'::jsonb,       -- hotel: check_in, check_out, room_type, special · shuttle: pickup_location, passengers, arrival_info
  created_by   uuid references person (id) on delete set null,
  confirmed_by uuid references person (id) on delete set null,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  team_note    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists hospitality_booking_quota_idx on hospitality_booking (quota_id, status);
create index if not exists hospitality_booking_profile_idx on hospitality_booking (profile_id, status);
comment on table hospitality_booking is 'Hotel-/Shuttle-Buchungen der Speaker; requested → confirmed durch das Team, waitlisted bei Überbuchung.';
drop trigger if exists trg_hospitality_booking_updated on hospitality_booking;
create trigger trg_hospitality_booking_updated before update on hospitality_booking for each row execute function set_updated_at();

alter table hospitality_quota enable row level security;
alter table hospitality_booking enable row level security;
drop policy if exists hq_read on hospitality_quota;
create policy hq_read on hospitality_quota for select to authenticated using (active or is_staff());
drop policy if exists hb_read on hospitality_booking;
create policy hb_read on hospitality_booking for select to authenticated using (
  exists (select 1 from speaker_profile sp where sp.id = profile_id and (sp.person_id = current_person_id() or sp.assistant_person_id = current_person_id()))
  or can_manage_speaker(profile_id) or is_staff());
revoke all on hospitality_quota, hospitality_booking from anon;
revoke insert, update, delete on hospitality_quota, hospitality_booking from authenticated;
grant select on hospitality_quota, hospitality_booking to authenticated;
grant all on hospitality_quota, hospitality_booking to service_role;

-- === Helfer ==================================================================
-- Belegung eines Kontingents: hotel zählt Buchungen (Zimmer), shuttle zählt Gäste (Plätze); requested + confirmed
create or replace function hospitality_used(p_quota_id uuid) returns integer
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(case when q.kind = 'hotel'
                       then (select count(*) from hospitality_booking b where b.quota_id = q.id and b.status in ('requested', 'confirmed'))
                       else (select sum(b.guests) from hospitality_booking b where b.quota_id = q.id and b.status in ('requested', 'confirmed')) end, 0)::integer
  from hospitality_quota q where q.id = p_quota_id
$$;

-- Freischaltung eines Profils: Status + Consent des Speakers. Liefert NULL, wenn alles passt, sonst den Grund.
create or replace function hospitality_block_reason(p_profile_id uuid) returns text
language sql stable security definer set search_path = public, extensions as $$
  select case
    when sp.hospitality_status not in ('eligible', 'requested', 'booked') then 'status'
    when not coalesce((select c.granted from consent_current c where c.person_id = sp.person_id and c.consent_type = 'hospitality_data'), false) then 'consent'
    else null end
  from speaker_profile sp where sp.id = p_profile_id
$$;

create or replace function hotel_tier_rank(p_tier text) returns integer
language sql stable set search_path = public, extensions as $$
  select coalesce((select sort_order from vocab_term where vocabulary = 'hotel_tier' and key = p_tier), 0)
$$;

-- Profil des Aufrufers (Speaker oder Assistenz) für die Edition
create or replace function my_speaker_profile_id(p_edition_id uuid default null) returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select sp.id from speaker_profile sp
  where (sp.person_id = current_person_id() or sp.assistant_person_id = current_person_id())
    and (p_edition_id is null or sp.edition_id = p_edition_id)
  order by (sp.person_id = current_person_id()) desc, sp.created_at desc limit 1
$$;

-- === Speaker: Optionen, eigene Buchungen, buchen, stornieren ====================
create or replace function hospitality_options(p_edition_id uuid default null)
returns table (
  quota_id uuid, kind text, tier text, label_de text, label_en text, description_de text, description_en text, location text,
  capacity integer, used integer, free integer, window_from timestamptz, window_to timestamptz,
  eligible boolean, block_reason text, my_booking jsonb
)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_sp speaker_profile%rowtype; v_reason text;
begin
  select * into v_sp from speaker_profile where id = my_speaker_profile_id(p_edition_id);
  if not found then return; end if;
  v_reason := hospitality_block_reason(v_sp.id);
  return query
    select q.id, q.kind, q.tier, q.label_de, q.label_en, q.description_de, q.description_en, q.location,
           q.capacity, hospitality_used(q.id), greatest(q.capacity - hospitality_used(q.id), 0), q.window_from, q.window_to,
           (v_reason is null), v_reason,
           (select to_jsonb(b) from (select hb.id, hb.status, hb.guests, hb.details, hb.created_at, hb.confirmed_at, hb.team_note
                                     from hospitality_booking hb where hb.quota_id = q.id and hb.profile_id = v_sp.id and hb.status <> 'cancelled'
                                     order by hb.created_at desc limit 1) b)
    from hospitality_quota q
    where q.edition_id = v_sp.edition_id and q.active
      and (q.kind = 'shuttle' or hotel_tier_rank(q.tier) <= hotel_tier_rank(v_sp.hotel_tier))
    order by q.kind, q.sort_order, q.window_from nulls last;
end $$;

create or replace function my_hospitality(p_edition_id uuid default null)
returns table (id uuid, quota_id uuid, kind text, tier text, label_de text, label_en text, location text, window_from timestamptz, window_to timestamptz,
               status text, guests integer, details jsonb, team_note text, created_at timestamptz, confirmed_at timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  select b.id, b.quota_id, b.kind, q.tier, q.label_de, q.label_en, q.location, q.window_from, q.window_to,
         b.status, b.guests, b.details, b.team_note, b.created_at, b.confirmed_at
  from hospitality_booking b join hospitality_quota q on q.id = b.quota_id
  where b.profile_id = my_speaker_profile_id(p_edition_id)
  order by b.status = 'cancelled', b.kind, q.window_from nulls last, b.created_at
$$;

create or replace function book_hospitality(p_quota_id uuid, p_details jsonb default '{}'::jsonb, p_guests integer default 1) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_me uuid := current_person_id(); v_q hospitality_quota%rowtype; v_sp speaker_profile%rowtype; v_reason text; v_status text; v_id uuid; v_need integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_q from hospitality_quota where id = p_quota_id for update;
  if not found or not v_q.active then raise exception 'quota_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = my_speaker_profile_id(v_q.edition_id) for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  v_reason := hospitality_block_reason(v_sp.id);
  if v_reason is not null then raise exception 'not_eligible' using errcode = 'P0001', detail = v_reason; end if;
  if v_q.kind = 'hotel' and hotel_tier_rank(v_q.tier) > hotel_tier_rank(v_sp.hotel_tier) then
    raise exception 'not allowed' using errcode = '42501', detail = 'hotel_tier';
  end if;
  if p_guests is null or p_guests < 1 or p_guests > 4 then raise exception 'invalid_guests' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_details, '{}'::jsonb)) <> 'object' then raise exception 'invalid_details' using errcode = '22023'; end if;
  -- ein aktives Hotel je Profil, ein aktiver Platz je Shuttle
  if exists (select 1 from hospitality_booking b where b.profile_id = v_sp.id and b.status <> 'cancelled'
              and ((v_q.kind = 'hotel' and b.kind = 'hotel') or (v_q.kind = 'shuttle' and b.quota_id = v_q.id))) then
    raise exception 'already_booked' using errcode = 'P0001';
  end if;
  v_need := case when v_q.kind = 'hotel' then 1 else p_guests end;
  v_status := case when hospitality_used(v_q.id) + v_need <= v_q.capacity then 'requested' else 'waitlisted' end;
  insert into hospitality_booking (quota_id, profile_id, kind, status, guests, details, created_by)
  values (v_q.id, v_sp.id, v_q.kind, v_status, p_guests, coalesce(p_details, '{}'::jsonb), v_me)
  returning id into v_id;
  if v_sp.hospitality_status = 'eligible' then
    update speaker_profile set hospitality_status = 'requested' where id = v_sp.id;
  end if;
  perform log_audit('hospitality.book', 'hospitality_booking', v_id::text, null,
    jsonb_build_object('quota_id', v_q.id, 'kind', v_q.kind, 'status', v_status, 'guests', p_guests, 'profile_id', v_sp.id));
  return jsonb_build_object('id', v_id, 'status', v_status);
end $$;

create or replace function cancel_hospitality(p_booking_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_b hospitality_booking%rowtype; v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_next uuid;
begin
  select * into v_b from hospitality_booking where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_b.profile_id;
  if not (v_sp.person_id = v_me or v_sp.assistant_person_id = v_me or can_manage_speaker(v_sp.id) or is_staff()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_b.status = 'cancelled' then return; end if;
  update hospitality_booking set status = 'cancelled', cancelled_at = now() where id = p_booking_id;
  -- Wartelisten-Nachrücken: erster Wartender wird zur Anfrage (Team bestätigt)
  if v_b.status in ('requested', 'confirmed') then
    select id into v_next from hospitality_booking where quota_id = v_b.quota_id and status = 'waitlisted' order by created_at limit 1;
    if v_next is not null then update hospitality_booking set status = 'requested' where id = v_next; end if;
  end if;
  if not exists (select 1 from hospitality_booking b where b.profile_id = v_sp.id and b.status <> 'cancelled') and v_sp.hospitality_status in ('requested', 'booked') then
    update speaker_profile set hospitality_status = 'eligible' where id = v_sp.id;
  end if;
  perform log_audit('hospitality.cancel', 'hospitality_booking', p_booking_id::text, jsonb_build_object('status', v_b.status), jsonb_build_object('promoted', v_next));
end $$;

-- === Team: bestätigen, ablehnen, Kontingente, Überblick ===========================
create or replace function confirm_hospitality(p_booking_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_b hospitality_booking%rowtype; v_q hospitality_quota%rowtype; v_sp speaker_profile%rowtype; v_locale text;
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_b from hospitality_booking where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found' using errcode = 'P0002'; end if;
  if v_b.status = 'cancelled' then raise exception 'booking_cancelled' using errcode = 'P0001'; end if;
  select * into v_q from hospitality_quota where id = v_b.quota_id;
  select * into v_sp from speaker_profile where id = v_b.profile_id;
  update hospitality_booking set status = 'confirmed', confirmed_by = current_person_id(), confirmed_at = now(), team_note = coalesce(nullif(btrim(p_note), ''), team_note)
   where id = p_booking_id;
  update speaker_profile set hospitality_status = 'booked' where id = v_sp.id and hospitality_status in ('eligible', 'requested');
  select coalesce(case when p.preferred_language in ('de', 'en') then p.preferred_language end, 'en') into v_locale from person p where p.id = v_sp.person_id;
  perform queue_mail('hospitality_confirmed', v_sp.person_id,
    jsonb_build_object(
      'kind', v_q.kind,
      'quota_label', case when v_locale = 'de' then v_q.label_de else v_q.label_en end,
      'location', coalesce(v_q.location, ''),
      'window', coalesce(mail_fmt_ts(v_q.window_from, 'Europe/Berlin', v_locale), '') || case when v_q.window_to is not null then ' – ' || mail_fmt_ts(v_q.window_to, 'Europe/Berlin', v_locale) else '' end,
      'guests', v_b.guests,
      'details', (select string_agg(key || ': ' || value, ', ') from jsonb_each_text(v_b.details)),
      'team_note', coalesce(p_note, '')),
    'hospitality_booking', v_b.id);
  perform log_audit('hospitality.confirm', 'hospitality_booking', p_booking_id::text, jsonb_build_object('status', v_b.status), jsonb_build_object('status', 'confirmed', 'note', p_note));
end $$;

create or replace function decline_hospitality(p_booking_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_b hospitality_booking%rowtype;
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_b from hospitality_booking where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found' using errcode = 'P0002'; end if;
  update hospitality_booking set status = 'cancelled', cancelled_at = now(), team_note = coalesce(nullif(btrim(p_note), ''), team_note) where id = p_booking_id;
  perform log_audit('hospitality.decline', 'hospitality_booking', p_booking_id::text, jsonb_build_object('status', v_b.status), jsonb_build_object('note', p_note));
end $$;

create or replace function upsert_hospitality_quota(p_data jsonb) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid := nullif(p_data->>'id', '')::uuid;
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_id is null then
    insert into hospitality_quota (edition_id, kind, tier, label_de, label_en, description_de, description_en, location, capacity, window_from, window_to, notes, active, sort_order)
    values ((p_data->>'edition_id')::uuid, p_data->>'kind', nullif(p_data->>'tier', ''), p_data->>'label_de', p_data->>'label_en',
            nullif(p_data->>'description_de', ''), nullif(p_data->>'description_en', ''), nullif(p_data->>'location', ''),
            coalesce((p_data->>'capacity')::integer, 0), nullif(p_data->>'window_from', '')::timestamptz, nullif(p_data->>'window_to', '')::timestamptz,
            nullif(p_data->>'notes', ''), coalesce((p_data->>'active')::boolean, true), coalesce((p_data->>'sort_order')::integer, 100))
    returning id into v_id;
  else
    update hospitality_quota set
      label_de = coalesce(p_data->>'label_de', label_de), label_en = coalesce(p_data->>'label_en', label_en),
      description_de = case when p_data ? 'description_de' then nullif(p_data->>'description_de', '') else description_de end,
      description_en = case when p_data ? 'description_en' then nullif(p_data->>'description_en', '') else description_en end,
      location = case when p_data ? 'location' then nullif(p_data->>'location', '') else location end,
      capacity = coalesce((p_data->>'capacity')::integer, capacity),
      window_from = case when p_data ? 'window_from' then nullif(p_data->>'window_from', '')::timestamptz else window_from end,
      window_to = case when p_data ? 'window_to' then nullif(p_data->>'window_to', '')::timestamptz else window_to end,
      notes = case when p_data ? 'notes' then nullif(p_data->>'notes', '') else notes end,
      active = coalesce((p_data->>'active')::boolean, active),
      sort_order = coalesce((p_data->>'sort_order')::integer, sort_order),
      tier = case when p_data ? 'tier' then nullif(p_data->>'tier', '') else tier end
    where id = v_id;
    if not found then raise exception 'quota_not_found' using errcode = 'P0002'; end if;
  end if;
  perform log_audit('hospitality.quota', 'hospitality_quota', v_id::text, null, p_data);
  return v_id;
end $$;

create or replace function hospitality_admin_overview(p_edition_id uuid default null)
returns table (quota_id uuid, kind text, tier text, label_de text, label_en text, location text, capacity integer, used integer, waitlisted integer, active boolean,
               window_from timestamptz, window_to timestamptz, bookings jsonb)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select q.id, q.kind, q.tier, q.label_de, q.label_en, q.location, q.capacity, hospitality_used(q.id),
           (select count(*)::integer from hospitality_booking b where b.quota_id = q.id and b.status = 'waitlisted'), q.active, q.window_from, q.window_to,
           coalesce((select jsonb_agg(jsonb_build_object(
                        'id', b.id, 'status', b.status, 'guests', b.guests, 'details', b.details, 'team_note', b.team_note, 'created_at', b.created_at,
                        'profile_id', b.profile_id,
                        'speaker_name', (select btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) from speaker_profile sp join person p on p.id = sp.person_id where sp.id = b.profile_id))
                      order by b.status = 'waitlisted', b.created_at)
                     from hospitality_booking b where b.quota_id = q.id and b.status <> 'cancelled'), '[]'::jsonb)
    from hospitality_quota q
    where p_edition_id is null or q.edition_id = p_edition_id
    order by q.kind, q.sort_order, q.window_from nulls last;
end $$;

-- === Seed FLS27 ================================================================
insert into hospitality_quota (edition_id, kind, tier, label_de, label_en, description_de, description_en, location, capacity, window_from, window_to, notes, active, sort_order)
select e.id, v.kind, v.tier, v.label_de, v.label_en, v.description_de, v.description_en, v.location, v.capacity, v.window_from, v.window_to, v.notes, v.active, v.sort_order
from event e
join (values
  ('hotel', 'standard', 'Radisson Blu Hotel Hamburg Dammtor', 'Radisson Blu Hotel Hamburg Dammtor', 'Standard-Hotel für Speaker, direkt am CCH.', 'Standard hotel for speakers, right next to the CCH.', 'Marseiller Str. 2, 20355 Hamburg', 40, '2027-04-15 15:00 Europe/Berlin'::timestamptz, '2027-04-18 11:00 Europe/Berlin'::timestamptz, 'Platzhalter-Kapazität, Zahlen von Laura bis 01.11.', true, 10),
  ('hotel', 'premium', 'Grand Elysée Hamburg', 'Grand Elysée Hamburg', 'Hotel der Premium-Kategorie, wenige Minuten zum CCH.', 'Premium hotel, a few minutes from the CCH.', 'Rothenbaumchaussee 10, 20148 Hamburg', 15, '2027-04-15 15:00 Europe/Berlin'::timestamptz, '2027-04-18 11:00 Europe/Berlin'::timestamptz, 'Platzhalter-Kapazität, Zahlen von Laura bis 01.11.', true, 20),
  ('hotel', 'vip', 'The Fontenay', 'The Fontenay', 'Hotel für VIP-Speaker an der Außenalster.', 'Hotel for VIP speakers on the Outer Alster.', 'Fontenay 10, 20354 Hamburg', 5, '2027-04-15 15:00 Europe/Berlin'::timestamptz, '2027-04-18 11:00 Europe/Berlin'::timestamptz, 'Platzhalter-Kapazität, Zahlen von Laura bis 01.11.', true, 30),
  ('shuttle', null, 'Shuttle Hotel → CCH (Freitag)', 'Shuttle hotel → CCH (Friday)', 'Abfahrt am Hotel, Ankunft am Speaker-Eingang des CCH.', 'Departs from the hotel, arrives at the CCH speaker entrance.', 'Radisson Blu / Grand Elysée', 16, '2027-04-16 11:30 Europe/Berlin'::timestamptz, '2027-04-16 12:00 Europe/Berlin'::timestamptz, 'Platzhalter, inaktiv bis Kontingente feststehen.', false, 40),
  ('shuttle', null, 'Shuttle Hotel → CCH (Samstag)', 'Shuttle hotel → CCH (Saturday)', 'Abfahrt am Hotel, Ankunft am Speaker-Eingang des CCH.', 'Departs from the hotel, arrives at the CCH speaker entrance.', 'Radisson Blu / Grand Elysée', 16, '2027-04-17 10:30 Europe/Berlin'::timestamptz, '2027-04-17 11:00 Europe/Berlin'::timestamptz, 'Platzhalter, inaktiv bis Kontingente feststehen.', false, 41)
) as v(kind, tier, label_de, label_en, description_de, description_en, location, capacity, window_from, window_to, notes, active, sort_order) on true
where e.is_edition and e.slug = 'fls27'
  and not exists (select 1 from hospitality_quota q where q.edition_id = e.id and q.label_en = v.label_en);

-- === Mail-Vorlage ==============================================================
insert into mail_template (key, locale, version, subject, body_md, description, active)
select v.key, v.locale, v.version, v.subject, v.body_md, v.description, v.active from (values
  ('hospitality_confirmed', 'en', 1, 'Confirmed: {{quota_label}}',
   E'Hi {{first_name}},\n\nyour booking is confirmed:\n\n- **{{quota_label}}**\n- {{window}}\n- {{location}}\n- Guests: {{guests}}\n\n{{details}}\n\n{{team_note}}\n\nYou can review it any time in the portal: [Travel & hospitality]({{portal_url}}/speaker/travel)\n\nBest,\nChefTreff',
   'Hospitality booking confirmed', true),
  ('hospitality_confirmed', 'de', 1, 'Bestätigt: {{quota_label}}',
   E'Hallo {{first_name}},\n\ndeine Buchung ist bestätigt:\n\n- **{{quota_label}}**\n- {{window}}\n- {{location}}\n- Gäste: {{guests}}\n\n{{details}}\n\n{{team_note}}\n\nDu findest sie jederzeit im Portal: [Anreise & Hotel]({{portal_url}}/speaker/travel)\n\nViele Grüße\nChefTreff',
   'Hospitality-Buchung bestätigt', true)
) as v(key, locale, version, subject, body_md, description, active)
where not exists (select 1 from mail_template t where t.key = v.key and t.locale = v.locale);

select harden_definer_functions();
