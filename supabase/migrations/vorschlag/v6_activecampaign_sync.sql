-- 0000 · ActiveCampaign-Sync: Themen als Tags, Abmeldungen zurück (TAL-009, K-43)
-- Anlass: Konzept docs/talent-konzepte-009-011.md, Konrads Antworten K-43 (02.10.2026): der
-- ActiveCampaign-Schlüssel legt Konrad an, der Sync kommt als eigener Baustein vor dem 01.11.
-- Masterplan: aus = Segmente/Tags, ein = Opt-in/Abmeldung, täglich, Log und Diff-Report.
--
-- Diese Migration trägt nur die Datenbankseite; den Abgleich mit ActiveCampaign fährt der Cron
-- `/api/cron/activecampaign-sync` (lib/activecampaign), und zwar erst mit `ACTIVECAMPAIGN_WRITE_ENABLED`.
--   1 `ac_contact`: Stand, der in ActiveCampaign gesetzt ist (Kontakt-Id, Themen-Tags) — RLS an,
--     keine Grants; ohne ihn wüsste der Sync nicht, welche Tags er wieder entfernen muss.
--   2 Nur Server (Dienstschlüssel, `auth.uid() is null`):
--     (Hilfsfunktionen `ac_outbound_rows/ac_withdrawn_rows` ohne Zugriff von außen liefern die Zeilen.)
--     `ac_sync_outbound(limit)`: erreichbare Personen (Newsletter erteilt, Adresse nicht gesperrt,
--       Profil nicht gelöscht) mit gewählten Themen, deren Stand von `ac_contact` abweicht;
--     `ac_sync_withdrawn(limit)`: Personen mit Stand in ActiveCampaign, die nicht mehr senden
--       dürfen — Aktion `delete` (Profil gelöscht oder Adresse gesperrt: Kontakt dort löschen),
--       `unsubscribe` (Newsletter widerrufen), `untag` (erreichbar, aber ohne Themen);
--     `ac_mark_synced` (Themen sortiert gespeichert), `ac_mark_removed`: Stand fortschreiben;
--     `ac_apply_unsubscribe(email)`: eine Abmeldung aus ActiveCampaign wird als Widerruf von
--       `newsletter` (source `activecampaign`) in `consent_record` geschrieben.
--   3 `ac_sync_status()` für den Admin-Abschnitt `notifications`: nur Zahlen und der letzte Lauf.
-- Kein Audit je Kontakt (Massenlauf); der Lauf steht in `integration.sync_job` (system activecampaign).
-- Fehlerschlüssel: keine neuen.
-- Test: supabase/tests/v6_activecampaign_sync.sql
set search_path = public, extensions;

-- ---------------------------------------------------------------- 1 · Stand in ActiveCampaign

create table if not exists ac_contact (
  person_id     uuid primary key references person(id) on delete cascade,
  ac_contact_id text not null,
  topics        text[] not null default '{}',
  synced_at     timestamptz not null default now()
);
comment on table ac_contact is
  'Was in ActiveCampaign für diese Person gesetzt ist (Kontakt-Id, Themen-Tags). Nur Server (ActiveCampaign-Sync, TAL-009).';
alter table ac_contact enable row level security;
revoke all on ac_contact from anon, authenticated;

-- ---------------------------------------------------------------- 2 · Server-Funktionen

-- Die Abfragen liegen in Hilfsfunktionen ohne Zugriff von außen; die Server-Funktionen und der
-- Admin-Status (angemeldet, Abschnitt notifications) lesen dieselben Zeilen.
create or replace function ac_outbound_rows()
 RETURNS TABLE(person_id uuid, email text, first_name text, last_name text, preferred_language text,
               topics text[], ac_contact_id text, previous_topics text[], synced_at timestamptz)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  with cur as (
    select i.person_id, array_agg(i.term_key order by i.term_key) as topics
      from person_interest i
      join vocab_term v on v.vocabulary = 'notification_topic' and v.key = i.term_key and v.active
     where i.vocabulary = 'notification_topic'
     group by i.person_id)
  select p.id, e.email::text, p.first_name, p.last_name, p.preferred_language,
         cur.topics, a.ac_contact_id, coalesce(a.topics, '{}'), a.synced_at
    from cur
    join person p on p.id = cur.person_id
    join person_email e on e.person_id = p.id and e.is_primary
    left join ac_contact a on a.person_id = p.id
   where notification_reachable(p.id) and (a.person_id is null or a.topics is distinct from cur.topics)
$$;
revoke all on function ac_outbound_rows() from public, anon, authenticated;

