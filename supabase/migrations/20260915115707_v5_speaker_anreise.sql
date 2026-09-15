-- 0098 · Welle 5 · An- und Abreise der Speaker (Abgleich 15.09., Punkt 1)
--
-- Angewendet von der Architektur-Session am 15.09.2026 nach Review.
--
-- Bisher landeten Ankunftszeit und Zugnummer bestenfalls als Freitext im
-- `details`-JSON einer Shuttle-Buchung. Daraus lässt sich keine Ankunftsliste
-- bauen — und genau die braucht die Betreuung: wer wann am Dammtor steht, wer
-- abgeholt wird, welche Bühne umgeplant werden muss, weil ein Flug später
-- landet.
--
-- **Datum und Uhrzeit getrennt, nicht als `timestamptz`.** Wer „14:30" einträgt,
-- meint Ortszeit in Hamburg, nicht einen Zeitpunkt in einer Zone. Ein
-- `timestamptz` würde eine Genauigkeit behaupten, die die Eingabe nicht hat,
-- und beim Lesen in einer anderen Zone stünde eine andere Uhrzeit da.
-- Sortiert wird über das Paar, das reicht.
--
-- **Eine Zeile je Speaker-Profil**, nicht je Richtung: der Primärschlüssel ist
-- `profile_id`. Hin- und Rückweg gehören zusammen und werden zusammen gepflegt.
--
-- Wer schreibt: der Speaker selbst **und** seine Assistenz — dieselbe Grenze
-- wie bei Hotel und Shuttle. Wer liest: das Speaker-Team und die Lead-Person,
-- der der Speaker zugeordnet ist (`can_manage_speaker`), sowie die Produktion.
--
-- Fehlerschlüssel: 28000 ohne Login · 42501 ohne Recht ·
-- 22023 `invalid_travel_mode` · P0002 `speaker_not_found`.

set search_path = public, extensions;

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active) values
  ('travel_mode', 'bahn',      'Bahn',          'Train',       1, true),
  ('travel_mode', 'flug',      'Flug',          'Flight',      2, true),
  ('travel_mode', 'auto',      'Auto',          'Car',         3, true),
  ('travel_mode', 'fernbus',   'Fernbus',       'Coach',       4, true),
  ('travel_mode', 'vor_ort',   'Wohnt in Hamburg', 'Lives in Hamburg', 5, true),
  ('travel_mode', 'sonstiges', 'Anders',        'Other',       9, true)
on conflict (vocabulary, key) do nothing;

