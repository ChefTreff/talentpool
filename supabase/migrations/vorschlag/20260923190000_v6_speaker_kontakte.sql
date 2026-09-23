-- 0148 · Welle 6 · Assistenz und Agentur zu einem Kontakt (SPK-040)
--
-- Nummer 0148 von der Architektur-Session zugeteilt (23.09.; ersetzt die
-- Vormerkung 0128). Vorschlag der Build-Session Speaker-Domäne; Anwenden,
-- Umbenennen und der Eintrag ins Entscheidungslog gehören ihr.
--
-- Anlass: Konrad am 21.09. — „Assistenz und ‚Agentur oder Office' sind zwei
-- Abschnitte für dieselbe Sache → zu einem ‚Kontakt hinzufügen' zusammenlegen:
-- Art des Kontakts (Assistenz, Agentur, Office …) plus die Frage, ob die Person
-- einen Zugang bekommt. Auch eine Agentur füllt solche Seiten aus und braucht
-- dann einen Zugang." Freigegeben am 22.09. **Ersetzt SPK-021** (mehrere
-- Logins je Speaker).
--
-- Bisher stand dasselbe an zwei Stellen: `speaker_profile.assistant_person_id`
-- (genau eine Assistenz, mit Zugang) und die Felder `contact_*` aus 0127 (genau
-- ein Kontakt, ohne Zugang, mit Art und Einwilligung). Beides wird eine
-- Tabelle, in der die Art und der Zugang zwei Angaben derselben Zeile sind.
--
-- **Additiv.** Die alten Spalten bleiben stehen und werden weiter gelesen; das
-- Entfernen ist eine spätere Migration (Auflage der Architektur-Session). So
-- kann nichts halb umgezogen sein.
--
-- **Die Rechtekette geht durch eine Stelle.** Zwanzig Funktionen fragten bisher
-- selbst `assistant_person_id = v_me`. Sie fragen ab jetzt
-- `is_speaker_assistant(profile, person)` — dieselbe Antwort, aber an einem Ort.
-- Wer später die alte Spalte entfernt, ändert diese eine Funktion.
--
-- **`coalesce` in jeder Kette.** `v_assistant = v_me` ist ohne Assistenz NULL,
-- und `if not NULL` löst nicht aus — genau im Fall, der abgewiesen gehört
-- hätte (Hotfix 0118). `is_speaker_assistant` gibt deshalb nie NULL zurück.
--
-- **Zugang nur mit Einwilligung.** Eine Zeile ohne `consent_at` gibt es nicht:
-- die Daten gehören einem Menschen, der hier kein Konto hat und nicht gefragt
-- wurde (dieselbe Regel wie 0127).
--
-- Fehlerschlüssel: 28000 ohne Login · 42501 ohne Recht ·
-- P0002 `speaker_not_found` / `contact_not_found` ·
-- 22023 `invalid_contact_kind` / `speaker_contact_consent_required` /
-- `contact_email_required` / `contact_empty` ·
-- 23514 `contact_is_speaker` · P0001 `suppressed`.

set search_path = public, extensions;

create table if not exists speaker_contact (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references speaker_profile(id) on delete cascade,
  -- Vokabular `speaker_contact_kind` aus 0127: agency, office, management,
  -- assistant, other. Die Art sagt, wer es ist; `has_access`, was er darf —
  -- das sind zwei Fragen, und genau deshalb waren es vorher zwei Abschnitte.
  kind        text not null,
  -- Gesetzt, sobald der Kontakt einen Zugang hat: dann gehört ihm eine
  -- `person`-Zeile mit Login. Ohne Zugang bleibt es bei Name und Adresse.
  person_id   uuid references person(id) on delete set null,
  first_name  text,
  last_name   text,
  email       citext,
  phone       text,
  has_access  boolean not null default false,
  -- Wie in 0127 ein Datum, keine Zeit: die Speakerin bestätigt einen Tag, an
  -- dem sie das Einverständnis hatte, nicht eine Sekunde.
  consent_at  date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint speaker_contact_empty_chk
    check (coalesce(first_name, last_name, email::text, phone) is not null),
  -- Ein Zugang ohne Adresse ginge nicht: die Einladung geht per Mail.
  constraint speaker_contact_access_chk
    check (not has_access or (person_id is not null and email is not null))
);

comment on table speaker_contact is
  'Kontakte einer Speakerin (SPK-040, 0148): Assistenz, Agentur, Office … in einer Tabelle, mit `has_access` für den Portalzugang. Löst `speaker_profile.assistant_person_id` und die Felder `contact_*` ab; die bleiben vorerst additiv stehen.';
comment on column speaker_contact.has_access is
  'Ob der Kontakt sich anmelden darf. Trägt die Rolle `speaker_assistant` der Edition; die Rechteprüfungen fragen über `is_speaker_assistant`.';
comment on column speaker_contact.consent_at is
  'Tag, an dem die Speakerin das Einverständnis dieser Person bestätigt hat. Pflicht — ohne sie speichern wir fremde Kontaktdaten nicht (Art. 6 DSGVO, wie 0127).';

create unique index if not exists speaker_contact_person_uidx
  on speaker_contact (profile_id, person_id) where person_id is not null;
create index if not exists speaker_contact_profile_idx on speaker_contact (profile_id);
create index if not exists speaker_contact_access_idx
  on speaker_contact (person_id) where has_access;

alter table speaker_contact enable row level security;
revoke all on speaker_contact from anon, authenticated;

/**
 * Ein Kontakt darf nicht die Speakerin selbst sein, und die Art muss es geben.
 *
 * Als Trigger, weil beides über die Zeile hinaussieht: die Person hängt am
 * Profil, das Vokabular in einer anderen Tabelle. Dieselbe Regel wie in
 * `speaker_profile_check` für die alte Spalte.
 */
create or replace function speaker_contact_check()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_vocab_key('speaker_contact_kind', new.kind) then
    raise exception 'invalid_contact_kind' using errcode = '22023', detail = coalesce(new.kind, 'null');
  end if;
  if new.person_id is not null
     and exists (select 1 from speaker_profile sp
                  where sp.id = new.profile_id and sp.person_id = new.person_id) then
    raise exception 'contact_is_speaker' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists speaker_contact_check_trg on speaker_contact;
create trigger speaker_contact_check_trg
  before insert or update on speaker_contact
  for each row execute function speaker_contact_check();

-- --------------------------------------------------- die eine Rechtefrage
/**
 * Ist diese Person die Assistenz dieses Profils?
 *
 * Fragt **beide** Quellen: die alte Spalte und die neue Tabelle. Solange der
 * Umzug additiv ist, müssen beide gelten; wer die Spalte später entfernt,
 * ändert genau diese Funktion und sonst nichts.
 *
 * Gibt nie NULL zurück — der Grund steht im Kopf der Migration.
 */
create or replace function is_speaker_assistant(p_profile_id uuid, p_person_id uuid)
returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select p_person_id is not null and p_profile_id is not null and (
    exists (select 1 from speaker_profile sp
             where sp.id = p_profile_id and sp.assistant_person_id = p_person_id)
    or exists (select 1 from speaker_contact c
                where c.profile_id = p_profile_id and c.person_id = p_person_id and c.has_access)
  )
$$;

revoke all on function is_speaker_assistant(uuid, uuid) from public, anon;
grant execute on function is_speaker_assistant(uuid, uuid) to authenticated;

-- ---------------------------------------------------------- Bestand umziehen
-- Jede hinterlegte Assistenz und jeder Kontakt aus 0127 bekommt eine Zeile.
-- `on conflict do nothing`, damit ein zweiter Lauf nichts verdoppelt.
insert into speaker_contact (profile_id, kind, person_id, first_name, last_name, email, phone,
                             has_access, consent_at)
select sp.id, 'assistant', sp.assistant_person_id, p.first_name, p.last_name,
       (select pe.email from person_email pe
         where pe.person_id = p.id and pe.is_primary limit 1),
       null, true,
       -- Die Einwilligung liegt in der Einladung selbst: wer eingeladen wurde,
       -- ist gefragt worden. Als Tag nehmen wir den der Anlage des Profils —
       -- ein späteres Datum zu erfinden wäre schlechter als ein frühes.
       coalesce(sp.created_at::date, current_date)
  from speaker_profile sp
  join person p on p.id = sp.assistant_person_id
 where sp.assistant_person_id is not null
   and not exists (select 1 from speaker_contact c
                    where c.profile_id = sp.id and c.person_id = sp.assistant_person_id);

