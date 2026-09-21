-- 0134 · Welle 6: Company Tours mit Stopps und Tour Lead (PART-046, ADM-026).
--
-- Anlass: Konrads Entscheidung D5 vom 18.09.2026. Eine Company Tour ist keine Session mit ein
-- paar Zusatzfeldern, sondern eine **Rundfahrt**: ein Sammelpunkt, drei Stationen bei drei
-- verschiedenen Partnern, eine Begleitperson. Der Partner bucht einen **Stopp**, nicht die Tour.
--
-- Deshalb eigene Tabellen statt `session.format_details` — der erste Entwurf hatte die neun
-- Angaben an der Session; das hätte drei Partner an einem Datensatz schreiben lassen.
--
-- Was Konrad festgelegt hat (18.09.):
--   * **sechs Touren** 2027: Finance, Consulting, Marketing, Logistik, Engineering, Sales;
--   * **Sammelpunkt CCH**, Congressplatz 1, 20355 Hamburg — 2026 war es die Handelskammer;
--   * gestaffelter Start 11:15 / 11:45 / 12:00 / 12:30 / 12:45 / 13:00, je drei Stopps à
--     90 Minuten, 15–45 Minuten Fahrt dazwischen, Ende zwischen 18:00 und 19:30;
--   * je Tour ein **Tour Lead** — oft extern oder Volunteer, deshalb `edition_contact` mit dem
--     neuen Typ `tour_lead` und der Freelancer-Regel (`contract_consent_at`);
--   * die echten Zeiten setzt das Team später; bis dahin **Dummy-Touren** nach diesem Muster.
--
-- **Keine Personendaten aus den Ablaufplänen 2026 übernehmen.** Dort stehen Team-Kontakte mit
-- privaten Mobilnummern; die Begleitperson kommt ausschließlich aus `edition_contact`.

set search_path = public, extensions;

-- ---------------------------------------------------------------- 1) Tour Lead als Kontakttyp

-- Ein neuer Kontakttyp steht an **drei** Stellen, nicht an einer (Befund des Admin-Chats,
-- 18.09.): im Vokabular, im CHECK der Tabelle und — leicht zu übersehen — als zweite,
-- hartcodierte Whitelist in `upsert_edition_contact`. Ohne die dritte Stelle erlaubt die
-- Datenbank den Typ, aber die Pflege weist ihn mit 22023 ab, und die Meldung sieht nach
-- einem Tippfehler aus statt nach einer vergessenen Migration.

-- (1) Vokabular. Die Typauswahl im Admin liest seit #69 von hier, nicht mehr aus einer Liste
-- im Code — der Typ taucht dort mit dieser Sortierung und diesen Beschriftungen von allein auf.
insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active)
select 'edition_contact_type', 'tour_lead', 'Tour Lead', 'Tour lead', 5, true
where not exists (select 1 from vocab_term t where t.vocabulary = 'edition_contact_type' and t.key = 'tour_lead');

-- (2) CHECK der Tabelle
alter table edition_contact drop constraint if exists edition_contact_type_chk;
alter table edition_contact add constraint edition_contact_type_chk
  check (type in ('partner_lead', 'partner_buddy', 'speaker_lead', 'speaker_buddy', 'tour_lead'));

