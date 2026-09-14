-- 0084 · Volunteer-Tickets: ein Coupon je Person (Welle 4 A6).
--
-- Entscheidung E2: das **Einlösen ist der Aktivierungsschritt**. Wer seinen
-- Code nicht einlöst, kommt wahrscheinlich nicht — deshalb kein Freiticket,
-- das still im Postfach liegt, sondern ein Coupon, den die Person selbst
-- benutzt. Die Liste „nicht eingelöst" ist damit keine Verwaltungsaufgabe,
-- sondern die Frühwarnung für den Schichtplan.
--
-- Ein Undershop „Volunteers" je Edition (Muster A6 Welle 3), darin ein
-- **persönlicher** Coupon je angenommenem Volunteer.
--
-- Die Einlösung erkennt ein Trigger auf `ticket`, nicht der Ingest: so greift
-- sie auf **jedem** Weg, über den ein Ticket hereinkommt — Webhook, Sweep,
-- späterer Nachtrag. Schlüssel ist der Coupon, wenn vivenu ihn mitschickt,
-- sonst Undershop + Person. Beides zusammen, weil `appliedDiscountInfo` am
-- `ticket.created`-Webhook fehlt (Sandbox-Lauf 12.09.) und erst an der
-- Transaktion steht.
--
-- Fehlerschlüssel: 42501, P0002 `profile_not_found`, P0001 `not_accepted`.
--
-- Abweichungen: keine.
-- Review Architektur-Session 14.09.2026: ein zurückgenommener Coupon muss auch
-- bei vivenu erlöschen — `volunteer_coupon_revocation` merkt sich jeden Widerruf,
-- der Sync deaktiviert den Coupon (`updateCoupon … active:false`) und quittiert
-- mit `mark_volunteer_coupon_revoked`. Eine erneuerte Zusage beginnt bei `none`.
-- Mail-Link über `{{portal_url}}` (ein `{{link}}` kennt der Versand nicht und
-- hätte leer gerendert). Team-Liste nennt den Ticketstatus. Trigger-Funktionen
-- ohne EXECUTE für authenticated.
set search_path = public, extensions;

alter table volunteer_profile
  add column if not exists coupon_code       text,
  add column if not exists vivenu_coupon_id  text,
  add column if not exists coupon_status     text not null default 'none',
  add column if not exists coupon_issued_at  timestamptz,
  add column if not exists redeemed_at       timestamptz,
  add column if not exists ticket_id         uuid references ticket(id) on delete set null,
  add column if not exists coupon_error      text,
  add column if not exists reminded_at       timestamptz;

do $$ begin
  alter table volunteer_profile add constraint volunteer_coupon_status_chk
    check (coupon_status in ('none', 'pending', 'issued', 'redeemed', 'error', 'revoked'));
exception when duplicate_object then null; end $$;

create unique index if not exists volunteer_profile_coupon_idx
  on volunteer_profile (vivenu_coupon_id) where vivenu_coupon_id is not null;

comment on column volunteer_profile.coupon_status is
  'none → pending (wartet auf vivenu) → issued (Code da) → redeemed (Ticket gezogen). `revoked`, wenn die Zusage zurückgenommen wurde.';

-- Der Undershop liegt an der Edition, nicht an der Person.
alter table event add column if not exists vivenu_volunteer_undershop_id text;
comment on column event.vivenu_volunteer_undershop_id is
  'Undershop „Volunteers" dieser Edition. Ein Shop, viele persönliche Coupons.';

-- Widerrufe, die bei vivenu noch deaktiviert werden müssen. Keine Grants — nur RPCs.
create table if not exists volunteer_coupon_revocation (
  id                bigint generated always as identity primary key,
  profile_id        uuid not null references volunteer_profile(id) on delete cascade,
  vivenu_coupon_id  text not null,
  coupon_code       text,
  revoked_at        timestamptz not null default now(),
  deactivated_at    timestamptz,
  error             text
);
create index if not exists volunteer_coupon_revocation_open_idx
  on volunteer_coupon_revocation (revoked_at) where deactivated_at is null;
alter table volunteer_coupon_revocation enable row level security;
revoke all on volunteer_coupon_revocation from anon, authenticated;
grant all on volunteer_coupon_revocation to service_role;
comment on table volunteer_coupon_revocation is
  'Widerrufene Volunteer-Coupons, die bei vivenu noch zu deaktivieren sind (`deactivated_at` leer).';

