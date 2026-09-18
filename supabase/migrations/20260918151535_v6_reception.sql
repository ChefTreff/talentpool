-- 0125 · Welle 6 · Speaker Reception als eigenes Objekt (A7.4, SPK-003)
--
-- Angewendet von der Architektur-Session am 18.09.2026 als 20260918151535.
--
-- Vorschlag der Build-Session Speaker-Domäne. Anwenden, Umbenennen und der
-- Eintrag ins Entscheidungslog gehören der Architektur-/Security-Session.
-- Nummer 0125 zugeteilt.
--
-- Anlass: Im Alt-Portal meldeten sich Speaker über Luma zur Reception an. Bei
-- uns gibt es bisher nur das Kennzeichen `speaker_profile.reception_eligible`
-- — das Team weiss, **wer darf**, aber niemand weiss, **wer kommt**.
--
-- Konrad am 17.09.: „Es braucht Datum, Ort und Obergrenze. Vom Funktionsumfang
-- soll es wie eine Luma Event-Seite sein mit der Verwaltung bei uns im
-- Speaker-Admin Bereich." Damit ist die Reception ein eigenes Objekt mit
-- Anmeldung, kein Haken am Profil.
--
-- **Das Kennzeichen bleibt und wird zur Eintrittskarte.** `reception_eligible`
-- entscheidet weiterhin, wer die Reception überhaupt sieht; die Anmeldung kommt
-- daneben. Zwei Fragen, zwei Felder: „darf" und „kommt".
--
-- **Die Obergrenze zählt Plätze, nicht Zusagen.** Wer mit Begleitung kommt,
-- belegt zwei. Alles andere wäre eine Zahl, auf die sich niemand verlassen
-- kann — und am Abend stehen Leute vor der Tür.
--
-- **Kein zweiter Name.** Die Reception heisst im Portal, was in der Tabelle
-- steht; „Speaker Reception" ist Arbeitstitel (Konrads Checkliste), und der
-- endgültige Name wird ein Datensatz sein, keine Migration.
--
-- Fehlerschlüssel: 28000 · 42501 · P0002 `reception_not_found` ·
-- 22023 `invalid_reception` (+ detail), `fields_required`, `invalid_rsvp` ·
-- P0001 `reception_full` (detail = freie Plätze), `reception_closed`
-- (detail = Frist), `reception_not_eligible`.

set search_path = public, extensions;

-- === Vokabular ===============================================================

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order) values
  ('reception_rsvp', 'yes', 'Zugesagt', 'Attending',     1),
  ('reception_rsvp', 'no',  'Abgesagt', 'Not attending', 2)
on conflict (vocabulary, key) do nothing;

-- === Die Veranstaltung =======================================================