-- (3) Die Whitelist in der Pflege-RPC. Grundlage ist die Live-Fassung aus
-- `20260918105038_v6_freelancer_kontakte.sql` (Einwilligung statt Domain-Zwang); neu ist
-- allein `tour_lead` in der Aufzählung.
create or replace function upsert_edition_contact(p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_id uuid; v_ed uuid; v_typ text; v_mail text; v_consent date; v_mail_effektiv text;
begin
  if not can_edit_edition_contacts() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_id := nullif(p_data->>'id', '')::uuid;
  v_typ := nullif(btrim(p_data->>'type'), '');
  if v_typ is not null and v_typ not in ('partner_lead','partner_buddy','speaker_lead','speaker_buddy','tour_lead') then
    raise exception 'invalid_contact_type' using errcode = '22023', detail = coalesce(v_typ, 'null');
  end if;
  v_mail := nullif(btrim(p_data->>'email'), '');
  v_consent := nullif(p_data->>'contract_consent_at', '')::date;

  -- Welche Adresse gilt am Ende, und welches Datum? Beim Ändern zählt der
  -- bestehende Stand, wenn das Feld nicht mitgeschickt wird — sonst würde eine
  -- reine Namenskorrektur an der Einwilligung scheitern.
  if v_id is not null then
    select coalesce(v_mail, c.email::text),
           case when p_data ? 'contract_consent_at' then v_consent else c.contract_consent_at end
      into v_mail_effektiv, v_consent
      from edition_contact c where c.id = v_id;
  else
    v_mail_effektiv := v_mail;
  end if;

  if v_mail_effektiv is not null
     and lower(v_mail_effektiv) not like '%@chef-treff.de'
     and v_consent is null then
    raise exception 'contact_consent_required' using errcode = '22023', detail = v_mail_effektiv;
  end if;

  select coalesce(nullif(p_data->>'edition_id','')::uuid,
                  (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;

  -- **Erst umhängen, dann schreiben.** Der Teilindex `edition_contact_default_uidx`
  -- duldet keinen zweiten Standard je Edition und Typ — auch nicht für die
  -- Dauer einer Anweisung.
  if coalesce((p_data->>'is_default')::boolean, false) then
    update edition_contact set is_default = false, updated_at = now()
     where edition_id = v_ed
       and type = coalesce(v_typ, (select c.type from edition_contact c where c.id = v_id))
       and is_default
       and (v_id is null or id <> v_id);
  end if;

  if v_id is null then
    if v_typ is null or nullif(btrim(p_data->>'display_name'), '') is null
       or v_mail is null or nullif(btrim(p_data->>'phone'), '') is null then
      raise exception 'fields_required' using errcode = '22023',
        detail = 'type, display_name, email und phone sind Pflicht';
    end if;
    insert into edition_contact (edition_id, type, display_name, role_label_de, role_label_en,
                                 email, phone, photo_path, is_default, sort_order, contract_consent_at)
    values (v_ed, v_typ, btrim(p_data->>'display_name'),
            nullif(btrim(p_data->>'role_label_de'), ''), nullif(btrim(p_data->>'role_label_en'), ''),
            v_mail::citext, btrim(p_data->>'phone'),
            nullif(btrim(p_data->>'photo_path'), ''),
            coalesce((p_data->>'is_default')::boolean, false),
            coalesce((p_data->>'sort_order')::integer, 0), v_consent)
    returning id into v_id;
  else
    update edition_contact set
      type          = coalesce(v_typ, type),
      display_name  = coalesce(nullif(btrim(p_data->>'display_name'), ''), display_name),
      role_label_de = case when p_data ? 'role_label_de' then nullif(btrim(p_data->>'role_label_de'), '') else role_label_de end,
      role_label_en = case when p_data ? 'role_label_en' then nullif(btrim(p_data->>'role_label_en'), '') else role_label_en end,
      email         = coalesce(v_mail::citext, email),
      phone         = coalesce(nullif(btrim(p_data->>'phone'), ''), phone),
      photo_path    = case when p_data ? 'photo_path' then nullif(btrim(p_data->>'photo_path'), '') else photo_path end,
      is_default    = coalesce((p_data->>'is_default')::boolean, is_default),
      sort_order    = coalesce((p_data->>'sort_order')::integer, sort_order),
      contract_consent_at = case when p_data ? 'contract_consent_at' then v_consent else contract_consent_at end,
      updated_at    = now()
     where id = v_id;
    if not found then raise exception 'contact_not_found' using errcode = 'P0002', detail = v_id::text; end if;
  end if;

  perform log_audit('edition_contact.upsert', 'edition_contact', v_id::text, null, p_data - 'photo_path');
  return v_id;
end $$;

-- Hinweis zum Standard-Mechanismus (Admin-Chat, 18.09.): `edition_contact` kennt genau **einen**
-- Standard je Typ und Edition. Für Tour Leads gibt es keinen sinnvollen Standard — **jede Tour
-- hat ihren eigenen Lead** (von Konrad am 18.09. ausdrücklich bestätigt). Die Zuordnung hängt deshalb an `company_tour.lead_contact_id`, wie bei
-- `speaker_profile.lead_contact_id`. `my_contacts()` ist davon unberührt: es fragt die vier
-- Partner- und Speaker-Typen ausdrücklich ab und würde einen Tour Lead nie ausliefern.

-- ---------------------------------------------------------------- 2) Touren und Stopps

create table if not exists company_tour (
  id             uuid primary key default gen_random_uuid(),
  edition_id     uuid not null references event (id) on delete cascade,
  name           text not null,                                  -- „Finance", „Engineering" …
  track          text,                                           -- Vokabular `study_field`, optional
  event_day_id   uuid references event_day (id) on delete set null,
  meeting_point  text not null default 'CCH, Congressplatz 1, 20355 Hamburg',
  starts_at      timestamptz,
  ends_at        timestamptz,
  -- Die Begleitperson. Oft extern oder Volunteer — die Kontaktdaten unterliegen der
  -- Freelancer-Regel aus `edition_contact` (Einwilligung im Vertrag).
  lead_contact_id uuid references edition_contact (id) on delete set null,
  capacity       integer,
  notes          text,                                           -- intern, nie im Partner-Portal
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (edition_id, name),
  constraint company_tour_time_chk check (ends_at is null or starts_at is null or ends_at > starts_at)
);
comment on table company_tour is
  'Eine Company Tour: Rundfahrt vom Sammelpunkt zu mehreren Partnern (Konrad, 18.09.). Sechs Touren 2027; die echten Zeiten setzt das Team, bis dahin Dummy-Touren.';
comment on column company_tour.meeting_point is
  'Sammelpunkt 2027: CCH, Congressplatz 1, 20355 Hamburg. 2026 war es die Handelskammer — der Wert steht als Feld, damit ein Umzug keine Migration braucht.';
comment on column company_tour.lead_contact_id is
  'Begleitperson der Tour, im Partner-Portal als „Euer Tour Lead" mit Name, Foto, E-Mail und Telefon. Aus edition_contact (Typ tour_lead), nie aus den Ablaufplänen 2026. Externe und Volunteers brauchen dort contract_consent_at — der Domain-CHECK wurde am 18.09. entsprechend gelockert (20260918105038).';
comment on column company_tour.notes is 'Interne Planungsnotiz. Kommt nicht ins Partner-Portal.';

create table if not exists company_tour_stop (
  id             uuid primary key default gen_random_uuid(),
  tour_id        uuid not null references company_tour (id) on delete cascade,
  sort_order     integer not null default 1,
  arrival_at     timestamptz,
  departure_at   timestamptz,
  -- Der Partner, der diesen Stopp bucht. NULL = noch offen, das Team vergibt ihn.
  host_org_id    uuid references organization (id) on delete set null,
  address        text,
  -- Die Angaben, die der Partner zu seinem Stopp macht (die neun Fragen aus 2026).
  contact_name   text,
  contact_email  citext,
  contact_phone  text,
  time_note      text,
  snacks         boolean,
  notes_public   text,                                           -- Hinweise für Teilnehmende
  target_profile jsonb not null default '{}'::jsonb,
  photos_allowed boolean,
  filled_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tour_id, sort_order),
  constraint stop_time_chk check (departure_at is null or arrival_at is null or departure_at > arrival_at)
);
-- Ein Partner besetzt je Tour höchstens einen Stopp — sonst stünde dieselbe Firma zweimal
-- auf derselben Rundfahrt.
create unique index if not exists company_tour_stop_org_idx
  on company_tour_stop (tour_id, host_org_id) where host_org_id is not null;
comment on table company_tour_stop is
  'Eine Station einer Company Tour. Der Partner bucht den Stopp und beantwortet dazu die Fragen aus 2026 (Ansprechperson, Adresse, Zeitfenster, Snacks, Hinweise, gesuchte Profile, Fotografieren).';
comment on column company_tour_stop.contact_name is
  'Ansprechperson beim Partner vor Ort. Dienstliche Angaben; sie arbeitet beim Partner, deshalb ohne Domain-Prüfung.';
comment on column company_tour_stop.notes_public is
  'Was Teilnehmende wissen müssen: Anmeldung am Empfang, Personalausweis, Sicherheitskleidung.';

drop trigger if exists trg_company_tour_updated on company_tour;
create trigger trg_company_tour_updated before update on company_tour for each row execute function set_updated_at();
drop trigger if exists trg_company_tour_stop_updated on company_tour_stop;
create trigger trg_company_tour_stop_updated before update on company_tour_stop for each row execute function set_updated_at();

alter table company_tour enable row level security;
alter table company_tour_stop enable row level security;
revoke all on company_tour, company_tour_stop from anon, authenticated;
grant all on company_tour, company_tour_stop to service_role;

-- ---------------------------------------------------------------- 3) Lesen

