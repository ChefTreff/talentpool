-- 0091 · Welle 5 · Ansprechpartner und allgemeine Zeiten je Edition (F9.1)
--
-- Liegt unter `vorschlag/`, bis die Architektur-Session sie anwendet und auf
-- die Server-Version umbenennt.
--
-- Konrads Anforderung aus Feedback-Runde 2: „extrem serviceorientiert denken
-- und Fragen antizipieren, damit sie gar nicht erst gestellt werden." Auf der
-- Portal-Startseite heisst das zweierlei — **wer ist für mich zuständig** und
-- **wann ist was los**. Beides steht hier.
--
-- ## Ansprechpartner
--
-- Ein Pool je Edition (`edition_contact`) mit vier Typen: Lead und Buddy, je
-- für Partner und Speaker. Zugeordnet wird **je Partner** (`org_edition`) und
-- **je Speaker** (`speaker_profile`) — nicht pauschal. Wer nichts zugeordnet
-- bekommen hat, sieht den als `is_default` markierten Kontakt seines Typs.
--
-- Der Rückfall greift **nur innerhalb einer bestehenden Beziehung**: ein
-- Partner ohne gesetzten Lead bekommt den Standard-Partner-Lead. Eine
-- angemeldete Person, die weder Partner-Kontakt noch Speakerin ist, bekommt
-- gar nichts — `my_contacts()` ist keine Teamliste für alle (Entscheidung der
-- Architektur-Session 14.09.). Der Test prüft genau das.
--
-- **Pflichtfelder sind dienstliche Mailadresse und Handynummer.** Konrad:
-- „sonst ist die Funktion nutzlos". Die Mailadresse hält ein CHECK auf
-- `@chef-treff.de` fest — damit kommt keine private Freelancer-Adresse
-- hinein, der Befund aus Runde 1 am alten Speaker Hub. **Bei der Nummer gibt
-- es kein solches Netz:** gemeint ist die dienstliche Nummer, und ob dort
-- eine private steht, kann die Datenbank nicht sehen. Der Admin-Dialog sagt
-- es im Hilfetext; mehr ist hier nicht zu holen.
--
-- ## Allgemeine Zeiten
--
-- `edition_info` ist bewusst schlicht: Schlüssel, Zielgruppen, Beschriftung
-- und Wert, beides zweisprachig. Keine Zeitstempel — „Fr 12:00 Einlass, 13:00
-- Programmstart" ist eine Auskunft, kein Termin, und sie steht auf der
-- Startseite, im Speaker-Portal und im Wiki. Ein Datumsfeld verführte dazu,
-- daraus einen Kalender zu bauen, den niemand bestellt hat.
--
-- Fehlerschlüssel: 28000 ohne Login · 42501 ohne Recht ·
-- 22023 `invalid_contact_type` / `invalid_audience` · P0002 `contact_not_found`.

set search_path = public, extensions;

-- ---------------------------------------------------------------- Vokabular

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active) values
  ('edition_contact_type', 'partner_lead',   'Partner-Lead',   'Partner lead',   1, true),
  ('edition_contact_type', 'partner_buddy',  'Partner-Buddy',  'Partner buddy',  2, true),
  ('edition_contact_type', 'speaker_lead',   'Speaker-Lead',   'Speaker lead',   3, true),
  ('edition_contact_type', 'speaker_buddy',  'Speaker-Buddy',  'Speaker buddy',  4, true)
on conflict (vocabulary, key) do nothing;

-- ---------------------------------------------------------------- Tabellen

create table if not exists edition_contact (
  id              uuid primary key default gen_random_uuid(),
  edition_id      uuid not null references event(id) on delete cascade,
  type            text not null,
  display_name    text not null,
  role_label_de   text,
  role_label_en   text,
  -- Rollen- oder Team-Adresse. Der CHECK ist die eigentliche Schutzlinie.
  email           citext not null,
  -- Dienstliche Nummer. Siehe Kopf: nicht prüfbar, nur benennbar.
  phone           text not null,
  photo_path      text,
  is_default      boolean not null default false,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint edition_contact_type_chk
    check (type in ('partner_lead', 'partner_buddy', 'speaker_lead', 'speaker_buddy')),
  constraint edition_contact_email_chk check (email::text like '%@chef-treff.de'),
  constraint edition_contact_phone_chk check (btrim(phone) <> ''),
  constraint edition_contact_name_chk check (btrim(display_name) <> '')
);

comment on table edition_contact is
  'Ansprechpartner je Edition (F9.1). Dienstliche Mailadresse per CHECK erzwungen; die Nummer ist Pflicht, aber nicht prüfbar — gemeint ist die dienstliche.';
comment on column edition_contact.is_default is
  'Rückfall innerhalb einer bestehenden Zuordnungsbeziehung: ein Partner ohne gesetzten Lead sieht diesen. Nie eine Liste für alle Angemeldeten.';