-- ---------------------------------------------------------------- Ausgabe

/**
 * Wer einen Coupon braucht: angenommen, noch keiner da.
 *
 * `pending` kommt mit, damit ein abgebrochener Lauf beim nächsten Mal weiter
 * macht; `error` auch, sonst bliebe ein einmal gescheiterter Volunteer für
 * immer ohne Code.
 */
create or replace function volunteer_coupons_pending()
returns table(profile_id uuid, person_id uuid, display_name text, email text,
              edition_id uuid, edition_slug text, vivenu_event_id text,
              undershop_id text, coupon_code text, vivenu_coupon_id text, coupon_status text)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if auth.uid() is not null and not is_volunteer_team() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select v.id, v.person_id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           pe.email::text, v.edition_id, e.slug, e.vivenu_event_id,
           e.vivenu_volunteer_undershop_id, v.coupon_code, v.vivenu_coupon_id, v.coupon_status
      from volunteer_profile v
      join person p on p.id = v.person_id
      join event e on e.id = v.edition_id
      left join person_email pe on pe.person_id = p.id and pe.is_primary
     where v.status = 'accepted'
       and v.coupon_status in ('none', 'pending', 'error')
       and e.vivenu_event_id is not null
     order by v.decided_at nulls last, v.applied_at;
end $$;

/** Ergebnis eines Sync-Laufs zurückschreiben. Nur service_role. */
create or replace function set_volunteer_coupon(
  p_profile_id uuid, p_status text, p_coupon_code text default null,
  p_vivenu_coupon_id text default null, p_error text default null)
returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('pending', 'issued', 'error', 'revoked') then
    raise exception 'invalid_status' using errcode = '22023', detail = p_status;
  end if;
  update volunteer_profile set
    coupon_status = p_status,
    coupon_code = coalesce(nullif(btrim(coalesce(p_coupon_code, '')), ''), coupon_code),
    vivenu_coupon_id = coalesce(nullif(btrim(coalesce(p_vivenu_coupon_id, '')), ''), vivenu_coupon_id),
    coupon_issued_at = case when p_status = 'issued' then coalesce(coupon_issued_at, now()) else coupon_issued_at end,
    coupon_error = case when p_status = 'error' then left(coalesce(p_error, ''), 500) else null end,
    updated_at = now()
  where id = p_profile_id;
  if not found then raise exception 'profile_not_found' using errcode = 'P0002'; end if;
end $$;

/** Undershop der Edition merken (der Sync legt ihn an). Nur service_role. */
create or replace function set_edition_volunteer_undershop(p_edition_id uuid, p_undershop_id text)
returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  if auth.uid() is not null and not is_volunteer_team() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update event set vivenu_volunteer_undershop_id = nullif(btrim(p_undershop_id), '')
   where id = p_edition_id and is_edition;
  if not found then raise exception 'edition_not_found' using errcode = 'P0002'; end if;
end $$;

/** Widerrufe, die bei vivenu noch offen sind. service_role oder Volunteer-Team. */
create or replace function volunteer_coupon_revocations_pending()
returns table(id bigint, profile_id uuid, vivenu_coupon_id text, coupon_code text, revoked_at timestamptz, error text)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if auth.uid() is not null and not is_volunteer_team() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select r.id, r.profile_id, r.vivenu_coupon_id, r.coupon_code, r.revoked_at, r.error
      from volunteer_coupon_revocation r
     where r.deactivated_at is null
     order by r.revoked_at;
end $$;

/** Deaktivierung quittieren — oder den Fehler festhalten, dann bleibt der Widerruf offen. Nur service_role. */
create or replace function mark_volunteer_coupon_revoked(p_id bigint, p_error text default null) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  update volunteer_coupon_revocation
     set deactivated_at = case when p_error is null then now() else deactivated_at end,
         error = left(p_error, 500)
   where id = p_id;
  if not found then raise exception 'revocation_not_found' using errcode = 'P0002'; end if;