-- Was der Partner zu seinem Stopp sieht — Tour, Zeitfenster, Sammelpunkt und die
-- Begleitperson mit Kontaktdaten (Konrads Serviceversprechen, Regeländerung 17.09.).
--
-- **Auflage 5 der Architektur-Session (21.09.).** `lead_contract_consent_at` ist heraus.
-- Das Feld belegt intern, dass eine freie Mitarbeiterin der Veröffentlichung ihrer Daten im
-- Vertrag zugestimmt hat — es ist ein Nachweis für uns, keine Angabe für den Partner. Name,
-- Rolle, Foto, E-Mail und Telefon bleiben, genau die will Konrad zeigen.
--
-- Die Prüfung, ob die Einwilligung vorliegt, gehört ohnehin nicht in die Anzeige, sondern in
-- `upsert_edition_contact` beim Anlegen — dort steht sie.
drop function if exists partner_company_tour(uuid, uuid);
create or replace function partner_company_tour(p_org_id uuid, p_edition_id uuid default null)
returns table (stop_id uuid, tour_id uuid, tour_name text, track text, meeting_point text,
               tour_starts_at timestamptz, tour_ends_at timestamptz,
               sort_order integer, arrival_at timestamptz, departure_at timestamptz,
               address text, contact_name text, contact_email text, contact_phone text,
               time_note text, snacks boolean, notes_public text, target_profile jsonb,
               photos_allowed boolean, filled_at timestamptz,
               lead_name text, lead_role_de text, lead_role_en text, lead_email text, lead_phone text,
               lead_photo_path text)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_oe org_edition;
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  return query
    select st.id, ct.id, ct.name, ct.track, ct.meeting_point, ct.starts_at, ct.ends_at,
           st.sort_order, st.arrival_at, st.departure_at, st.address,
           st.contact_name, st.contact_email::text, st.contact_phone,
           st.time_note, st.snacks, st.notes_public, st.target_profile, st.photos_allowed, st.filled_at,
           ec.display_name, ec.role_label_de, ec.role_label_en, ec.email::text, ec.phone, ec.photo_path
      from company_tour_stop st
      join company_tour ct on ct.id = st.tour_id
      left join edition_contact ec on ec.id = ct.lead_contact_id
     where st.host_org_id = p_org_id and ct.edition_id = v_oe.edition_id
     order by ct.starts_at nulls last, st.sort_order;