-- Höchstens ein Standard je Edition und Typ.
create unique index if not exists edition_contact_default_uidx
  on edition_contact (edition_id, type) where is_default;
create index if not exists edition_contact_edition_idx on edition_contact (edition_id, type, sort_order);

alter table edition_contact enable row level security;
-- Keine Policy: gelesen wird ausschliesslich über `my_contacts()` und die
-- Admin-RPCs, beide SECURITY DEFINER. Eine Lese-Policy „alle Angemeldeten"
-- wäre genau die Teamliste, die es nicht geben soll.
revoke all on edition_contact from anon, authenticated;

create table if not exists edition_info (
  id          uuid primary key default gen_random_uuid(),
  edition_id  uuid not null references event(id) on delete cascade,
  key         text not null,
  -- Zielgruppen aus `kb_audience` — dieselbe Vokabel wie in der Wissensbasis,
  -- damit „wer sieht was" nicht zweimal verschieden definiert ist.
  audience    text[] not null default '{}',
  label_de    text,
  label_en    text,
  value_de    text,
  value_en    text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint edition_info_key_chk check (btrim(key) <> ''),
  constraint edition_info_audience_chk check (cardinality(audience) > 0),
  constraint edition_info_label_chk check (label_de is not null or label_en is not null)
);

comment on table edition_info is
  'Allgemeine Auskünfte je Edition (F9.1): Öffnungszeiten, Einlass, Aufbau, Adresse. Text, kein Zeitstempel — eine Auskunft, kein Termin.';

create unique index if not exists edition_info_key_uidx on edition_info (edition_id, key);
create index if not exists edition_info_edition_idx on edition_info (edition_id, sort_order);

alter table edition_info enable row level security;
revoke all on edition_info from anon, authenticated;

-- ---------------------------------------------------------------- Zuordnung

alter table org_edition
  add column if not exists lead_contact_id uuid references edition_contact(id) on delete set null,
  add column if not exists buddy_contact_id uuid references edition_contact(id) on delete set null;

alter table speaker_profile
  add column if not exists lead_contact_id uuid references edition_contact(id) on delete set null,
  add column if not exists buddy_contact_id uuid references edition_contact(id) on delete set null;

-- ---------------------------------------------------------------- Bucket

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contact-photos', 'contact-photos', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
-- Schreiben nur service_role: Bilder legt der Admin über die Serverroute ab,
-- niemand lädt direkt aus dem Browser in diesen Bucket.

-- ---------------------------------------------------------------- Lesen

/**
 * Die Ansprechpartner **dieser** Person.
 *
 * Partner-Kontakt: Lead und Buddy der eigenen Organisation(en).
 * Speakerin oder Assistenz: Lead und Buddy des eigenen Profils.
 * Alle anderen: nichts. Kein Rückfall, keine Teamliste.
 *
 * `via` sagt, woher die Zuordnung kommt — die Oberfläche zeigt bei gleicher
 * Person oder nur einer Zuordnung eine Karte statt zwei.
 */
create or replace function my_contacts(p_edition_id uuid default null)
returns table (id uuid, type text, display_name text, role_label_de text, role_label_en text,
               email text, phone text, photo_path text, via text)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid; v_me uuid := current_person_id();
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by (current_date between e.start_date and e.end_date) desc,
                                           e.start_date desc limit 1))
    into v_ed;
  if v_ed is null then return; end if;

  return query
  with partner_zuordnung as (
    select oe.lead_contact_id, oe.buddy_contact_id
      from org_edition oe
     where oe.edition_id = v_ed and is_partner_of(oe.org_id)
  ), speaker_zuordnung as (
    select sp.lead_contact_id, sp.buddy_contact_id
      from speaker_profile sp
     where sp.edition_id = v_ed and sp.id = my_speaker_profile_id(v_ed)
  ), gewaehlt as (
    -- Je Beziehung und Typ: die gesetzte Zuordnung, sonst der Standard.
    select 'partner_lead'::text as typ, coalesce(
             (select pz.lead_contact_id from partner_zuordnung pz where pz.lead_contact_id is not null limit 1),
             (select c.id from edition_contact c where c.edition_id = v_ed and c.type = 'partner_lead' and c.is_default)) as kontakt,
           'partner'::text as herkunft
     where exists (select 1 from partner_zuordnung)
    union all
    select 'partner_buddy', coalesce(
             (select pz.buddy_contact_id from partner_zuordnung pz where pz.buddy_contact_id is not null limit 1),
             (select c.id from edition_contact c where c.edition_id = v_ed and c.type = 'partner_buddy' and c.is_default)),
           'partner'
     where exists (select 1 from partner_zuordnung)
    union all
    select 'speaker_lead', coalesce(
             (select sz.lead_contact_id from speaker_zuordnung sz where sz.lead_contact_id is not null limit 1),
             (select c.id from edition_contact c where c.edition_id = v_ed and c.type = 'speaker_lead' and c.is_default)),
           'speaker'
     where exists (select 1 from speaker_zuordnung)
    union all
    select 'speaker_buddy', coalesce(
             (select sz.buddy_contact_id from speaker_zuordnung sz where sz.buddy_contact_id is not null limit 1),
             (select c.id from edition_contact c where c.edition_id = v_ed and c.type = 'speaker_buddy' and c.is_default)),
           'speaker'
     where exists (select 1 from speaker_zuordnung)
  )
  select distinct on (c.id)
         c.id, c.type, c.display_name, c.role_label_de, c.role_label_en,
         c.email::text, c.phone, c.photo_path, g.herkunft
    from gewaehlt g join edition_contact c on c.id = g.kontakt
   order by c.id, g.herkunft;