create or replace function ac_withdrawn_rows()
 RETURNS TABLE(person_id uuid, email text, ac_contact_id text, topics text[], action text, synced_at timestamptz)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select a.person_id,
         (select e.email::text from person_email e where e.person_id = a.person_id and e.is_primary),
         a.ac_contact_id, a.topics,
         case
           when p.deleted_at is not null
             or exists (select 1 from person_email e join suppression s on s.email_hash = email_hash(e.email::text)
                         where e.person_id = a.person_id and e.is_primary) then 'delete'
           when not notification_reachable(a.person_id) then 'unsubscribe'
           else 'untag'
         end,
         a.synced_at
    from ac_contact a
    join person p on p.id = a.person_id
   where not notification_reachable(a.person_id)
      or (a.topics <> '{}'                     -- ohne Themen nur einmal „untag“: danach steht der Stand auf leer
          and not exists (select 1 from person_interest i
                           join vocab_term v on v.vocabulary = 'notification_topic' and v.key = i.term_key and v.active
                          where i.person_id = a.person_id and i.vocabulary = 'notification_topic'))
$$;
revoke all on function ac_withdrawn_rows() from public, anon, authenticated;

create or replace function ac_sync_outbound(p_limit integer default 40)
 RETURNS TABLE(person_id uuid, email text, first_name text, last_name text, preferred_language text,
               topics text[], ac_contact_id text, previous_topics text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select r.person_id, r.email, r.first_name, r.last_name, r.preferred_language, r.topics, r.ac_contact_id, r.previous_topics
      from ac_outbound_rows() r
     order by r.synced_at nulls first, r.person_id
     limit greatest(least(coalesce(p_limit, 40), 200), 1);
end $$;

create or replace function ac_sync_withdrawn(p_limit integer default 40)
 RETURNS TABLE(person_id uuid, email text, ac_contact_id text, topics text[], action text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select r.person_id, r.email, r.ac_contact_id, r.topics, r.action
      from ac_withdrawn_rows() r
     order by r.synced_at, r.person_id
     limit greatest(least(coalesce(p_limit, 40), 200), 1);
end $$;

create or replace function ac_mark_synced(p_person_id uuid, p_contact_id text, p_topics text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_contact_id, '')), '') is null then raise exception 'fields_required' using errcode = '22023'; end if;
  insert into ac_contact (person_id, ac_contact_id, topics, synced_at)
  values (p_person_id, btrim(p_contact_id), coalesce((select array_agg(distinct t order by t) from unnest(p_topics) t), '{}'), now())
  on conflict (person_id) do update set ac_contact_id = excluded.ac_contact_id, topics = excluded.topics, synced_at = now();
end $$;

create or replace function ac_mark_removed(p_person_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from ac_contact where person_id = p_person_id;
end $$;

-- Eine Abmeldung in ActiveCampaign ist ein Widerruf der Newsletter-Einwilligung (Opt-in-Rückfluss).
-- Gibt zurück, ob etwas geschrieben wurde; wer schon widerrufen hat oder nicht bekannt ist, bleibt unberührt.
create or replace function ac_apply_unsubscribe(p_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_person uuid; v_version text;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  select pe.person_id into v_person from person_email pe join person p on p.id = pe.person_id
   where lower(pe.email::text) = lower(btrim(coalesce(p_email, ''))) and p.deleted_at is null
   order by pe.is_primary desc limit 1;
  if v_person is null then return false; end if;
  select c.version into v_version from consent_current c
   where c.person_id = v_person and c.consent_type = 'newsletter' and c.granted;
  if v_version is null then return false; end if;
  insert into consent_record (person_id, consent_type, version, granted, source, meta)
  values (v_person, 'newsletter', v_version, false, 'activecampaign', jsonb_build_object('via', 'activecampaign'));
  return true;
end $$;

-- Nur der Server (Dienstschlüssel) ruft diese Funktionen; angemeldete Nutzer erreichen sie gar nicht erst.
revoke execute on function ac_sync_outbound(integer) from public, anon, authenticated;
revoke execute on function ac_sync_withdrawn(integer) from public, anon, authenticated;
revoke execute on function ac_mark_synced(uuid, text, text[]) from public, anon, authenticated;
revoke execute on function ac_mark_removed(uuid) from public, anon, authenticated;
revoke execute on function ac_apply_unsubscribe(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- 3 · Status im Admin

create or replace function ac_sync_status()
 RETURNS TABLE(contacts integer, pending_out integer, pending_withdrawn integer,
               last_status text, last_at timestamptz, last_stats jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not coalesce(has_admin_section('notifications'), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select (select count(*)::integer from ac_contact),
           (select count(*)::integer from ac_outbound_rows()),
           (select count(*)::integer from ac_withdrawn_rows()),
           j.status, j.started_at, j.stats
      from (select 1) x
      left join lateral (select s.status, s.started_at, s.stats from integration.sync_job s
                          where s.system = 'activecampaign' order by s.started_at desc limit 1) j on true;
end $$;

select harden_definer_functions();