insert into speaker_contact (profile_id, kind, person_id, first_name, last_name, email, phone,
                             has_access, consent_at)
select sp.id, coalesce(nullif(sp.contact_kind, ''), 'other'), null,
       sp.contact_first_name, sp.contact_last_name, sp.contact_email, sp.contact_phone,
       false, coalesce(sp.contact_consent_at, sp.updated_at::date, current_date)
  from speaker_profile sp
 where coalesce(sp.contact_first_name, sp.contact_last_name,
                sp.contact_email::text, sp.contact_phone) is not null
   and not exists (select 1 from speaker_contact c
                    where c.profile_id = sp.id and c.person_id is null
                      and c.kind = coalesce(nullif(sp.contact_kind, ''), 'other'));

-- ------------------------------------------------------------------ lesen
/**
 * Die Kontakte einer Speakerin.
 *
 * Eigenes Profil, eine Assistenz mit Zugang oder das Team. Die Adresse eines
 * Kontakts steht nur da, weil die Speakerin sie eingetragen hat — sie geht
 * niemanden sonst etwas an.
 */
create or replace function my_speaker_contacts(p_profile_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id();
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile
   where id = coalesce(p_profile_id, my_speaker_profile_id(null));
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce((v_sp.person_id = v_me or is_speaker_assistant(v_sp.id, v_me)
                   or can_manage_speaker(v_sp.id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'kind', c.kind,
             'first_name', c.first_name, 'last_name', c.last_name,
             'email', c.email, 'phone', c.phone,
             'has_access', c.has_access,
             'consent_at', c.consent_at,
             -- Ob die Einladung schon angenommen wurde: ohne `auth_user_id`
             -- hat die Person noch kein Konto.
             'signed_in', (select p.auth_user_id is not null from person p where p.id = c.person_id))
           order by c.kind, c.created_at)
      from speaker_contact c where c.profile_id = v_sp.id), '[]'::jsonb);
end $$;

revoke all on function my_speaker_contacts(uuid) from public, anon;
grant execute on function my_speaker_contacts(uuid) to authenticated;

/**
 * Den Zugang einer Person für eine Edition zurücknehmen — aber nur, wenn sie
 * nicht bei einem anderen Profil derselben Edition steht.
 *
 * Steckte vorher zweimal wortgleich in `invite_assistant` und
 * `remove_assistant`. Zwei Kopien einer Rechtefrage sind eine zu viel.
 */