create table if not exists speaker_travel (
  profile_id      uuid primary key references speaker_profile(id) on delete cascade,
  arrival_date    date,
  arrival_time    time,
  arrival_mode    text,
  arrival_ref     text,
  departure_date  date,
  departure_time  time,
  departure_mode  text,
  departure_ref   text,
  needs_pickup    boolean not null default false,
  note            text,
  updated_by      uuid references person(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Eine Abreise vor der Anreise ist ein Tippfehler, kein Reiseplan.
  constraint speaker_travel_order_chk
    check (arrival_date is null or departure_date is null or departure_date >= arrival_date)
);

comment on table speaker_travel is
  'An- und Abreise je Speaker-Profil (Abgleich 15.09.). Datum und Uhrzeit getrennt: die Eingabe meint Ortszeit in Hamburg, kein `timestamptz`.';
comment on column speaker_travel.needs_pickup is
  'Wunsch nach Abholung. Die Buchung selbst läuft weiter über das Shuttle-Kontingent in `hospitality_booking`.';

create index if not exists speaker_travel_arrival_idx on speaker_travel (arrival_date, arrival_time);

drop trigger if exists trg_speaker_travel_updated on speaker_travel;
create trigger trg_speaker_travel_updated before update on speaker_travel
  for each row execute function set_updated_at();

alter table speaker_travel enable row level security;
revoke all on speaker_travel from anon, authenticated;
grant all on speaker_travel to service_role;

/**
 * Prüft einen Verkehrsmittel-Schlüssel; NULL bleibt erlaubt („weiß ich noch
 * nicht").
 *
 * `stable`, nicht `immutable`: die Funktion liest `vocab_term`. Als
 * `immutable` dürfte Postgres den Aufruf vorab auswerten — dann griffe eine
 * Änderung am Vokabular nicht mehr (Review 15.09.).
 */
create or replace function check_travel_mode(p_mode text) returns text
language plpgsql stable set search_path = public, extensions as $$
begin
  if p_mode is null or btrim(p_mode) = '' then return null; end if;
  if not is_vocab_key('travel_mode', p_mode) then
    raise exception 'invalid_travel_mode' using errcode = '22023', detail = p_mode;
  end if;
  return p_mode;
end $$;

-- Interner Helfer: die Definer-Funktionen rufen ihn als Eigentümer.
revoke execute on function check_travel_mode(text) from public, anon, authenticated;

/** Die eigene Reise — Speaker oder Assistenz. */
create or replace function my_speaker_travel(p_edition_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_id uuid; v_t speaker_travel%rowtype;
begin
  v_id := my_speaker_profile_id(p_edition_id);
  if v_id is null then return null; end if;
  select * into v_t from speaker_travel where profile_id = v_id;
  return jsonb_build_object(
    'profile_id', v_id,
    'arrival_date', v_t.arrival_date, 'arrival_time', v_t.arrival_time,
    'arrival_mode', v_t.arrival_mode, 'arrival_ref', v_t.arrival_ref,
    'departure_date', v_t.departure_date, 'departure_time', v_t.departure_time,
    'departure_mode', v_t.departure_mode, 'departure_ref', v_t.departure_ref,
    'needs_pickup', coalesce(v_t.needs_pickup, false), 'note', v_t.note,
    'updated_at', v_t.updated_at);
end $$;

create or replace function set_my_speaker_travel(p_data jsonb, p_edition_id uuid default null) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_id uuid; v_owner uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_id := my_speaker_profile_id(p_edition_id);
  if v_id is null then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;

  insert into speaker_travel (profile_id, arrival_date, arrival_time, arrival_mode, arrival_ref,
                              departure_date, departure_time, departure_mode, departure_ref,
                              needs_pickup, note, updated_by)
  values (v_id,
          nullif(p_data->>'arrival_date', '')::date, nullif(p_data->>'arrival_time', '')::time,
          check_travel_mode(p_data->>'arrival_mode'), nullif(btrim(p_data->>'arrival_ref'), ''),
          nullif(p_data->>'departure_date', '')::date, nullif(p_data->>'departure_time', '')::time,
          check_travel_mode(p_data->>'departure_mode'), nullif(btrim(p_data->>'departure_ref'), ''),
          coalesce((p_data->>'needs_pickup')::boolean, false),
          nullif(btrim(p_data->>'note'), ''), v_me)
  on conflict (profile_id) do update set
    -- Nur überschreiben, was mitgeschickt wurde: das Formular darf einen
    -- Abschnitt speichern, ohne den anderen zu leeren.
    arrival_date    = case when p_data ? 'arrival_date'    then nullif(p_data->>'arrival_date', '')::date    else speaker_travel.arrival_date end,
    arrival_time    = case when p_data ? 'arrival_time'    then nullif(p_data->>'arrival_time', '')::time    else speaker_travel.arrival_time end,
    arrival_mode    = case when p_data ? 'arrival_mode'    then check_travel_mode(p_data->>'arrival_mode')   else speaker_travel.arrival_mode end,
    arrival_ref     = case when p_data ? 'arrival_ref'     then nullif(btrim(p_data->>'arrival_ref'), '')    else speaker_travel.arrival_ref end,
    departure_date  = case when p_data ? 'departure_date'  then nullif(p_data->>'departure_date', '')::date  else speaker_travel.departure_date end,
    departure_time  = case when p_data ? 'departure_time'  then nullif(p_data->>'departure_time', '')::time  else speaker_travel.departure_time end,
    departure_mode  = case when p_data ? 'departure_mode'  then check_travel_mode(p_data->>'departure_mode') else speaker_travel.departure_mode end,
    departure_ref   = case when p_data ? 'departure_ref'   then nullif(btrim(p_data->>'departure_ref'), '')  else speaker_travel.departure_ref end,
    needs_pickup    = case when p_data ? 'needs_pickup'    then coalesce((p_data->>'needs_pickup')::boolean, false) else speaker_travel.needs_pickup end,
    note            = case when p_data ? 'note'            then nullif(btrim(p_data->>'note'), '')           else speaker_travel.note end,
    updated_by      = v_me,
    updated_at      = now();

  -- Die Assistenz darf pflegen; dass sie es war, steht danach im Protokoll.
  select sp.person_id into v_owner from speaker_profile sp where sp.id = v_id;
  if v_owner <> v_me then
    perform log_audit('speaker.travel_assistant', 'speaker_profile', v_id::text, null, p_data);
  end if;
  return v_id;
end $$;

/**
 * Die Ankunftsliste.
 *
 * Eine Funktion für drei Zwecke: die Lead-Person sieht ihre eigenen Speaker,
 * das Speaker-Team und die Produktion alle. Wer was sieht, entscheidet
 * `can_manage_speaker` — genau wie in `manager_speakers`, damit die beiden
 * Listen nicht auseinanderlaufen.
 */
create or replace function speaker_travel_list(p_edition_id uuid default null)
returns table (profile_id uuid, person_id uuid, first_name text, last_name text,
               job_title text, organization_name text, pipeline_status text,
               owner_person_id uuid, owner_name text,
               arrival_date date, arrival_time time, arrival_mode text, arrival_ref text,
               departure_date date, departure_time time, departure_mode text, departure_ref text,
               needs_pickup boolean, note text, hotel_label text, updated_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not (has_role('speaker_manager') or has_role('admin') or has_role('area_lead_speaker')
          or has_role('programme_team') or is_production_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select sp.id, sp.person_id, p.first_name, p.last_name, sp.job_title, sp.organization_name,
           sp.pipeline_status, sp.owner_person_id,
           (select btrim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, ''))
              from person o where o.id = sp.owner_person_id),
           t.arrival_date, t.arrival_time, t.arrival_mode, t.arrival_ref,
           t.departure_date, t.departure_time, t.departure_mode, t.departure_ref,
           coalesce(t.needs_pickup, false), t.note,
           (select q.label_de from hospitality_booking b join hospitality_quota q on q.id = b.quota_id
             where b.profile_id = sp.id and b.kind = 'hotel' and b.status = 'confirmed'
             order by b.confirmed_at desc limit 1),
           t.updated_at
      from speaker_profile sp
      join person p on p.id = sp.person_id and p.deleted_at is null
      left join speaker_travel t on t.profile_id = sp.id
     where (p_edition_id is null or sp.edition_id = p_edition_id)
       -- Die Produktion braucht die Liste, ohne je Speaker zuständig zu sein.
       and (is_production_team() or can_manage_speaker(sp.id))
     order by t.arrival_date nulls last, t.arrival_time nulls last,
              p.last_name nulls last, p.first_name nulls last;
end $$;

select harden_definer_functions();