end $$;

-- ---------------------------------------------------------------- 4) Schreiben (Partner)

-- Der Partner füllt seinen Stopp. Zeiten, Reihenfolge und Zuordnung bleiben beim Team —
-- er beantwortet die Fragen, er plant nicht die Route.
create or replace function partner_update_tour_stop(p_stop_id uuid, p_fields jsonb)
returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_st company_tour_stop; v_bad text; v_mail text; v_prof jsonb; v_key text; v_el text;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_st from company_tour_stop where id = p_stop_id;
  if not found then raise exception 'stop_not_found' using errcode = 'P0002'; end if;
  if v_st.host_org_id is null or not partner_can_edit(v_st.host_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select string_agg(k, ',') into v_bad from jsonb_object_keys(p_fields) k
   where k not in ('address','contact_name','contact_email','contact_phone','time_note',
                   'snacks','notes_public','target_profile','photos_allowed');
  if v_bad is not null then
    raise exception 'not_editable' using errcode = 'P0001', detail = v_bad;
  end if;

  v_mail := nullif(btrim(coalesce(p_fields->>'contact_email', '')), '');
  if v_mail is not null and v_mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'invalid_email' using errcode = '22023', detail = 'contact_email';
  end if;
  if length(coalesce(p_fields->>'notes_public', '')) > 1000 then
    raise exception 'too_long' using errcode = '22023', detail = 'notes_public';
  end if;
  if length(coalesce(p_fields->>'address', '')) > 300 then
    raise exception 'too_long' using errcode = '22023', detail = 'address';
  end if;

  -- Gesuchte Profile gegen dieselben Vokabulare wie im Teilnehmerprofil.
  if p_fields ? 'target_profile' then
    v_prof := p_fields->'target_profile';
    if jsonb_typeof(v_prof) <> 'object' then
      raise exception 'invalid_format_details' using errcode = '22023', detail = 'target_profile:object';
    end if;
    for v_key in select jsonb_object_keys(v_prof) loop
      if not (v_key = any(array['occupation_status','career_level','study_field'])) then
        raise exception 'invalid_format_details' using errcode = '22023', detail = 'target_profile.' || v_key;
      end if;
      for v_el in select jsonb_array_elements_text(v_prof->v_key) loop
        if not is_vocab_key(v_key, v_el) then
          raise exception 'invalid_vocab' using errcode = '22023', detail = v_key || ':' || v_el;
        end if;
      end loop;
    end loop;
  end if;

  update company_tour_stop set
    address = case when p_fields ? 'address' then nullif(btrim(p_fields->>'address'), '') else address end,
    contact_name = case when p_fields ? 'contact_name' then nullif(btrim(p_fields->>'contact_name'), '') else contact_name end,
    contact_email = case when p_fields ? 'contact_email' then v_mail::citext else contact_email end,
    contact_phone = case when p_fields ? 'contact_phone' then nullif(btrim(p_fields->>'contact_phone'), '') else contact_phone end,
    time_note = case when p_fields ? 'time_note' then nullif(btrim(p_fields->>'time_note'), '') else time_note end,
    snacks = case when p_fields ? 'snacks' then (p_fields->>'snacks')::boolean else snacks end,
    notes_public = case when p_fields ? 'notes_public' then nullif(btrim(p_fields->>'notes_public'), '') else notes_public end,
    target_profile = case when p_fields ? 'target_profile' then p_fields->'target_profile' else target_profile end,
    photos_allowed = case when p_fields ? 'photos_allowed' then (p_fields->>'photos_allowed')::boolean else photos_allowed end,
    filled_at = now()
  where id = p_stop_id;

  perform log_audit('partner.tour_stop_update', 'company_tour_stop', p_stop_id::text, null,
                    jsonb_build_object('org_id', v_st.host_org_id,
                                       'fields', (select array_agg(k) from jsonb_object_keys(p_fields) k)));
end $$;

-- ---------------------------------------------------------------- 5) Team: Touren planen