create or replace function speaker_access_revoke(p_person_id uuid, p_edition_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_person_id is null then return; end if;
  if exists (select 1 from speaker_profile s
              where s.assistant_person_id = p_person_id and s.edition_id = p_edition_id)
     or exists (select 1 from speaker_contact c
                join speaker_profile s on s.id = c.profile_id
                where c.person_id = p_person_id and c.has_access and s.edition_id = p_edition_id) then
    return;
  end if;
  update role_assignment set valid_to = greatest(now(), valid_from + interval '1 second')
   where person_id = p_person_id and role = 'speaker_assistant' and scope_type = 'edition'
     and edition_id = p_edition_id and (valid_to is null or valid_to > now());
end $$;

revoke all on function speaker_access_revoke(uuid, uuid) from public, anon, authenticated;

-- --------------------------------------------------------------- pflegen
/**
 * Kontakt anlegen oder ändern — **ein** Formular für Assistenz und Agentur.
 *
 * Wer darf: die Speakerin selbst oder das Team. Eine Assistenz **nicht** —
 * sonst könnte sie sich Gesellschaft mit Zugang dazuholen, und die Einladung
 * ins Portal wäre keine Entscheidung der Speakerin mehr.
 *
 * Mit `has_access` wird aus dem Kontakt ein Zugang: die Person wird angelegt
 * oder gefunden, bekommt die Rolle `speaker_assistant` der Edition und eine
 * Einladung. Wird der Zugang zurückgenommen, geht die Rolle wieder — aber nur,
 * wenn die Person nicht bei einem anderen Profil derselben Edition steht.
 */
create or replace function upsert_speaker_contact(p_data jsonb)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_sp speaker_profile%rowtype; v_me uuid := current_person_id();
  v_id uuid := nullif(p_data->>'id', '')::uuid; v_alt speaker_contact%rowtype;
  v_kind text; v_email citext; v_vor text; v_nach text; v_tel text;
  v_access boolean; v_consent date; v_pid uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile
   where id = coalesce(nullif(p_data->>'profile_id', '')::uuid, my_speaker_profile_id(null))
   for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce((v_sp.person_id = v_me or can_manage_speaker(v_sp.id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_id is not null then
    select * into v_alt from speaker_contact where id = v_id and profile_id = v_sp.id for update;
    if not found then raise exception 'contact_not_found' using errcode = 'P0002'; end if;
  end if;

  -- Erst ausrechnen, was nach dem Schreiben dastünde, dann prüfen: sonst
  -- scheitert eine reine Namenskorrektur an der Einwilligung (Lehre aus 0114,
  -- übernommen aus 0127).
  v_kind   := coalesce(nullif(btrim(coalesce(p_data->>'kind', '')), ''), v_alt.kind);
  v_vor    := nullif(btrim(coalesce(case when p_data ? 'first_name' then p_data->>'first_name' else v_alt.first_name end, '')), '');
  v_nach   := nullif(btrim(coalesce(case when p_data ? 'last_name'  then p_data->>'last_name'  else v_alt.last_name  end, '')), '');
  v_tel    := nullif(btrim(coalesce(case when p_data ? 'phone'      then p_data->>'phone'      else v_alt.phone      end, '')), '');
  v_email  := nullif(btrim(coalesce(case when p_data ? 'email'      then p_data->>'email'      else v_alt.email::text end, '')), '')::citext;
  v_access := coalesce(case when p_data ? 'has_access' then (p_data->>'has_access')::boolean else v_alt.has_access end, false);
  v_consent := case when p_data ? 'consent_at'
                    then nullif(btrim(p_data->>'consent_at'), '')::date
                    else v_alt.consent_at end;

  if v_kind is null then raise exception 'invalid_contact_kind' using errcode = '22023', detail = 'null'; end if;
  if coalesce(v_vor, v_nach, v_email::text, v_tel) is null then
    raise exception 'contact_empty' using errcode = '22023';
  end if;
  if v_consent is null then
    -- Die Daten gehören einem Menschen, der hier kein Konto hat und nicht
    -- gefragt wurde. Ohne die Bestätigung der Speakerin speichern wir sie nicht.
    raise exception 'speaker_contact_consent_required' using errcode = '22023', detail = 'speaker_contact';
  end if;
  if v_access and v_email is null then
    raise exception 'contact_email_required' using errcode = '22023';
  end if;

  -- Zugang: Person suchen oder anlegen, wie `invite_assistant` es tat.
  v_pid := v_alt.person_id;
  if v_access then
    if is_suppressed(v_email::text) then raise exception 'suppressed' using errcode = 'P0001'; end if;
    select pe.person_id into v_pid from person_email pe join person p on p.id = pe.person_id
     where pe.email = v_email and p.deleted_at is null limit 1;
    if v_pid is null then
      insert into person (first_name, last_name, source_first, tier)
      values (v_vor, v_nach, 'speaker_portal', 'lead') returning id into v_pid;
      insert into person_email (person_id, email, is_primary, verified) values (v_pid, v_email, true, false);
    end if;
    if v_pid = v_sp.person_id then raise exception 'contact_is_speaker' using errcode = '23514'; end if;
  end if;

  if v_id is null then
    insert into speaker_contact (profile_id, kind, person_id, first_name, last_name, email, phone,
                                 has_access, consent_at)
    values (v_sp.id, v_kind, case when v_access then v_pid end, v_vor, v_nach, v_email, v_tel,
            v_access, v_consent)
    returning id into v_id;
  else
    update speaker_contact
       set kind = v_kind, person_id = case when v_access then v_pid else person_id end,
           first_name = v_vor, last_name = v_nach, email = v_email, phone = v_tel,
           has_access = v_access, consent_at = v_consent
     where id = v_id;
  end if;

  if v_access then
    insert into role_assignment (person_id, role, scope_type, edition_id, granted_by, note)
    values (v_pid, 'speaker_assistant', 'edition', v_sp.edition_id, v_me, 'contact of ' || v_sp.id::text)
    on conflict (person_id, role, scope_type,
                 coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 coalesce(edition_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 coalesce(portal, ''))
    do update set valid_to = null, granted_by = v_me;
    -- Einladung nur beim ersten Mal: ein zweiter Klick auf „Speichern" soll
    -- keine zweite Mail auslösen.
    if v_alt.id is null or not v_alt.has_access or v_alt.person_id is distinct from v_pid then
      perform queue_mail('assistant_invite', v_pid,
        jsonb_build_object('speaker_name', (select btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
                                              from person p where p.id = v_sp.person_id),
                           'edition_name', (select e.name from event e where e.id = v_sp.edition_id)),
        'speaker_profile', v_sp.id);
    end if;
  elsif v_alt.has_access and v_alt.person_id is not null then
    perform speaker_access_revoke(v_alt.person_id, v_sp.edition_id);
  end if;

  perform log_audit('speaker.contact_upsert', 'speaker_contact', v_id::text,
                    case when v_alt.id is null then null else to_jsonb(v_alt) - 'email' - 'phone' end,
                    jsonb_build_object('kind', v_kind, 'has_access', v_access));
  return v_id;
end $$;

revoke all on function upsert_speaker_contact(jsonb) from public, anon;
grant execute on function upsert_speaker_contact(jsonb) to authenticated;


/** Kontakt entfernen; ein Zugang geht damit auch. */
create or replace function remove_speaker_contact(p_contact_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_c speaker_contact%rowtype; v_sp speaker_profile%rowtype; v_me uuid := current_person_id();
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_c from speaker_contact where id = p_contact_id for update;
  if not found then raise exception 'contact_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_c.profile_id;
  if not coalesce((v_sp.person_id = v_me or can_manage_speaker(v_sp.id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  delete from speaker_contact where id = p_contact_id;
  if v_c.has_access then perform speaker_access_revoke(v_c.person_id, v_sp.edition_id); end if;
  perform log_audit('speaker.contact_remove', 'speaker_contact', p_contact_id::text,
                    jsonb_build_object('kind', v_c.kind, 'has_access', v_c.has_access), null);
end $$;

revoke all on function remove_speaker_contact(uuid) from public, anon;
grant execute on function remove_speaker_contact(uuid) to authenticated;

-- ===================================================================
-- Die Rechtekette, jetzt über `is_speaker_assistant`
--
-- Alle Fassungen aus `supabase/snapshot/functions/` genommen; geändert ist je
-- Funktion nur die Zeile, die bisher selbst `assistant_person_id` verglich.
-- Die `coalesce`-Klammern darum bleiben, wie sie waren (Hotfix 0118).
-- ===================================================================



-- ---- cancel_companion_ticket
create or replace function cancel_companion_ticket(p_ticket_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_t ticket%rowtype; v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_team boolean;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_t from ticket where id = p_ticket_id and source = 'speaker_companion' for update;
  if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_t.speaker_profile_id;
  v_team := is_speaker_team(v_sp.edition_id);
  if not coalesce((v_team or v_sp.person_id = v_me or is_speaker_assistant(v_sp.id, v_me) or can_manage_speaker(v_sp.id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_t.status = 'cancelled' then return; end if;
  if v_t.status = 'valid' and not v_team then raise exception 'already_issued' using errcode = 'P0001'; end if;  -- ausgestellt: nur Team (Storno in vivenu)
  if v_t.status not in ('requested', 'approved', 'valid') then raise exception 'not_cancellable' using errcode = 'P0001', detail = v_t.status; end if;
  update ticket set status = 'cancelled' where id = p_ticket_id;
  perform log_audit('ticket.companion_cancelled', 'ticket', p_ticket_id::text, jsonb_build_object('status', v_t.status),
                    jsonb_build_object('status', 'cancelled', 'by_team', v_team));
end $$;


-- ---- cancel_hospitality
create or replace function cancel_hospitality(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_b hospitality_booking%rowtype; v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_next uuid;
begin
  select * into v_b from hospitality_booking where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_b.profile_id;
  if not coalesce((v_sp.person_id = v_me or is_speaker_assistant(v_sp.id, v_me) or can_manage_speaker(v_sp.id) or is_staff()), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_b.status = 'cancelled' then return; end if;
  update hospitality_booking set status = 'cancelled', cancelled_at = now() where id = p_booking_id;
  if v_b.status in ('requested', 'confirmed') then
    select id into v_next from hospitality_booking where quota_id = v_b.quota_id and status = 'waitlisted' order by created_at limit 1;
    if v_next is not null then update hospitality_booking set status = 'requested' where id = v_next; end if;
  end if;
  if not exists (select 1 from hospitality_booking b where b.profile_id = v_sp.id and b.status <> 'cancelled') and v_sp.hospitality_status in ('requested', 'booked') then
    update speaker_profile set hospitality_status = 'eligible' where id = v_sp.id;
  end if;
  perform log_audit('hospitality.cancel', 'hospitality_booking', p_booking_id::text, jsonb_build_object('status', v_b.status), jsonb_build_object('promoted', v_next));
end $$;


-- ---- delete_speaker_asset
create or replace function delete_speaker_asset(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id();
  v_a speaker_asset%rowtype;
  v_sp speaker_profile%rowtype;
  v_naechste uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  select * into v_a from speaker_asset where id = p_id;
  if not found then raise exception 'asset_not_found' using errcode = 'P0002'; end if;

  select * into v_sp from speaker_profile where id = v_a.profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;

  -- Dieselbe Prüfung wie beim Hochladen. `coalesce` ist hier keine Zierde:
  -- ohne hinterlegte Assistenz wäre `is_speaker_assistant(...)` NULL und
  -- die ganze Kette NULL statt false (Hotfix 0118).
  if not coalesce((v_sp.person_id = v_me or is_speaker_assistant(v_sp.id, v_me)
                   or can_manage_speaker(v_a.profile_id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_a.kind <> 'presentation' then
    raise exception 'kind_not_deletable' using errcode = '22023', detail = v_a.kind;
  end if;

  delete from speaker_asset where id = p_id;

  -- War es die aktuelle Fassung, rückt die höchste verbliebene Version nach.
  if v_a.is_current then
    select a.id into v_naechste
      from speaker_asset a
     where a.profile_id = v_a.profile_id and a.kind = v_a.kind
       and coalesce(a.session_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = coalesce(v_a.session_id, '00000000-0000-0000-0000-000000000000'::uuid)
     order by a.version desc limit 1;
    if v_naechste is not null then
      update speaker_asset set is_current = true where id = v_naechste;
    end if;
  end if;

  perform log_audit('speaker.asset_deleted', 'speaker_profile', v_a.profile_id::text, null,
    jsonb_build_object('asset_id', p_id, 'kind', v_a.kind, 'version', v_a.version,
                       'session_id', v_a.session_id, 'restored', v_naechste));
  return v_a.storage_path;
end $$;


-- ---- expense_eligibility
create or replace function expense_eligibility(p_profile_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_reason text;
begin
  select * into v_sp from speaker_profile where id = coalesce(p_profile_id, my_speaker_profile_id(null));
  if not found then return null; end if;
  if not coalesce((v_sp.person_id = v_me or is_speaker_assistant(v_sp.id, v_me) or can_manage_speaker(v_sp.id) or is_expense_approver()), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_reason := case when not v_sp.travel_costs_covered then 'not_covered' when v_sp.travel_costs_approved_at is null then 'not_approved' end;
  return jsonb_build_object('eligible', v_reason is null, 'reason', v_reason, 'covered', v_sp.travel_costs_covered,
                            'approved', v_sp.travel_costs_approved_at is not null, 'is_assistant', v_sp.person_id <> v_me,
                            'mode', v_sp.expense_mode,
                            'lump_sum_cents', v_sp.expense_lump_sum_cents,
                            'open_claim', (select c.id from expense_claim c where c.profile_id = v_sp.id and c.status in ('draft', 'submitted', 'approved', 'rejected') order by c.created_at desc limit 1));
end $$;


-- ---- register_speaker_asset
create or replace function register_speaker_asset(p_profile_id uuid, p_kind text, p_storage_path text, p_filename text, p_mime text DEFAULT NULL::text, p_size_bytes bigint DEFAULT NULL::bigint, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id(); v_sp speaker_profile%rowtype; v_version integer; v_late boolean := false; v_due timestamptz; v_id uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce((v_sp.person_id = v_me or is_speaker_assistant(v_sp.id, v_me) or can_manage_speaker(p_profile_id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_kind not in ('presentation', 'photo', 'other', 'receipt') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if p_storage_path not like v_sp.edition_id::text || '/' || p_profile_id::text || '/' || p_kind || '/%' then
    raise exception 'path_mismatch' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'speaker-assets' and o.name = p_storage_path) then
    raise exception 'object_not_found' using errcode = 'P0002';
  end if;
  if p_session_id is not null and not exists (select 1 from session_speaker ss where ss.session_id = p_session_id and ss.person_id = v_sp.person_id) then
    raise exception 'session_mismatch' using errcode = '22023';
  end if;
  if p_kind = 'presentation' and p_session_id is not null then
    v_due := (presentation_window(p_session_id)->>'effective_due')::timestamptz;
    v_late := v_due is not null and now() > v_due;
  end if;
  select coalesce(max(version), 0) + 1 into v_version
    from speaker_asset where profile_id = p_profile_id and kind = p_kind and coalesce(session_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_session_id, '00000000-0000-0000-0000-000000000000'::uuid);
  if p_kind in ('presentation', 'photo') then
    update speaker_asset set is_current = false
     where profile_id = p_profile_id and kind = p_kind and is_current
       and coalesce(session_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_session_id, '00000000-0000-0000-0000-000000000000'::uuid);
  end if;
  insert into speaker_asset (profile_id, session_id, kind, storage_path, filename, mime, size_bytes, version, late, uploaded_by)
  values (p_profile_id, p_session_id, p_kind, p_storage_path, p_filename, p_mime, p_size_bytes, v_version, v_late, v_me)
  returning id into v_id;
  if p_kind = 'photo' then update speaker_profile set photo_asset_id = v_id where id = p_profile_id; end if;
  perform log_audit('speaker.asset', 'speaker_profile', p_profile_id::text, null,
    jsonb_build_object('asset_id', v_id, 'kind', p_kind, 'version', v_version, 'late', v_late, 'session_id', p_session_id));
  return jsonb_build_object('id', v_id, 'version', v_version, 'late', v_late, 'effective_due', v_due);
end $$;


-- ---- request_companion_ticket
create or replace function request_companion_ticket(p_profile_id uuid, p_email text, p_first_name text, p_last_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_email citext; v_first text; v_last text; v_id uuid; v_speaker text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce((v_sp.person_id = v_me or is_speaker_assistant(v_sp.id, v_me) or can_manage_speaker(p_profile_id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not speaker_is_confirmed(v_sp.pipeline_status) then raise exception 'not_eligible' using errcode = 'P0001', detail = v_sp.pipeline_status; end if;
  v_email := lower(btrim(coalesce(p_email, '')))::citext;
  if v_email::text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email' using errcode = '22023'; end if;
  v_first := nullif(btrim(coalesce(p_first_name, '')), '');
  v_last  := nullif(btrim(coalesce(p_last_name, '')), '');
  if v_first is null or v_last is null then raise exception 'name_required' using errcode = '22023'; end if;
  if exists (select 1 from person_email pe where pe.person_id = v_sp.person_id and pe.email = v_email) then
    raise exception 'companion_is_speaker' using errcode = '22023';
  end if;
  -- zweites aktives Begleitticket ⇒ 23505 (ticket_speaker_companion_uidx)
  insert into ticket (event_id, speaker_profile_id, pass_type, lounge_access, holder_email, holder_first_name, holder_last_name,
                      status, personalization_status, price_cents, source, requested_by)
  values (v_sp.edition_id, p_profile_id, v_sp.pass_type, false, v_email, v_first, v_last, 'requested', 'partial', 0, 'speaker_companion', v_me)
  returning id into v_id;
  select btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) into v_speaker from person p where p.id = v_sp.person_id;
  perform notify_speaker_leads('companion_ticket_requested',
                               jsonb_build_object('speaker_name', v_speaker, 'companion_name', v_first || ' ' || v_last), 'ticket', v_id);
  perform log_audit('ticket.companion_requested', 'ticket', v_id::text, null,
                    jsonb_build_object('profile_id', p_profile_id, 'by_assistant', v_sp.person_id <> v_me));
  return v_id;
end $$;


-- ---- speaker_asset_path_allowed
create or replace function speaker_asset_path_allowed(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_profile uuid; v_edition uuid; v_sp speaker_profile%rowtype; v_me uuid := current_person_id();
begin
  if v_me is null or p_name is null then return false; end if;
  begin
    v_edition := split_part(p_name, '/', 1)::uuid;
    v_profile := split_part(p_name, '/', 2)::uuid;
  exception when others then return false; end;
  if split_part(p_name, '/', 3) not in ('presentation', 'photo', 'other', 'receipt', 'invoice') or split_part(p_name, '/', 4) = '' then return false; end if;
  select * into v_sp from speaker_profile where id = v_profile and edition_id = v_edition;
  if not found then return false; end if;
  if split_part(p_name, '/', 3) = 'invoice' and not coalesce((v_sp.person_id = v_me or is_speaker_assistant(v_sp.id, v_me) or is_expense_approver()), false) then return false; end if;
  return coalesce(v_sp.person_id = v_me or is_speaker_assistant(v_sp.id, v_me) or can_manage_speaker(v_profile) or is_staff(), false);
end $$;


-- ---- speaker_next_steps
create or replace function speaker_next_steps(p_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_sp speaker_profile%rowtype; v_p person%rowtype; v_me uuid := current_person_id();
  v_profile boolean; v_photo boolean; v_consents boolean; v_session boolean; v_ticket boolean; v_content boolean; v_presentation boolean; v_open text[] := '{}';
begin
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce((v_sp.person_id = v_me or is_speaker_assistant(v_sp.id, v_me) or can_manage_speaker(p_profile_id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_p from person where id = v_sp.person_id;
  v_profile  := coalesce(nullif(btrim(v_p.first_name), ''), '') <> '' and coalesce(nullif(btrim(v_p.last_name), ''), '') <> ''
                and coalesce(nullif(btrim(v_sp.job_title), ''), '') <> '' and coalesce(nullif(btrim(v_sp.bio_short_en), ''), '') <> '';
  v_photo    := v_sp.photo_asset_id is not null;
  v_consents := coalesce((select c.granted from consent_current c where c.person_id = v_p.id and c.consent_type = 'speaker_release'), false)
                and coalesce((select c.granted from consent_current c where c.person_id = v_p.id and c.consent_type = 'photo_video'), false);
  v_session  := exists (select 1 from session_speaker ss join session se on se.id = ss.session_id join event e on e.id = se.event_id
                        where ss.person_id = v_p.id and (e.edition_id = v_sp.edition_id or e.id = v_sp.edition_id));
  v_content  := v_session and not exists (
                  select 1 from session_speaker ss join session se on se.id = ss.session_id join event e on e.id = se.event_id
                  where ss.person_id = v_p.id and (e.edition_id = v_sp.edition_id or e.id = v_sp.edition_id)
                    and not exists (select 1 from session_submission s where s.session_id = se.id and s.status = 'approved')
                    and coalesce(se.description_de, se.description_en) is null);
  v_presentation := v_session and not exists (
                  select 1 from session_speaker ss join session se on se.id = ss.session_id join event e on e.id = se.event_id
                  where ss.person_id = v_p.id and (e.edition_id = v_sp.edition_id or e.id = v_sp.edition_id)
                    and se.format not in ('panel', 'networking', 'reception', 'side_event', 'break', 'company_tour')
                    and not exists (select 1 from speaker_asset a where a.profile_id = v_sp.id and a.session_id = se.id and a.kind = 'presentation' and a.is_current));
  v_ticket   := exists (select 1 from ticket t join event e on e.id = t.event_id
                        where t.person_id = v_p.id and (e.edition_id = v_sp.edition_id or e.id = v_sp.edition_id) and t.status in ('valid', 'requested'));
  if not v_profile      then v_open := array_append(v_open, 'profile'); end if;
  if not v_photo        then v_open := array_append(v_open, 'photo'); end if;
  if not v_consents     then v_open := array_append(v_open, 'consents'); end if;
  if not v_session      then v_open := array_append(v_open, 'session'); end if;
  if v_session and not v_content      then v_open := array_append(v_open, 'session_content'); end if;
  if v_session and not v_presentation then v_open := array_append(v_open, 'presentation'); end if;
  if not v_ticket       then v_open := array_append(v_open, 'ticket'); end if;
  return jsonb_build_object(
    'profile', v_profile, 'photo', v_photo, 'consents', v_consents, 'session', v_session,
    'session_content', case when v_session then v_content end,
    'presentation', case when v_session then v_presentation end,
    'ticket', v_ticket, 'hospitality', v_sp.hospitality_status,
    'open', to_jsonb(v_open)
  );
end $$;


-- ---- is_speaker_side_of
create or replace function is_speaker_side_of(p_session_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select exists (
    select 1 from session_speaker ss
    where ss.session_id = p_session_id
      and (ss.person_id = current_person_id()
           or exists (select 1 from speaker_profile sp where sp.person_id = ss.person_id and is_speaker_assistant(sp.id, current_person_id())))
  )
$$;


-- ---- my_deletion_blockers
create or replace function my_deletion_blockers()
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_out text[] := '{}';
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  -- Teamrolle: wer den Betrieb mitträgt, verschwindet nicht per Selbstbedienung.
  if exists (
    select 1 from role_assignment ra
     where ra.person_id = v_me and ra.role = any (team_role_keys())
       and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now()))
  then v_out := array_append(v_out, 'team_role'); end if;

  -- Zugesagter Auftritt einer Edition, die noch bevorsteht.
  if exists (
    select 1 from speaker_profile sp join event e on e.id = sp.edition_id
     where (sp.person_id = v_me or is_speaker_assistant(sp.id, v_me))
       and sp.confirmed_at is not null and sp.declined_at is null
       and e.end_date >= current_date)
  then v_out := array_append(v_out, 'speaker'); end if;

  -- Angenommene Volunteer-Bewerbung einer Edition, die noch bevorsteht.
  if exists (
    select 1 from volunteer_profile vp join event e on e.id = vp.edition_id
     where vp.person_id = v_me and vp.status = 'accepted' and e.end_date >= current_date)
  then v_out := array_append(v_out, 'volunteer'); end if;

  -- Ansprechperson einer Organisation: an der Stelle hängt ein Vertrag.
  if exists (select 1 from org_membership om where om.person_id = v_me)
  then v_out := array_append(v_out, 'partner'); end if;

  -- Offener Reisekostenantrag: eine Zahlung, die uns die Person noch schuldet
  -- oder wir ihr. Bis die durch ist, kann niemand verschwinden — und danach
  -- dürfen die Bankdaten weg, ohne dass eine Erstattung ins Leere läuft.
  if exists (
    select 1 from expense_claim ec join speaker_profile sp on sp.id = ec.profile_id
     where sp.person_id = v_me and ec.paid_at is null
       and ec.status not in ('rejected', 'cancelled', 'draft'))
  then v_out := array_append(v_out, 'open_expense'); end if;

  return v_out;
end $$;


-- ---- my_sessions
create or replace function my_sessions()
 RETURNS TABLE(session_id uuid, event_id uuid, event_name text, title_de text, title_en text, description_de text, description_en text, language text, format text, access_mode text, publish_status text, speaker_role text, confirmed boolean, start_at timestamp with time zone, end_at timestamp with time zone, stage_name text, room text, timezone text, co_speakers jsonb, latest_submission jsonb, on_behalf_of jsonb, tech jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select se.id, se.event_id, e.name, se.title_de, se.title_en, se.description_de, se.description_en,
         se.language, se.format, se.access_mode, se.publish_status, ss.role, ss.confirmed,
         sl.start_at, sl.end_at, st.name, st.room, e.timezone,
         coalesce((select jsonb_agg(jsonb_build_object('person_id', p2.id, 'first_name', p2.first_name, 'last_name', p2.last_name, 'role', ss2.role) order by ss2.sort_order)
                   from session_speaker ss2 join person p2 on p2.id = ss2.person_id
                   where ss2.session_id = se.id and ss2.person_id <> ss.person_id), '[]'::jsonb),
         (select to_jsonb(sub) from (
            select s.id, s.title, s.description, s.topics, s.language, s.notes, s.status, s.review_note, s.created_at, s.reviewed_at
            from session_submission s where s.session_id = se.id order by s.created_at desc limit 1) sub),
         case when sp.person_id <> current_person_id()
              then jsonb_build_object('person_id', sp.person_id, 'first_name', p.first_name, 'last_name', p.last_name) end,
         coalesce(se.tech, '{}'::jsonb)
  from speaker_profile sp
  join person p on p.id = sp.person_id
  join session_speaker ss on ss.person_id = sp.person_id
  join session se on se.id = ss.session_id
  join event e on e.id = se.event_id and (e.edition_id = sp.edition_id or e.id = sp.edition_id)
  left join slot sl on sl.id = se.slot_id
  left join stage st on st.id = sl.stage_id
  where sp.person_id = current_person_id() or is_speaker_assistant(sp.id, current_person_id())
  order by sl.start_at nulls last, se.title_de
$$;


-- ---- my_speaker_assets
create or replace function my_speaker_assets(p_profile_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, profile_id uuid, session_id uuid, kind text, storage_path text, filename text, mime text, size_bytes bigint, version integer, is_current boolean, late boolean, tech_check_status text, tech_check_note text, slides_release boolean, uploaded_by uuid, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select a.id, a.profile_id, a.session_id, a.kind, a.storage_path, a.filename, a.mime, a.size_bytes,
         a.version, a.is_current, a.late, a.tech_check_status, a.tech_check_note, a.slides_release, a.uploaded_by, a.created_at
  from speaker_asset a
  join speaker_profile sp on sp.id = a.profile_id
  where (p_profile_id is null or a.profile_id = p_profile_id)
    and (sp.person_id = current_person_id() or is_speaker_assistant(sp.id, current_person_id()) or can_manage_speaker(a.profile_id) or is_staff())
  order by a.kind, a.session_id, a.version desc
$$;


-- ---- my_speaker_profile_id
create or replace function my_speaker_profile_id(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select sp.id from speaker_profile sp
  where (sp.person_id = current_person_id() or is_speaker_assistant(sp.id, current_person_id()))
    and (p_edition_id is null or sp.edition_id = p_edition_id)
  order by (sp.person_id = current_person_id()) desc, sp.created_at desc limit 1
$$;


-- ---- submit_session_content
create or replace function submit_session_content(p_session_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id(); v_sp uuid; v_id uuid;
  v_lang text := nullif(p_data->>'language', '');
  v_topics text[];
  v_topic text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not is_speaker_side_of(p_session_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_lang is not null and v_lang not in ('de', 'en', 'mixed') then raise exception 'invalid_language' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p_data->>'title', '')), '') is null then raise exception 'title_required' using errcode = '22023'; end if;

  v_topics := coalesce(
    (select array_agg(x) from jsonb_array_elements_text(coalesce(p_data->'topics', '[]'::jsonb)) x), '{}');

  -- Jedes Thema muss im Vokabular stehen (SPK-027). Ohne diese Schleife
  -- bliebe `topics` ein Freitextfeld mit Auswahlknöpfen davor: die Oberfläche
  -- böte eine Liste an, die Datenbank nähme trotzdem alles entgegen.
  foreach v_topic in array v_topics loop
    if not is_vocab_key('session_topic', v_topic) then
      raise exception 'invalid_topic' using errcode = '22023', detail = v_topic;
    end if;
  end loop;

  select sp.id into v_sp
    from speaker_profile sp
    join session_speaker ss on ss.person_id = sp.person_id and ss.session_id = p_session_id
    join session se on se.id = p_session_id
    join event e on e.id = se.event_id and (e.edition_id = sp.edition_id or e.id = sp.edition_id)
   where sp.person_id = v_me or is_speaker_assistant(sp.id, v_me)
   order by (sp.person_id = v_me) desc limit 1;
  update session_submission set status = 'superseded' where session_id = p_session_id and status = 'submitted';
  insert into session_submission (session_id, speaker_profile_id, submitted_by, title, description, topics, language, notes)
  values (p_session_id, v_sp, v_me, btrim(p_data->>'title'), nullif(btrim(p_data->>'description'), ''),
          v_topics, v_lang, nullif(btrim(p_data->>'notes'), ''))
  returning id into v_id;
  perform log_audit('session.submission', 'session', p_session_id::text, null, jsonb_build_object('submission_id', v_id, 'speaker_profile_id', v_sp));
  return v_id;
end $$;


-- ---- update_my_speaker_profile
create or replace function update_my_speaker_profile(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id(); v_sp speaker_profile%rowtype;
  v_id uuid := nullif(p_data->>'id', '')::uuid;
  v_kontakt_vor text; v_kontakt_nach text; v_kontakt_mail text;
  v_kontakt_tel text; v_kontakt_art text; v_kontakt_ok date; v_hat_kontakt boolean;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile sp
   where (v_id is null or sp.id = v_id) and (sp.person_id = v_me or is_speaker_assistant(sp.id, v_me))
   order by (sp.person_id = v_me) desc, sp.created_at desc limit 1 for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;

  -- Kontakt ohne Portalzugang (0127). Die sechs Felder gehoeren zusammen:
  -- erst wird ausgerechnet, was nach dem Schreiben dastuende, dann geprueft.
  -- Sonst scheitert eine reine Namenskorrektur an der Einwilligung (dieselbe
  -- Lehre wie bei `upsert_edition_contact`, 0114).
  v_kontakt_vor  := nullif(btrim(coalesce(case when p_data ? 'contact_first_name' then p_data->>'contact_first_name' else v_sp.contact_first_name end, '')), '');
  v_kontakt_nach := nullif(btrim(coalesce(case when p_data ? 'contact_last_name'  then p_data->>'contact_last_name'  else v_sp.contact_last_name  end, '')), '');
  v_kontakt_mail := nullif(btrim(coalesce(case when p_data ? 'contact_email'      then p_data->>'contact_email'      else v_sp.contact_email::text end, '')), '');
  v_kontakt_tel  := nullif(btrim(coalesce(case when p_data ? 'contact_phone'      then p_data->>'contact_phone'      else v_sp.contact_phone      end, '')), '');
  v_kontakt_art  := nullif(btrim(coalesce(case when p_data ? 'contact_kind'       then p_data->>'contact_kind'       else v_sp.contact_kind       end, '')), '');
  v_kontakt_ok   := case when p_data ? 'contact_consent_at'
                         then nullif(btrim(p_data->>'contact_consent_at'), '')::date
                         else v_sp.contact_consent_at end;
  v_hat_kontakt  := coalesce(v_kontakt_vor, v_kontakt_nach, v_kontakt_mail, v_kontakt_tel) is not null;

  if v_kontakt_art is not null and not is_vocab_key('speaker_contact_kind', v_kontakt_art) then
    raise exception 'invalid_contact_kind' using errcode = '22023', detail = v_kontakt_art;
  end if;
  if v_hat_kontakt and v_kontakt_ok is null then
    -- Die Daten gehoeren einem Menschen, der hier kein Konto hat und nicht
    -- gefragt wurde. Ohne die Bestaetigung der Speakerin speichern wir sie
    -- nicht (Art. 6 DSGVO; eigener Schluessel, siehe Kopf).
    raise exception 'speaker_contact_consent_required' using errcode = '22023', detail = 'speaker_contact';
  end if;
  -- Wer alle Felder leert, nimmt den Kontakt zurueck — dann geht auch das
  -- Einwilligungsdatum, sonst bliebe ein Beleg ohne Gegenstand stehen.
  if not v_hat_kontakt then v_kontakt_ok := null; v_kontakt_art := null; end if;

  update speaker_profile set
    contact_first_name = v_kontakt_vor,
    contact_last_name  = v_kontakt_nach,
    contact_email      = v_kontakt_mail::citext,
    contact_phone      = v_kontakt_tel,
    contact_kind       = v_kontakt_art,
    contact_consent_at = v_kontakt_ok,
    job_title         = case when p_data ? 'job_title'         then nullif(btrim(p_data->>'job_title'), '')         else job_title end,
    organization_name = case when p_data ? 'organization_name' then nullif(btrim(p_data->>'organization_name'), '') else organization_name end,
    bio_short_en      = case when p_data ? 'bio_short_en'      then nullif(btrim(p_data->>'bio_short_en'), '')      else bio_short_en end,
    bio_short_de      = case when p_data ? 'bio_short_de'      then nullif(btrim(p_data->>'bio_short_de'), '')      else bio_short_de end,
    bio_long_en       = case when p_data ? 'bio_long_en'       then nullif(btrim(p_data->>'bio_long_en'), '')       else bio_long_en end,
    bio_long_de       = case when p_data ? 'bio_long_de'       then nullif(btrim(p_data->>'bio_long_de'), '')       else bio_long_de end,
    socials           = case when p_data ? 'socials'    and jsonb_typeof(p_data->'socials') = 'object'    then p_data->'socials'    else socials end,
    tech_rider        = case when p_data ? 'tech_rider' and jsonb_typeof(p_data->'tech_rider') = 'object' then p_data->'tech_rider' else tech_rider end
  where id = v_sp.id;

  update person set
    first_name         = case when p_data ? 'first_name'         then nullif(btrim(p_data->>'first_name'), '')         else first_name end,
    last_name          = case when p_data ? 'last_name'          then nullif(btrim(p_data->>'last_name'), '')          else last_name end,
    title              = case when p_data ? 'title'              then nullif(btrim(p_data->>'title'), '')              else title end,
    pronouns           = case when p_data ? 'pronouns'           then nullif(btrim(p_data->>'pronouns'), '')           else pronouns end,
    linkedin_url       = case when p_data ? 'linkedin_url'       then nullif(btrim(p_data->>'linkedin_url'), '')       else linkedin_url end,
    phone_e164         = case when p_data ? 'phone_e164'         then nullif(btrim(p_data->>'phone_e164'), '')         else phone_e164 end,
    preferred_language = case when p_data ? 'preferred_language' and p_data->>'preferred_language' in ('de', 'en') then p_data->>'preferred_language' else preferred_language end
  where id = v_sp.person_id;

  if v_sp.person_id <> v_me then
    perform log_audit('speaker.assistant_update', 'speaker_profile', v_sp.id::text, null, p_data - 'id');
  end if;
  return v_sp.id;
end $$;


-- ---- update_session_tech
create or replace function update_session_tech(p_session_id uuid, p_tech jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id(); v_key text; v_val text;
  v_neu jsonb := '{}'::jsonb; v_alt jsonb; v_rider jsonb; v_person uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from session s where s.id = p_session_id) then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  -- Speaker der Session, oder die Assistenz eines solchen Speakers.
  select ss.person_id into v_person
    from session_speaker ss
    join speaker_profile sp on sp.person_id = ss.person_id
   where ss.session_id = p_session_id
     and (ss.person_id = v_me or is_speaker_assistant(sp.id, v_me))
   limit 1;
  if v_person is null then raise exception 'not allowed' using errcode = '42501'; end if;

  if p_tech is null or jsonb_typeof(p_tech) <> 'object' then
    raise exception 'invalid_tech_key' using errcode = '22023', detail = 'object_required';
  end if;

  for v_key, v_val in select key, value #>> '{}' from jsonb_each(p_tech) loop
    if not (v_key = any (session_tech_keys())) then
      raise exception 'invalid_tech_key' using errcode = '22023', detail = v_key;
    end if;
    v_val := nullif(btrim(coalesce(v_val, '')), '');
    if v_val is not null and length(v_val) > 500 then
      raise exception 'tech_too_long' using errcode = '22023', detail = v_key;
    end if;
    -- Das Mikrofon ist seit dem 22.09. eine Auswahl, kein Freitext mehr.
    if v_key = 'microphone' and v_val is not null
       and not is_vocab_key('speaker_microphone', v_val) then
      raise exception 'invalid_microphone' using errcode = '22023', detail = v_val;
    end if;
    -- Leere Felder fallen heraus, statt als "" zu bleiben: sonst steht später
    -- in der Regie eine leere Zeile, die wie eine Angabe aussieht.
    if v_val is not null then
      v_neu := v_neu || jsonb_build_object(v_key, v_val);
    end if;
  end loop;

  select s.tech into v_alt from session s where s.id = p_session_id;

  -- Vorbelegung aus dem Rider, aber nur beim **ersten** Mal und nur für
  -- Schlüssel, die die Eingabe nicht selbst setzt. Das Mikrofon ist hier
  -- bewusst raus (siehe Kopf).
  if coalesce(v_alt, '{}'::jsonb) = '{}'::jsonb then
    select sp.tech_rider into v_rider from speaker_profile sp where sp.person_id = v_person limit 1;
    if v_rider is not null and jsonb_typeof(v_rider) = 'object' then
      if not (v_neu ? 'special_requirements')
         and nullif(btrim(coalesce(v_rider->>'notes', '')), '') is not null then
        v_neu := v_neu || jsonb_build_object('special_requirements', btrim(v_rider->>'notes'));
      end if;
    end if;
  end if;

  update session set tech = v_neu, updated_at = now(), updated_by = v_me where id = p_session_id;

  -- Nur die **Schlüssel** ins Protokoll, nicht die Werte: was ein Speaker an
  -- besonderen Anforderungen schreibt, kann persönlich sein (dieselbe Regel wie
  -- bei der Ernährung, 0100).
  perform log_audit('speaker.session_tech', 'session', p_session_id::text,
    jsonb_build_object('keys', (select coalesce(array_agg(k), array[]::text[])
                                  from jsonb_object_keys(coalesce(v_alt, '{}'::jsonb)) k)),
    jsonb_build_object('keys', (select coalesce(array_agg(k), array[]::text[])
                                  from jsonb_object_keys(v_neu) k)));

  return v_neu;
end $$;


-- ---- can_request_shuttle
create or replace function can_request_shuttle(p_profile_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_person uuid; v_assistant uuid;
begin
  if v_me is null then return false; end if;
  select sp.person_id, sp.assistant_person_id into v_person, v_assistant
    from speaker_profile sp where sp.id = p_profile_id;
  if not found then return false; end if;
  -- `coalesce` bleibt, obwohl `is_speaker_assistant` nie NULL zurueckgibt:
  -- `can_manage_speaker` kann es, und `false or false or NULL` ist NULL, nicht
  -- false. Ein `if not NULL` loest nicht aus — genau im Fall, der abgewiesen
  -- gehoeren haette (Hotfix 0118).
  return coalesce(v_person = v_me or is_speaker_assistant(p_profile_id, v_me) or can_manage_speaker(p_profile_id), false);
end $$;


-- ---- queue_mail
create or replace function queue_mail(p_template_key text, p_person_id uuid, p_vars jsonb DEFAULT '{}'::jsonb, p_related_type text DEFAULT NULL::text, p_related_id uuid DEFAULT NULL::uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_email text; v_locale text; v_first text; v_vars jsonb; v_id bigint;
begin
  select pe.email::text,
         coalesce(case when p.preferred_language in ('de', 'en') then p.preferred_language end,
                  case when exists (select 1 from speaker_profile sp where sp.person_id = p.id or is_speaker_assistant(sp.id, p.id)) then 'en' else 'de' end),
         coalesce(p.first_name, '')
    into v_email, v_locale, v_first
  from person p join person_email pe on pe.person_id = p.id and pe.is_primary
  where p.id = p_person_id and p.deleted_at is null;
  if v_email is null then return null; end if;
  if p_related_id is not null and exists (
       select 1 from mail_log
       where template_key = p_template_key and related_id = p_related_id and person_id = p_person_id and status = 'queued') then
    return null;
  end if;
  v_vars := coalesce(p_vars, '{}'::jsonb) || jsonb_build_object('first_name', v_first);
  if is_suppressed(v_email) then
    insert into mail_log (to_email, person_id, template_key, locale, provider, status, meta, related_type, related_id)
    values ('suppressed:' || email_hash(v_email), p_person_id, p_template_key, v_locale, 'resend', 'suppressed',
            jsonb_build_object('vars', v_vars), p_related_type, p_related_id)
    returning id into v_id;
    return v_id;
  end if;
  insert into mail_log (to_email, person_id, template_key, locale, provider, status, meta, related_type, related_id)
  values (v_email, p_person_id, p_template_key, v_locale, 'resend', 'queued',
          jsonb_build_object('vars', v_vars), p_related_type, p_related_id)
  returning id into v_id;
  return v_id;
end $$;


-- ---- manager_speakers
create or replace function manager_speakers(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, person_id uuid, first_name text, last_name text, title text, email text, job_title text, organization_name text, speaker_type text, pipeline_status text, owner_person_id uuid, owner_name text, reception_eligible boolean, travel_costs_covered boolean, travel_costs_approved boolean, hospitality_status text, hotel_tier text, pass_type text, lounge_access boolean, invited_at timestamp with time zone, confirmed_at timestamp with time zone, declined_at timestamp with time zone, decline_reason text, assistant_name text, sessions jsonb, next_open jsonb, updated_at timestamp with time zone, internal_notes text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not (has_role('speaker_manager') or has_role('admin') or has_role('area_lead_speaker') or has_role('programme_team')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select sp.id, sp.person_id, p.first_name, p.last_name, p.title,
           (select pe.email::text from person_email pe where pe.person_id = p.id and pe.is_primary),
           sp.job_title, sp.organization_name, sp.speaker_type, sp.pipeline_status,
           sp.owner_person_id, (select btrim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, '')) from person o where o.id = sp.owner_person_id),
           sp.reception_eligible, sp.travel_costs_covered, (sp.travel_costs_approved_at is not null),
           sp.hospitality_status, sp.hotel_tier, sp.pass_type, sp.lounge_access, sp.invited_at,
           sp.confirmed_at, sp.declined_at, sp.decline_reason,
           (select string_agg(x.name, ', ' order by x.name) from (
              select nullif(btrim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), '') as name
                from person a where a.id = sp.assistant_person_id
              union
              select nullif(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '')
                from speaker_contact c where c.profile_id = sp.id and c.has_access
            ) x where x.name is not null),
           coalesce((select jsonb_agg(jsonb_build_object('session_id', se.id, 'title_de', se.title_de, 'title_en', se.title_en,
                                                          'publish_status', se.publish_status, 'start_at', sl.start_at, 'stage_name', st.name)
                                       order by sl.start_at nulls last)
                     from session_speaker ss join session se on se.id = ss.session_id join event e on e.id = se.event_id
                     left join slot sl on sl.id = se.slot_id left join stage st on st.id = sl.stage_id
                     where ss.person_id = sp.person_id and (e.edition_id = sp.edition_id or e.id = sp.edition_id)), '[]'::jsonb),
           speaker_next_steps(sp.id)->'open',
           sp.updated_at, sp.internal_notes
    from speaker_profile sp
    join person p on p.id = sp.person_id
    left join vocab_term v on v.vocabulary = 'speaker_pipeline' and v.key = sp.pipeline_status
    where (p_edition_id is null or sp.edition_id = p_edition_id)
      and p.deleted_at is null
      and can_manage_speaker(sp.id)
    order by v.sort_order nulls last, p.last_name nulls last, p.first_name nulls last;
end $$;


-- ---- my_speaker_profile
create or replace function my_speaker_profile(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_sp speaker_profile%rowtype; v_p person%rowtype;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile sp
   where (sp.person_id = v_me or is_speaker_assistant(sp.id, v_me))
     and (p_edition_id is null or sp.edition_id = p_edition_id)
   order by (sp.person_id = v_me) desc, sp.created_at desc
   limit 1;
  if not found then return null; end if;
  select * into v_p from person where id = v_sp.person_id;
  return jsonb_build_object(
    -- Kontakt ohne Portalzugang (0127): Agentur oder Office, das die
    -- Speakerin angeschrieben haben moechte. Steht am Profil, nicht als
    -- eigene Person — sonst waechst die Personentabelle um Karteileichen.
    'contact', case when v_sp.contact_first_name is null and v_sp.contact_last_name is null
                     and v_sp.contact_email is null and v_sp.contact_phone is null
                    then null
                    else jsonb_build_object(
                      'first_name', v_sp.contact_first_name, 'last_name', v_sp.contact_last_name,
                      'email', v_sp.contact_email, 'phone', v_sp.contact_phone,
                      'kind', v_sp.contact_kind, 'consent_at', v_sp.contact_consent_at) end,
    'id', v_sp.id, 'edition_id', v_sp.edition_id, 'is_assistant', (v_sp.person_id <> v_me),
    'edition_name', (select e.name from event e where e.id = v_sp.edition_id),
    'speaker_type', v_sp.speaker_type, 'pipeline_status', v_sp.pipeline_status,
    'job_title', v_sp.job_title, 'organization_name', v_sp.organization_name,
    'bio_short_en', v_sp.bio_short_en, 'bio_short_de', v_sp.bio_short_de,
    'bio_long_en', v_sp.bio_long_en, 'bio_long_de', v_sp.bio_long_de,
    'socials', v_sp.socials, 'tech_rider', v_sp.tech_rider,
    'reception_eligible', v_sp.reception_eligible, 'lounge_access', v_sp.lounge_access,
    'pass_type', v_sp.pass_type, 'hotel_tier', v_sp.hotel_tier, 'hospitality_status', v_sp.hospitality_status,
    'travel_costs_covered', v_sp.travel_costs_covered, 'travel_costs_approved', (v_sp.travel_costs_approved_at is not null),
    'invited_at', v_sp.invited_at,
    'contacts', (select coalesce(jsonb_agg(jsonb_build_object(
                            'id', c.id, 'kind', c.kind, 'first_name', c.first_name,
                            'last_name', c.last_name, 'email', c.email, 'phone', c.phone,
                            'has_access', c.has_access, 'consent_at', c.consent_at)
                          order by c.kind, c.created_at), '[]'::jsonb)
                   from speaker_contact c where c.profile_id = v_sp.id),
    'assistant', case when v_sp.assistant_person_id is null then null else (
       select jsonb_build_object('person_id', a.id, 'first_name', a.first_name, 'last_name', a.last_name,
                                 'email', (select pe.email::text from person_email pe where pe.person_id = a.id and pe.is_primary))
       from person a where a.id = v_sp.assistant_person_id) end,
    'person', jsonb_build_object(
       'id', v_p.id, 'first_name', v_p.first_name, 'last_name', v_p.last_name, 'title', v_p.title,
       'pronouns', v_p.pronouns, 'linkedin_url', v_p.linkedin_url,
       'preferred_language', v_p.preferred_language, 'phone_e164', v_p.phone_e164,
       'email', (select pe.email::text from person_email pe where pe.person_id = v_p.id and pe.is_primary)),
    'photo_asset_id', v_sp.photo_asset_id,
    'consents', (select coalesce(jsonb_object_agg(c.consent_type, c.granted), '{}'::jsonb) from consent_current c
                 where c.person_id = v_p.id and c.consent_type in ('photo_video', 'speaker_release', 'slides_publication', 'hospitality_data')),
    'next_steps', speaker_next_steps(v_sp.id)
  );
end $$;


-- ---- speaker_detail
create or replace function speaker_detail(p_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_p person%rowtype; v_team boolean;
begin
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not can_manage_speaker(p_profile_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_p from person where id = v_sp.person_id;
  v_team := is_speaker_team(v_sp.edition_id);

  return jsonb_build_object(
    -- Der Kontakt ohne Portalzugang (0127) ist genau fuer das Team da: es
    -- soll wissen, wen es statt der Speakerin anschreibt.
    'contact', case when v_sp.contact_first_name is null and v_sp.contact_last_name is null
                     and v_sp.contact_email is null and v_sp.contact_phone is null
                    then null
                    else jsonb_build_object(
                      'first_name', v_sp.contact_first_name, 'last_name', v_sp.contact_last_name,
                      'email', v_sp.contact_email, 'phone', v_sp.contact_phone,
                      'kind', v_sp.contact_kind, 'consent_at', v_sp.contact_consent_at) end,
    'id', v_sp.id,
    'edition_id', v_sp.edition_id,
    'person', jsonb_build_object(
      'id', v_p.id, 'first_name', v_p.first_name, 'last_name', v_p.last_name, 'title', v_p.title,
      'email', (select pe.email::text from person_email pe where pe.person_id = v_p.id and pe.is_primary),
      'preferred_language', v_p.preferred_language,
      'salutation_de', v_p.salutation_de, 'salutation_en', v_p.salutation_en,
      'has_account', v_p.auth_user_id is not null),
    'speaker_type', v_sp.speaker_type,
    'pipeline_status', v_sp.pipeline_status,
    'confirmed_at', v_sp.confirmed_at,
    'declined_at', v_sp.declined_at,
    'decline_reason', v_sp.decline_reason,
    'invited_at', v_sp.invited_at,
    'owner_person_id', v_sp.owner_person_id,
    'owner_name', (select nullif(btrim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, '')), '')
                     from person o where o.id = v_sp.owner_person_id),
    'assistant_person_id', v_sp.assistant_person_id,
    'assistant_name', (select nullif(btrim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), '')
                         from person a where a.id = v_sp.assistant_person_id),
    'job_title', v_sp.job_title,
    'organization_name', v_sp.organization_name,
    'org_id', v_sp.org_id,
    'org_name', (select coalesce(og.communication_name, og.legal_name) from organization og where og.id = v_sp.org_id),
    'bio_short_de', v_sp.bio_short_de, 'bio_short_en', v_sp.bio_short_en,
    'bio_long_de', v_sp.bio_long_de, 'bio_long_en', v_sp.bio_long_en,
    'socials', v_sp.socials,
    'tech_rider', v_sp.tech_rider,
    'photo_asset_id', v_sp.photo_asset_id,
    'reception_eligible', v_sp.reception_eligible,
    'lounge_access', v_sp.lounge_access,
    'pass_type', v_sp.pass_type,
    'hotel_tier', v_sp.hotel_tier,
    'hospitality_status', v_sp.hospitality_status,
    'travel_costs_covered', v_sp.travel_costs_covered,
    'expense_mode', v_sp.expense_mode,
    'expense_lump_sum_cents', v_sp.expense_lump_sum_cents,
    'travel_costs_approved_at', v_sp.travel_costs_approved_at,
    'travel_costs_approved_by', (select nullif(btrim(coalesce(b.first_name, '') || ' ' || coalesce(b.last_name, '')), '')
                                   from person b where b.id = v_sp.travel_costs_approved_by),
    'lead_contact_id', v_sp.lead_contact_id,
    'buddy_contact_id', v_sp.buddy_contact_id,
    'contacts', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'type', c.type, 'display_name', c.display_name)
                                           order by c.type), '[]'::jsonb)
                   from edition_contact c
                  where c.id in (v_sp.lead_contact_id, v_sp.buddy_contact_id)),
    'travel', (select to_jsonb(tr) - 'updated_by' from speaker_travel tr where tr.profile_id = v_sp.id),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object(
                                   'session_id', se.id, 'title_de', se.title_de, 'title_en', se.title_en,
                                   'publish_status', se.publish_status, 'start_at', sl.start_at, 'stage_name', st.name)
                                 order by sl.start_at nulls last)
                          from session_speaker ss
                          join session se on se.id = ss.session_id
                          join event e on e.id = se.event_id
                          left join slot sl on sl.id = se.slot_id
                          left join stage st on st.id = sl.stage_id
                          where ss.person_id = v_sp.person_id
                            and (e.edition_id = v_sp.edition_id or e.id = v_sp.edition_id)), '[]'::jsonb),
    'speaker_contacts', (select coalesce(jsonb_agg(jsonb_build_object(
                                   'id', c.id, 'kind', c.kind, 'first_name', c.first_name,
                                   'last_name', c.last_name, 'email', c.email, 'phone', c.phone,
                                   'has_access', c.has_access, 'consent_at', c.consent_at)
                                 order by c.kind, c.created_at), '[]'::jsonb)
                           from speaker_contact c where c.profile_id = v_sp.id),
    'internal_notes_visible', v_team,
    'created_at', v_sp.created_at,
    'updated_at', v_sp.updated_at
  ) || case when v_team then jsonb_build_object('internal_notes', v_sp.internal_notes) else '{}'::jsonb end;
end $$;

select harden_definer_functions();