create table if not exists speaker_reception (
  id             uuid primary key default gen_random_uuid(),
  edition_id     uuid not null references event(id) on delete cascade,
  title_de       text not null,
  title_en       text not null,
  description_de text,
  description_en text,
  location       text not null,
  address        text,
  starts_at      timestamptz not null,
  ends_at        timestamptz,
  -- NULL heisst „keine Obergrenze". Eine 0 hiesse „niemand" und wäre eine
  -- andere Aussage; der CHECK hält sie draussen.
  capacity       integer,
  rsvp_deadline  timestamptz,
  -- Solange unveröffentlicht, sieht sie nur das Team. Ein Datum, das sich noch
  -- ändert, soll niemand in den Kalender schreiben.
  published      boolean not null default false,
  created_by     uuid references person(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint reception_capacity_chk check (capacity is null or capacity > 0),
  constraint reception_ends_chk     check (ends_at is null or ends_at >= starts_at)
);

comment on table speaker_reception is
  'Speaker Reception je Edition (A7.4): Zeit, Ort, Beschreibung, Obergrenze. Anmeldung in speaker_reception_rsvp. Sichtbar nur für Speaker mit reception_eligible.';
comment on column speaker_reception.capacity is
  'Obergrenze in **Plätzen**, nicht Zusagen — eine Begleitung belegt einen zweiten. NULL = unbegrenzt.';

create index if not exists speaker_reception_edition_idx
  on speaker_reception (edition_id, starts_at);

alter table speaker_reception enable row level security;
revoke all on speaker_reception from anon, authenticated;

drop trigger if exists trg_speaker_reception_touch on speaker_reception;
create trigger trg_speaker_reception_touch before update on speaker_reception
  for each row execute function set_updated_at();

-- === Die Anmeldung ===========================================================

create table if not exists speaker_reception_rsvp (
  reception_id uuid not null references speaker_reception(id) on delete cascade,
  profile_id   uuid not null references speaker_profile(id) on delete cascade,
  status       text not null default 'yes',
  guests       integer not null default 0,
  note         text,
  -- `responded_at` ist die **fachliche** Angabe: wann hat die Person
  -- geantwortet. `updated_at` ist die technische daneben und gehört zum
  -- Trigger unten; ohne sie stirbt `set_updated_at()` beim ersten Ändern mit
  -- 42703 (Befund aus dem Probelauf der Architektur-Session).
  responded_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (reception_id, profile_id),
  constraint reception_rsvp_status_chk check (status in ('yes', 'no')),
  constraint reception_rsvp_guests_chk check (guests between 0 and 3)
);

comment on table speaker_reception_rsvp is
  'Zu- und Absagen zur Reception. Eine Zeile je Profil; eine Absage bleibt stehen, damit das Team den Unterschied zwischen „abgesagt" und „nie geantwortet" sieht.';

alter table speaker_reception_rsvp enable row level security;
revoke all on speaker_reception_rsvp from anon, authenticated;

drop trigger if exists trg_reception_rsvp_touch on speaker_reception_rsvp;
create trigger trg_reception_rsvp_touch before update on speaker_reception_rsvp
  for each row execute function set_updated_at();

-- === Belegte Plätze ==========================================================

/**
 * Wie viele Plätze sind belegt?
 *
 * Zusagen plus Begleitungen. Absagen zählen nicht, und eine Zeile, die auf
 * `no` steht, gibt ihren Platz wieder frei — das ist der Sinn einer Absage.
 */
create or replace function reception_taken(p_reception_id uuid) returns integer
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(sum(1 + r.guests), 0)::integer
    from speaker_reception_rsvp r
   where r.reception_id = p_reception_id and r.status = 'yes'
$$;
revoke execute on function reception_taken(uuid) from public, anon, authenticated;

-- === Speaker-Sicht ===========================================================

/**
 * Die Receptions, zu denen diese Person eingeladen ist.
 *
 * Zwei Bedingungen, beide in der Datenbank: die Reception ist veröffentlicht,
 * und das Profil trägt `reception_eligible`. Wer nicht eingeladen ist, bekommt
 * eine leere Liste — keine Fehlermeldung, die verrät, dass es etwas gibt.
 *
 * `free` ist die Auskunft, die die Oberfläche braucht, ohne die Gästeliste zu
 * sehen: eine Zahl, keine Namen.
 */
create or replace function my_receptions(p_edition_id uuid default null)
returns table (
  id uuid, title_de text, title_en text, description_de text, description_en text,
  location text, address text, starts_at timestamptz, ends_at timestamptz,
  capacity integer, taken integer, free integer, rsvp_deadline timestamptz,
  closed boolean, my_status text, my_guests integer, my_note text
)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_profile uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_profile := my_speaker_profile_id(p_edition_id);
  if v_profile is null then return; end if;
  if not coalesce((select sp.reception_eligible from speaker_profile sp where sp.id = v_profile), false) then
    return;
  end if;

  return query
    select e.id, e.title_de, e.title_en, e.description_de, e.description_en,
           e.location, e.address, e.starts_at, e.ends_at,
           e.capacity, reception_taken(e.id),
           case when e.capacity is null then null
                else greatest(e.capacity - reception_taken(e.id), 0) end,
           e.rsvp_deadline,
           e.rsvp_deadline is not null and now() > e.rsvp_deadline,
           r.status, r.guests, r.note
      from speaker_reception e
      join speaker_profile sp on sp.id = v_profile
      left join speaker_reception_rsvp r on r.reception_id = e.id and r.profile_id = v_profile
     where e.published
       and e.edition_id = sp.edition_id
     order by e.starts_at;
end $$;

comment on function my_receptions(uuid) is
  'Veröffentlichte Receptions der eigenen Edition — nur für Speaker mit reception_eligible, mit eigener Zu-/Absage und freien Plätzen (Zahl, keine Namen).';

/**
 * Zu- oder absagen.
 *
 * Die Obergrenze wird **hier** geprüft, nicht in der Oberfläche: zwei Personen,
 * die gleichzeitig auf „Zusagen" drücken, sehen beide denselben freien Platz.
 * Die eigene bisherige Zusage zählt dabei nicht mit — sonst könnte niemand
 * seine Begleitung nachtragen, wenn es eng wird.
 *
 * Eine Absage bleibt als Zeile stehen. Das Team soll „abgesagt" von „nie
 * geantwortet" unterscheiden können; wer die Zeile löschte, verlöre genau das.
 */
create or replace function set_reception_rsvp(
  p_reception_id uuid, p_status text, p_guests integer default 0, p_note text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_me uuid := current_person_id(); v_profile uuid; v_e speaker_reception%rowtype;
  v_guests integer := coalesce(p_guests, 0); v_belegt integer; v_eigene integer := 0; v_frei integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_status not in ('yes', 'no') then
    raise exception 'invalid_rsvp' using errcode = '22023', detail = coalesce(p_status, 'null');
  end if;
  if v_guests < 0 or v_guests > 3 then
    raise exception 'invalid_rsvp' using errcode = '22023', detail = 'guests:' || v_guests::text;
  end if;

  select * into v_e from speaker_reception where id = p_reception_id;
  if not found or not v_e.published then
    raise exception 'reception_not_found' using errcode = 'P0002';
  end if;

  v_profile := my_speaker_profile_id(v_e.edition_id);
  if v_profile is null
     or not coalesce((select sp.reception_eligible from speaker_profile sp where sp.id = v_profile), false) then
    raise exception 'reception_not_eligible' using errcode = 'P0001', detail = 'not_invited';
  end if;

  if v_e.rsvp_deadline is not null and now() > v_e.rsvp_deadline then
    raise exception 'reception_closed' using errcode = 'P0001',
      detail = to_char(v_e.rsvp_deadline, 'YYYY-MM-DD HH24:MI');
  end if;

  if p_status = 'yes' and v_e.capacity is not null then
    select coalesce(sum(1 + r.guests), 0)::integer into v_eigene
      from speaker_reception_rsvp r
     where r.reception_id = p_reception_id and r.profile_id = v_profile and r.status = 'yes';
    v_belegt := reception_taken(p_reception_id) - v_eigene;
    v_frei := v_e.capacity - v_belegt;
    if 1 + v_guests > v_frei then
      raise exception 'reception_full' using errcode = 'P0001', detail = greatest(v_frei, 0)::text;
    end if;
  end if;

  insert into speaker_reception_rsvp (reception_id, profile_id, status, guests, note, responded_at)
  values (p_reception_id, v_profile, p_status,
          case when p_status = 'yes' then v_guests else 0 end,
          nullif(btrim(p_note), ''), now())
  on conflict (reception_id, profile_id) do update
    set status = excluded.status, guests = excluded.guests,
        note = excluded.note, responded_at = now();

  -- Ins Protokoll gehen Status und Platzzahl, nicht der Freitext: was jemand
  -- als Hinweis schreibt (Unverträglichkeit, Begleitung), ist seine Sache.
  perform log_audit('speaker.reception_rsvp', 'speaker_reception', p_reception_id::text, null,
    jsonb_build_object('profile_id', v_profile, 'status', p_status, 'guests', v_guests));

  return jsonb_build_object('status', p_status, 'guests', v_guests,
                            'taken', reception_taken(p_reception_id));
end $$;

comment on function set_reception_rsvp(uuid, text, integer, text) is
  'Zu- oder Absage eines eingeladenen Speakers. Obergrenze, Frist und Einladung werden hier geprüft; eine Absage bleibt als Zeile stehen.';

-- === Team-Sicht ==============================================================

/** Alle Receptions einer Edition mit Stand — Speaker-Admin. */
create or replace function receptions_admin(p_edition_id uuid default null)
returns table (
  id uuid, edition_id uuid, title_de text, title_en text,
  description_de text, description_en text, location text, address text,
  starts_at timestamptz, ends_at timestamptz, capacity integer,
  rsvp_deadline timestamptz, published boolean,
  taken integer, yes_count integer, no_count integer, invited_count integer
)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select coalesce(p_edition_id,
                  (select ev.id from event ev where ev.is_edition order by ev.start_date desc limit 1))
    into v_ed;
  if not is_speaker_team(v_ed) then raise exception 'not allowed' using errcode = '42501'; end if;

  return query
    select e.id, e.edition_id, e.title_de, e.title_en,
           e.description_de, e.description_en, e.location, e.address,
           e.starts_at, e.ends_at, e.capacity, e.rsvp_deadline, e.published,
           reception_taken(e.id),
           (select count(*)::integer from speaker_reception_rsvp r
             where r.reception_id = e.id and r.status = 'yes'),
           (select count(*)::integer from speaker_reception_rsvp r
             where r.reception_id = e.id and r.status = 'no'),
           -- Wie viele dürften kommen? Der Nenner zum Rücklauf.
           (select count(*)::integer from speaker_profile sp
             where sp.edition_id = e.edition_id and sp.reception_eligible)
      from speaker_reception e
     where e.edition_id = v_ed
     order by e.starts_at;
end $$;

/**
 * Die Gästeliste einer Reception.
 *
 * Namen als **benannte Spalten** aus `person` — seit 0100 stehen dort
 * Gesundheitsangaben, die ein `select *` oder `to_jsonb` mit herausgäbe.
 */
create or replace function reception_guests(p_reception_id uuid)
returns table (
  profile_id uuid, first_name text, last_name text,
  status text, guests integer, note text, responded_at timestamptz
)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid;
begin
  select e.edition_id into v_ed from speaker_reception e where e.id = p_reception_id;
  if v_ed is null then raise exception 'reception_not_found' using errcode = 'P0002'; end if;
  if not is_speaker_team(v_ed) then raise exception 'not allowed' using errcode = '42501'; end if;

  return query
    select r.profile_id, p.first_name, p.last_name,
           r.status, r.guests, r.note, r.responded_at
      from speaker_reception_rsvp r
      join speaker_profile sp on sp.id = r.profile_id
      join person p on p.id = sp.person_id
     where r.reception_id = p_reception_id
     order by r.status, p.last_name, p.first_name;
end $$;

/** Anlegen und Ändern — Speaker-Team. */
create or replace function upsert_reception(p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_id uuid; v_ed uuid; v_start timestamptz; v_end timestamptz; v_cap integer;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_id := nullif(p_data->>'id', '')::uuid;

  -- Beim Ändern gilt die Edition des Datensatzes, nicht die im Aufruf: sonst
  -- liesse sich über eine fremde `edition_id` eine Reception übernehmen, für
  -- die man nicht zuständig ist (Lehre aus Review 0083).
  if v_id is not null then
    select e.edition_id into v_ed from speaker_reception e where e.id = v_id;
    if v_ed is null then raise exception 'reception_not_found' using errcode = 'P0002'; end if;
  else
    select coalesce(nullif(p_data->>'edition_id', '')::uuid,
                    (select ev.id from event ev where ev.is_edition order by ev.start_date desc limit 1))
      into v_ed;
  end if;
  if not is_speaker_team(v_ed) then raise exception 'not allowed' using errcode = '42501'; end if;

  v_start := nullif(btrim(p_data->>'starts_at'), '')::timestamptz;
  v_end   := nullif(btrim(p_data->>'ends_at'), '')::timestamptz;
  v_cap   := nullif(btrim(p_data->>'capacity'), '')::integer;
  if v_cap is not null and v_cap <= 0 then
    raise exception 'invalid_reception' using errcode = '22023', detail = 'capacity:' || v_cap::text;
  end if;
  if v_end is not null and v_start is not null and v_end < v_start then
    raise exception 'invalid_reception' using errcode = '22023', detail = 'ends_at';
  end if;

  if v_id is null then
    if nullif(btrim(p_data->>'title_de'), '') is null
       or nullif(btrim(p_data->>'title_en'), '') is null
       or nullif(btrim(p_data->>'location'), '') is null
       or v_start is null then
      raise exception 'fields_required' using errcode = '22023',
        detail = 'title_de, title_en, location, starts_at';
    end if;
    insert into speaker_reception (
      edition_id, title_de, title_en, description_de, description_en,
      location, address, starts_at, ends_at, capacity, rsvp_deadline, published, created_by)
    values (v_ed, btrim(p_data->>'title_de'), btrim(p_data->>'title_en'),
            nullif(btrim(p_data->>'description_de'), ''), nullif(btrim(p_data->>'description_en'), ''),
            btrim(p_data->>'location'), nullif(btrim(p_data->>'address'), ''),
            v_start, v_end, v_cap,
            nullif(btrim(p_data->>'rsvp_deadline'), '')::timestamptz,
            coalesce((p_data->>'published')::boolean, false), current_person_id())
    returning id into v_id;
  else
    -- Teilupdate über die mitgeschickten Schlüssel: was fehlt, bleibt stehen.
    update speaker_reception set
      title_de = coalesce(nullif(btrim(p_data->>'title_de'), ''), title_de),
      title_en = coalesce(nullif(btrim(p_data->>'title_en'), ''), title_en),
      description_de = case when p_data ? 'description_de' then nullif(btrim(p_data->>'description_de'), '') else description_de end,
      description_en = case when p_data ? 'description_en' then nullif(btrim(p_data->>'description_en'), '') else description_en end,
      location = coalesce(nullif(btrim(p_data->>'location'), ''), location),
      address = case when p_data ? 'address' then nullif(btrim(p_data->>'address'), '') else address end,
      starts_at = coalesce(v_start, starts_at),
      ends_at = case when p_data ? 'ends_at' then v_end else ends_at end,
      capacity = case when p_data ? 'capacity' then v_cap else capacity end,
      rsvp_deadline = case when p_data ? 'rsvp_deadline'
                           then nullif(btrim(p_data->>'rsvp_deadline'), '')::timestamptz
                           else rsvp_deadline end,
      published = coalesce((p_data->>'published')::boolean, published)
    where id = v_id;
  end if;

  perform log_audit('speaker.reception_saved', 'speaker_reception', v_id::text, null, p_data);
  return v_id;
end $$;

/**
 * Löschen — nur solange niemand zugesagt hat.
 *
 * Eine Reception mit Zusagen zu löschen, nähme Menschen ohne Nachricht einen
 * Termin aus dem Kalender. Wer sie absagen will, nimmt die Veröffentlichung
 * zurück; dann bleibt die Liste, und das Team kann anschreiben.
 */
create or replace function delete_reception(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_ed uuid; v_n integer;
begin
  select e.edition_id into v_ed from speaker_reception e where e.id = p_id;
  if v_ed is null then raise exception 'reception_not_found' using errcode = 'P0002'; end if;
  if not is_speaker_team(v_ed) then raise exception 'not allowed' using errcode = '42501'; end if;

  select count(*)::integer into v_n
    from speaker_reception_rsvp r where r.reception_id = p_id and r.status = 'yes';
  if v_n > 0 then
    raise exception 'invalid_reception' using errcode = '22023', detail = 'has_guests:' || v_n::text;
  end if;

  delete from speaker_reception where id = p_id;
  perform log_audit('speaker.reception_deleted', 'speaker_reception', p_id::text, null, null);
end $$;

select harden_definer_functions();