end $$;

/** Allgemeine Auskünfte für eine Zielgruppe — Startseiten und Wiki. */
create or replace function edition_infos(p_audience text, p_edition_id uuid default null)
returns table (key text, label_de text, label_en text, value_de text, value_en text, sort_order integer)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not (my_kb_audiences() && array[p_audience]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by (current_date between e.start_date and e.end_date) desc,
                                           e.start_date desc limit 1))
    into v_ed;
  return query
    select i.key, i.label_de, i.label_en, i.value_de, i.value_en, i.sort_order
      from edition_info i
     where i.edition_id = v_ed and i.audience && array[p_audience]
     order by i.sort_order, i.key;
end $$;

-- ---------------------------------------------------------------- Pflegen

/** Wer Ansprechpartner und Auskünfte pflegen darf: Admin oder Bereichsleitung. */
create or replace function can_edit_edition_contacts() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select has_role('admin') or has_role('area_lead_partner') or has_role('area_lead_speaker')
$$;

create or replace function upsert_edition_contact(p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_id uuid; v_ed uuid; v_typ text;
begin
  if not can_edit_edition_contacts() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_id := nullif(p_data->>'id', '')::uuid;
  v_typ := nullif(btrim(p_data->>'type'), '');
  if v_typ is not null and v_typ not in ('partner_lead','partner_buddy','speaker_lead','speaker_buddy') then
    raise exception 'invalid_contact_type' using errcode = '22023', detail = coalesce(v_typ, 'null');
  end if;
  select coalesce(nullif(p_data->>'edition_id','')::uuid,
                  (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;

  -- **Erst umhängen, dann schreiben.** Der Teilindex `edition_contact_default_uidx`
  -- duldet keinen zweiten Standard je Edition und Typ — auch nicht für die
  -- Dauer einer Anweisung. Stand das Umhängen hinter dem Schreiben, scheiterte
  -- genau der Fall „bestehenden Kontakt zum Standard machen" mit 23505. Der
  -- Test hat das gefunden, bevor die Migration lief.
  if coalesce((p_data->>'is_default')::boolean, false) then
    update edition_contact set is_default = false, updated_at = now()
     where edition_id = v_ed
       and type = coalesce(v_typ, (select c.type from edition_contact c where c.id = v_id))
       and is_default
       and (v_id is null or id <> v_id);
  end if;

  if v_id is null then
    insert into edition_contact (edition_id, type, display_name, role_label_de, role_label_en,
                                 email, phone, photo_path, is_default, sort_order)
    values (v_ed, v_typ, btrim(p_data->>'display_name'),
            nullif(btrim(p_data->>'role_label_de'), ''), nullif(btrim(p_data->>'role_label_en'), ''),
            btrim(p_data->>'email')::citext, btrim(p_data->>'phone'),
            nullif(btrim(p_data->>'photo_path'), ''),
            coalesce((p_data->>'is_default')::boolean, false),
            coalesce((p_data->>'sort_order')::integer, 0))
    returning id into v_id;
  else
    update edition_contact set
      type          = coalesce(v_typ, type),
      display_name  = coalesce(nullif(btrim(p_data->>'display_name'), ''), display_name),
      role_label_de = case when p_data ? 'role_label_de' then nullif(btrim(p_data->>'role_label_de'), '') else role_label_de end,
      role_label_en = case when p_data ? 'role_label_en' then nullif(btrim(p_data->>'role_label_en'), '') else role_label_en end,
      email         = coalesce(nullif(btrim(p_data->>'email'), '')::citext, email),
      phone         = coalesce(nullif(btrim(p_data->>'phone'), ''), phone),
      photo_path    = case when p_data ? 'photo_path' then nullif(btrim(p_data->>'photo_path'), '') else photo_path end,
      is_default    = coalesce((p_data->>'is_default')::boolean, is_default),
      sort_order    = coalesce((p_data->>'sort_order')::integer, sort_order),
      updated_at    = now()
     where id = v_id;
    if not found then raise exception 'contact_not_found' using errcode = 'P0002', detail = v_id::text; end if;
  end if;

  perform log_audit('edition_contact.upsert', 'edition_contact', v_id::text, null, p_data - 'photo_path');
  return v_id;
end $$;

create or replace function delete_edition_contact(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  if not can_edit_edition_contacts() then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from edition_contact where id = p_id;
  if not found then raise exception 'contact_not_found' using errcode = 'P0002', detail = p_id::text; end if;
  perform log_audit('edition_contact.delete', 'edition_contact', p_id::text, null, null);
end $$;

/** Zuordnung je Partner. NULL setzt zurück auf den Standard. */
create or replace function set_org_contacts(p_org_edition_id uuid, p_lead uuid, p_buddy uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  if not can_edit_edition_contacts() then raise exception 'not allowed' using errcode = '42501'; end if;
  update org_edition set lead_contact_id = p_lead, buddy_contact_id = p_buddy, updated_at = now()
   where id = p_org_edition_id;
  if not found then raise exception 'org_edition_not_found' using errcode = 'P0002', detail = p_org_edition_id::text; end if;
  perform log_audit('edition_contact.assign_org', 'org_edition', p_org_edition_id::text, null,
                    jsonb_build_object('lead', p_lead, 'buddy', p_buddy));
end $$;

/** Zuordnung je Speaker. NULL setzt zurück auf den Standard. */
create or replace function set_speaker_contacts(p_profile_id uuid, p_lead uuid, p_buddy uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  if not can_edit_edition_contacts() then raise exception 'not allowed' using errcode = '42501'; end if;
  update speaker_profile set lead_contact_id = p_lead, buddy_contact_id = p_buddy, updated_at = now()
   where id = p_profile_id;
  if not found then raise exception 'profile_not_found' using errcode = 'P0002', detail = p_profile_id::text; end if;
  perform log_audit('edition_contact.assign_speaker', 'speaker_profile', p_profile_id::text, null,
                    jsonb_build_object('lead', p_lead, 'buddy', p_buddy));
end $$;

create or replace function upsert_edition_info(p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_id uuid; v_ed uuid; v_aud text[];
begin
  if not can_edit_edition_contacts() then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(nullif(p_data->>'edition_id','')::uuid,
                  (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;
  v_aud := coalesce((select array_agg(value::text) from jsonb_array_elements_text(p_data->'audience') as t(value)), '{}');
  if cardinality(v_aud) = 0 then
    raise exception 'invalid_audience' using errcode = '22023', detail = 'leer';
  end if;

  insert into edition_info (edition_id, key, audience, label_de, label_en, value_de, value_en, sort_order)
  values (v_ed, btrim(p_data->>'key'), v_aud,
          nullif(btrim(p_data->>'label_de'), ''), nullif(btrim(p_data->>'label_en'), ''),
          nullif(btrim(p_data->>'value_de'), ''), nullif(btrim(p_data->>'value_en'), ''),
          coalesce((p_data->>'sort_order')::integer, 0))
  on conflict (edition_id, key) do update set
    audience = excluded.audience, label_de = excluded.label_de, label_en = excluded.label_en,
    value_de = excluded.value_de, value_en = excluded.value_en,
    sort_order = excluded.sort_order, updated_at = now()
  returning id into v_id;

  perform log_audit('edition_info.upsert', 'edition_info', v_id::text, null, p_data);
  return v_id;
end $$;

create or replace function delete_edition_info(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  if not can_edit_edition_contacts() then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from edition_info where id = p_id;
  if not found then raise exception 'info_not_found' using errcode = 'P0002', detail = p_id::text; end if;
  perform log_audit('edition_info.delete', 'edition_info', p_id::text, null, null);
end $$;

/** Für die Admin-Sektion: der ganze Pool einer Edition. */
create or replace function edition_contacts_admin(p_edition_id uuid default null)
returns table (id uuid, type text, display_name text, role_label_de text, role_label_en text,
               email text, phone text, photo_path text, is_default boolean, sort_order integer,
               orgs integer, speakers integer)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid;
begin
  if not can_edit_edition_contacts() then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;
  return query
    select c.id, c.type, c.display_name, c.role_label_de, c.role_label_en, c.email::text, c.phone,
           c.photo_path, c.is_default, c.sort_order,
           (select count(*)::integer from org_edition oe
             where oe.lead_contact_id = c.id or oe.buddy_contact_id = c.id),
           (select count(*)::integer from speaker_profile sp
             where sp.lead_contact_id = c.id or sp.buddy_contact_id = c.id)
      from edition_contact c
     where c.edition_id = v_ed
     order by c.type, c.sort_order, c.display_name;
end $$;

select harden_definer_functions();