create or replace function upsert_company_tour(p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_id uuid := nullif(p_data->>'id', '')::uuid; v_ed uuid := nullif(p_data->>'edition_id', '')::uuid;
begin
  if not (is_partner_team() or is_programme_editor(null)) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_id is null then
    if v_ed is null or nullif(btrim(coalesce(p_data->>'name', '')), '') is null then
      raise exception 'fields_required' using errcode = '22023', detail = 'edition_id,name';
    end if;
    insert into company_tour (edition_id, name, track, event_day_id, meeting_point, starts_at, ends_at, lead_contact_id, capacity, notes)
    values (v_ed, btrim(p_data->>'name'), nullif(p_data->>'track', ''), nullif(p_data->>'event_day_id','')::uuid,
            coalesce(nullif(btrim(coalesce(p_data->>'meeting_point','')), ''), 'CCH, Congressplatz 1, 20355 Hamburg'),
            nullif(p_data->>'starts_at','')::timestamptz, nullif(p_data->>'ends_at','')::timestamptz,
            nullif(p_data->>'lead_contact_id','')::uuid, nullif(p_data->>'capacity','')::integer,
            nullif(btrim(coalesce(p_data->>'notes','')), ''))
    returning id into v_id;
  else
    update company_tour set
      name = case when p_data ? 'name' then btrim(p_data->>'name') else name end,
      track = case when p_data ? 'track' then nullif(p_data->>'track','') else track end,
      event_day_id = case when p_data ? 'event_day_id' then nullif(p_data->>'event_day_id','')::uuid else event_day_id end,
      meeting_point = case when p_data ? 'meeting_point' then coalesce(nullif(btrim(p_data->>'meeting_point'),''), meeting_point) else meeting_point end,
      starts_at = case when p_data ? 'starts_at' then nullif(p_data->>'starts_at','')::timestamptz else starts_at end,
      ends_at = case when p_data ? 'ends_at' then nullif(p_data->>'ends_at','')::timestamptz else ends_at end,
      lead_contact_id = case when p_data ? 'lead_contact_id' then nullif(p_data->>'lead_contact_id','')::uuid else lead_contact_id end,
      capacity = case when p_data ? 'capacity' then nullif(p_data->>'capacity','')::integer else capacity end,
      notes = case when p_data ? 'notes' then nullif(btrim(p_data->>'notes'),'') else notes end
    where id = v_id;
    if not found then raise exception 'tour_not_found' using errcode = 'P0002'; end if;
  end if;
  -- Die Begleitperson muss vom richtigen Typ und aus derselben Edition sein.
  if (select lead_contact_id from company_tour where id = v_id) is not null then
    perform check_edition_contact((select lead_contact_id from company_tour where id = v_id),
                                  (select edition_id from company_tour where id = v_id), 'tour_lead');
  end if;
  perform log_audit('tour.upsert', 'company_tour', v_id::text, null, p_data);
  return v_id;
end $$;

create or replace function upsert_company_tour_stop(p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_id uuid := nullif(p_data->>'id', '')::uuid; v_tour uuid := nullif(p_data->>'tour_id', '')::uuid;
begin
  if not (is_partner_team() or is_programme_editor(null)) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_id is null then
    if v_tour is null then raise exception 'fields_required' using errcode = '22023', detail = 'tour_id'; end if;
    insert into company_tour_stop (tour_id, sort_order, arrival_at, departure_at, host_org_id, address)
    values (v_tour, coalesce(nullif(p_data->>'sort_order','')::integer, 1),
            nullif(p_data->>'arrival_at','')::timestamptz, nullif(p_data->>'departure_at','')::timestamptz,
            nullif(p_data->>'host_org_id','')::uuid, nullif(btrim(coalesce(p_data->>'address','')), ''))
    returning id into v_id;
  else
    update company_tour_stop set
      sort_order = case when p_data ? 'sort_order' then (p_data->>'sort_order')::integer else sort_order end,
      arrival_at = case when p_data ? 'arrival_at' then nullif(p_data->>'arrival_at','')::timestamptz else arrival_at end,
      departure_at = case when p_data ? 'departure_at' then nullif(p_data->>'departure_at','')::timestamptz else departure_at end,
      host_org_id = case when p_data ? 'host_org_id' then nullif(p_data->>'host_org_id','')::uuid else host_org_id end,
      address = case when p_data ? 'address' then nullif(btrim(p_data->>'address'),'') else address end
    where id = v_id;
    if not found then raise exception 'stop_not_found' using errcode = 'P0002'; end if;
  end if;
  perform log_audit('tour.stop_upsert', 'company_tour_stop', v_id::text, null, p_data);
  return v_id;
end $$;

create or replace function company_tours_admin(p_edition_id uuid default null)
returns table (tour_id uuid, name text, track text, meeting_point text, starts_at timestamptz, ends_at timestamptz,
               lead_name text, stops integer, stops_filled integer, capacity integer)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not (is_partner_team() or is_programme_editor(null)) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select ct.id, ct.name, ct.track, ct.meeting_point, ct.starts_at, ct.ends_at, ec.display_name,
           (select count(*)::integer from company_tour_stop s where s.tour_id = ct.id),
           (select count(*)::integer from company_tour_stop s where s.tour_id = ct.id and s.filled_at is not null),
           ct.capacity
      from company_tour ct
      left join edition_contact ec on ec.id = ct.lead_contact_id
     where p_edition_id is null or ct.edition_id = p_edition_id
     order by ct.starts_at nulls last, ct.name;
end $$;

-- ---------------------------------------------------------------- 6) Dummy-Touren 2027
--
-- Bis das Team die echten Zeiten setzt (ADM-026), stehen sechs Touren nach Konrads Muster.
-- Sie sind **kein** Testdatensatz im Sinne der Wegwerfregel: Namen und Staffelung sind die
-- geplanten, nur die Uhrzeiten und Stopp-Adressen ändert das Team später. Deshalb ohne
-- `notes = 'testdaten:…'`, aber mit einem Vermerk, der es sagt.

insert into company_tour (edition_id, name, track, event_day_id, meeting_point, starts_at, ends_at, notes)
select e.id, v.name, v.track, ed.id, 'CCH, Congressplatz 1, 20355 Hamburg',
       (ed.day_date + v.start_time) at time zone 'Europe/Berlin',
       (ed.day_date + v.end_time) at time zone 'Europe/Berlin',
       'Vorlaufige Zeiten nach dem Muster 2026 (Konrad, 18.09.). Das Team setzt die echten Zeiten.'
  from event e
  join event e2 on e2.edition_id = e.id and e2.slug = 'summit-27'
  join event_day ed on ed.event_id = e2.id and ed.sort_order = 1
  join (values
    -- `track` zeigt auf das Vokabular `study_field`; die Schlüssel stammen von dort,
    -- nicht aus dem Bauch (geprüft gegen den Seed vom 21.07.).
    ('Finance',     'finance-econ',           time '11:15', time '18:00'),
    ('Consulting',  'business',               time '11:45', time '18:30'),
    ('Marketing',   'business',               time '12:00', time '18:45'),
    ('Logistik',    'wirtschaftsing',         time '12:30', time '19:00'),
    ('Engineering', 'wirtschaftsing',         time '12:45', time '19:15'),
    ('Sales',       'business',               time '13:00', time '19:30')
  ) as v(name, track, start_time, end_time) on true
 where e.is_edition and e.slug = 'fls27'
on conflict (edition_id, name) do nothing;

-- Je Tour drei offene Stopps à 90 Minuten mit 30 Minuten Fahrt dazwischen.
insert into company_tour_stop (tour_id, sort_order, arrival_at, departure_at)
select ct.id, s.n,
       ct.starts_at + make_interval(mins => 30 + (s.n - 1) * 120),
       ct.starts_at + make_interval(mins => 30 + (s.n - 1) * 120 + 90)
  from company_tour ct
  join (values (1), (2), (3)) as s(n) on true
 where ct.starts_at is not null
   and not exists (select 1 from company_tour_stop x where x.tour_id = ct.id and x.sort_order = s.n);

select harden_definer_functions();