end $$;
revoke execute on function mark_volunteer_coupon_revoked(bigint, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- Einlösung

/**
 * Ein Ticket auf einen Volunteer zurückführen.
 *
 * Als Trigger, nicht im Ingest: so greift die Einlösung auf jedem Weg, über
 * den ein Ticket hereinkommt. Der Coupon ist der genaue Schlüssel; fehlt er
 * (am `ticket.created`-Webhook schickt vivenu `appliedDiscountInfo` nicht
 * mit), zählt Undershop + Person.
 */
create or replace function trg_ticket_volunteer_redeem() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare v_profile uuid;
begin
  if new.status = 'cancelled' then return new; end if;

  if new.vivenu_discount_id is not null then
    select v.id into v_profile from volunteer_profile v
     where v.vivenu_coupon_id = new.vivenu_discount_id limit 1;
  end if;

  if v_profile is null and new.vivenu_undershop_id is not null and new.person_id is not null then
    select v.id into v_profile from volunteer_profile v
      join event e on e.id = v.edition_id
     where v.person_id = new.person_id
       and e.vivenu_volunteer_undershop_id = new.vivenu_undershop_id
       and v.coupon_status in ('issued', 'redeemed')
     limit 1;
  end if;

  if v_profile is null then return new; end if;

  update volunteer_profile
     set coupon_status = 'redeemed',
         redeemed_at = coalesce(redeemed_at, now()),
         ticket_id = coalesce(ticket_id, new.id),
         updated_at = now()
   where id = v_profile and coupon_status <> 'redeemed';
  return new;
end $$;
revoke execute on function trg_ticket_volunteer_redeem() from public, anon, authenticated;

drop trigger if exists ticket_volunteer_redeem on ticket;
create trigger ticket_volunteer_redeem after insert or update of status, person_id, vivenu_undershop_id, vivenu_discount_id
  on ticket for each row execute function trg_ticket_volunteer_redeem();

-- ---------------------------------------------------------------- Team

create or replace function volunteer_tickets_admin(p_edition_id uuid default null)
returns table(profile_id uuid, person_id uuid, display_name text, email text, status text,
              coupon_status text, coupon_code text, coupon_issued_at timestamptz,
              redeemed_at timestamptz, reminded_at timestamptz, coupon_error text,
              shifts integer, ticket_status text)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid;
begin
  if not is_volunteer_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_ed := volunteer_edition(p_edition_id);
  return query
    select v.id, v.person_id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           pe.email::text, v.status, v.coupon_status, v.coupon_code, v.coupon_issued_at,
           v.redeemed_at, v.reminded_at, v.coupon_error,
           (select count(*)::integer from shift_assignment a
             where a.person_id = v.person_id and a.status in ('assigned', 'confirmed')),
           -- Ein eingelöstes, danach storniertes Ticket soll der Liste nicht entgehen.
           (select t.status from ticket t where t.id = v.ticket_id)
      from volunteer_profile v
      join person p on p.id = v.person_id
      left join person_email pe on pe.person_id = p.id and pe.is_primary
     where v.edition_id = v_ed and v.status = 'accepted'
     -- Offene zuerst: die Liste ist eine Arbeitsliste, keine Statistik.
     order by case v.coupon_status when 'error' then 0 when 'issued' then 1
                                   when 'pending' then 2 when 'none' then 3 else 4 end,
              v.decided_at nulls last;
end $$;

/**
 * Erinnerung an Nicht-Einlöser: sieben Tage nach der Ausgabe, **einmal**.
 * Housekeeping ruft das auf; `reminded_at` verhindert die zweite Mail.
 */
create or replace function remind_volunteer_tickets() returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_row record; v_n integer := 0;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  for v_row in
    select v.id, v.person_id, v.coupon_code, e.name as edition_name
      from volunteer_profile v join event e on e.id = v.edition_id
     where v.status = 'accepted'
       and v.coupon_status = 'issued'
       and v.reminded_at is null
       and v.coupon_issued_at is not null
       and v.coupon_issued_at < now() - interval '7 days'
  loop
    perform queue_mail('volunteer_ticket_reminder', v_row.person_id,
      jsonb_build_object('code', coalesce(v_row.coupon_code, ''), 'edition', v_row.edition_name),
      'volunteer_profile', v_row.id);
    update volunteer_profile set reminded_at = now() where id = v_row.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Zusage zurückgenommen ⇒ Coupon zu. Der Code bleibt stehen, damit im Support
-- nachvollziehbar ist, was jemand in der Hand hatte. Bei vivenu erlischt der
-- Coupon erst, wenn der Sync ihn deaktiviert hat — dafür der Eintrag in
-- `volunteer_coupon_revocation`. Eine erneuerte Zusage beginnt bei `none`.
create or replace function trg_volunteer_status_coupon() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.status in ('declined', 'withdrawn') and old.coupon_status in ('pending', 'issued') then
    new.coupon_status := 'revoked';
    if new.vivenu_coupon_id is not null then
      insert into volunteer_coupon_revocation (profile_id, vivenu_coupon_id, coupon_code)
      values (new.id, new.vivenu_coupon_id, new.coupon_code);
    end if;
  elsif new.status = 'accepted' and old.status <> 'accepted' and old.coupon_status = 'revoked' then
    new.coupon_status := 'none';
    new.coupon_code := null;
    new.vivenu_coupon_id := null;
    new.coupon_issued_at := null;
    new.coupon_error := null;
    new.reminded_at := null;
  end if;
  return new;
end $$;
revoke execute on function trg_volunteer_status_coupon() from public, anon, authenticated;

drop trigger if exists volunteer_status_coupon on volunteer_profile;
create trigger volunteer_status_coupon before update of status on volunteer_profile
  for each row execute function trg_volunteer_status_coupon();

-- ---------------------------------------------------------------- Eigene Sicht

create or replace function my_volunteer_profile(p_edition_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_pid uuid := current_person_id(); v_ed uuid; v_p volunteer_profile; v_shop text;
begin
  if v_pid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := volunteer_edition(p_edition_id);
  select * into v_p from volunteer_profile where person_id = v_pid and edition_id = v_ed;
  if not found then return null; end if;
  select e.vivenu_volunteer_undershop_id into v_shop from event e where e.id = v_ed;
  return jsonb_build_object(
    'id', v_p.id, 'edition_id', v_p.edition_id, 'status', v_p.status, 'shirt_size', v_p.shirt_size,
    'areas', to_jsonb(v_p.areas), 'day_prefs', to_jsonb(v_p.day_prefs), 'availability', v_p.availability,
    'buddy_person_id', v_p.buddy_person_id, 'buddy_note', v_p.buddy_note,
    'applied_at', v_p.applied_at, 'decided_at', v_p.decided_at, 'decision_note', v_p.decision_note,
    'shifts', (select count(*) from shift_assignment a where a.person_id = v_pid and a.status in ('assigned', 'confirmed')),
    -- Ticket: nur was die Person braucht. `coupon_error` bleibt drin — das ist
    -- unsere Panne, nicht ihre.
    'coupon_status', v_p.coupon_status,
    'coupon_code', case when v_p.coupon_status in ('issued', 'redeemed') then v_p.coupon_code end,
    'redeemed_at', v_p.redeemed_at,
    'undershop_id', case when v_p.coupon_status = 'issued' then v_shop end);
end $$;

-- ---------------------------------------------------------------- Mail

insert into mail_template (key, locale, subject, body_md, active) values
  ('volunteer_ticket_reminder', 'de',
   'Dein Volunteer-Ticket wartet noch',
   E'Hallo {{first_name}},\n\ndein Ticket für {{edition}} ist reserviert, aber noch nicht abgeholt. Einlösen dauert eine Minute — und erst danach steht dein Platz fest.\n\n**Dein Code:** {{code}}\n\n[Ticket einlösen]({{portal_url}}/volunteers)\n\nWenn du doch nicht dabei sein kannst, sag uns kurz Bescheid — dann rückt jemand von der Warteliste nach.\n\nDanke dir!\nDein ChefTreff-Team',
   true),
  ('volunteer_ticket_reminder', 'en',
   'Your volunteer ticket is still waiting',
   E'Hi {{first_name}},\n\nyour ticket for {{edition}} is reserved but not collected yet. Redeeming takes a minute — and only then is your spot confirmed.\n\n**Your code:** {{code}}\n\n[Redeem ticket]({{portal_url}}/volunteers)\n\nIf you cannot make it after all, just tell us — then someone from the waiting list moves up.\n\nThank you!\nYour ChefTreff team',
   true)
on conflict (key, locale) do nothing;

select harden_definer_functions();
