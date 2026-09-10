-- 0034 · v2 Speaker-Ticket + Begleitticket (Welle 2 A7); hospitality_block_reason liefert 'declined' als eigenen Grund.
-- Regel: pipeline_status ab 'confirmed' ⇒ Anspruch auf das Speaker-Ticket (pass_type + lounge_access aus dem Profil). Das Freiticket
-- entsteht automatisch als ticket-Zeile im Status 'requested' (Trigger); die Ausstellung läuft über die vivenu-API (App-Route mit
-- service_role) und endet in set_ticket_issued ⇒ 'valid' mit Barcode. Ein Begleitticket je Speaker (gleicher Pass-Typ, ohne Lounge):
-- Anfrage durch Speaker/Assistenz ⇒ 'requested', Team bestätigt ⇒ 'approved' ⇒ Ausstellung ⇒ 'valid'. Zweite Anfrage ⇒ 23505.
set search_path = public, extensions;

-- 1) ticket: Anforderungszustände, Freitickets ohne Barcode, Bezug zum Speaker-Profil, Lounge-Flag
alter table ticket alter column barcode drop not null;
alter table ticket drop constraint if exists ticket_status_check;
alter table ticket add constraint ticket_status_check
  check (status in ('requested', 'approved', 'valid', 'cancelled', 'refunded', 'checked_in', 'blocked'));
alter table ticket add column if not exists speaker_profile_id uuid references speaker_profile (id) on delete set null;
alter table ticket add column if not exists lounge_access      boolean not null default false;
alter table ticket add column if not exists team_note          text;
alter table ticket add column if not exists requested_by       uuid references person (id) on delete set null;
alter table ticket add column if not exists approved_by        uuid references person (id) on delete set null;
alter table ticket add column if not exists approved_at        timestamptz;
create index if not exists ticket_speaker_profile_idx on ticket (speaker_profile_id);
create unique index if not exists ticket_speaker_own_uidx       on ticket (speaker_profile_id) where source = 'speaker'           and status <> 'cancelled';
create unique index if not exists ticket_speaker_companion_uidx on ticket (speaker_profile_id) where source = 'speaker_companion' and status <> 'cancelled';
comment on column ticket.barcode            is 'QR aus vivenu. NULL, solange ein Freiticket noch nicht ausgestellt ist (Status requested/approved).';
comment on column ticket.speaker_profile_id is 'Freiticket aus dem Speaker-Portal: eigenes Ticket (source speaker) oder Begleitticket (source speaker_companion).';
comment on column ticket.lounge_access      is 'Speaker-Lounge; aus speaker_profile.lounge_access, Begleittickets nie.';
comment on column ticket.team_note          is 'Hinweis des Teams an den Anfragenden (Ablehnungsgrund, Rückfrage).';
grant select (speaker_profile_id, lounge_access, team_note, approved_at) on ticket to authenticated;

-- 2) Hospitality: Absage als eigener Grund (Oberfläche muss 'declined' nicht mehr aus dem Status ableiten)
create or replace function hospitality_block_reason(p_profile_id uuid) returns text
language sql stable security definer set search_path = public, extensions as $$
  select case
    when sp.hospitality_status = 'declined' then 'declined'
    when sp.hospitality_status not in ('eligible', 'requested', 'booked') then 'status'
    when not coalesce((select c.granted from consent_current c where c.person_id = sp.person_id and c.consent_type = 'hospitality_data'), false) then 'consent'
    else null end
  from speaker_profile sp where sp.id = p_profile_id
$$;

-- 3) Helfer
create or replace function speaker_is_confirmed(p_status text) returns boolean
language sql immutable as $$ select p_status in ('confirmed', 'onboarded', 'ready', 'published', 'attended') $$;

-- Mail an alle aktiven area_lead_speaker, ohne solche an globale Admins. Nur aus Definer-Funktionen aufrufbar.
create or replace function notify_speaker_leads(p_template_key text, p_vars jsonb, p_related_type text, p_related_id uuid) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare r record; v_n integer := 0;
begin
  for r in
    select distinct ra.person_id from role_assignment ra
    where ra.role = 'area_lead_speaker' and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())
  loop
    perform queue_mail(p_template_key, r.person_id, p_vars, p_related_type, p_related_id); v_n := v_n + 1;
  end loop;
  if v_n = 0 then
    for r in
      select distinct ra.person_id from role_assignment ra
      where ra.role = 'admin' and ra.scope_type = 'global' and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())
    loop
      perform queue_mail(p_template_key, r.person_id, p_vars, p_related_type, p_related_id); v_n := v_n + 1;
    end loop;
  end if;
  return v_n;
end $$;
revoke execute on function notify_speaker_leads(text, jsonb, text, uuid) from public, anon, authenticated;

-- 4) Speaker-Ticket anlegen (intern, ohne Rechteprüfung) und Sync über Trigger auf speaker_profile
create or replace function speaker_ticket_create(p_profile_id uuid) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_sp speaker_profile%rowtype; v_p person%rowtype; v_email citext; v_id uuid; v_company text; v_complete boolean;
begin
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not speaker_is_confirmed(v_sp.pipeline_status) then raise exception 'not_eligible' using errcode = 'P0001', detail = v_sp.pipeline_status; end if;
  select t.id into v_id from ticket t where t.speaker_profile_id = p_profile_id and t.source = 'speaker' and t.status <> 'cancelled';
  if found then return v_id; end if;
  select * into v_p from person where id = v_sp.person_id;
  select pe.email into v_email from person_email pe where pe.person_id = v_sp.person_id and pe.is_primary limit 1;
  v_company := coalesce(nullif(btrim(v_sp.organization_name), ''),
                        (select coalesce(o.communication_name, o.legal_name) from organization o where o.id = v_sp.org_id));
  v_complete := coalesce(nullif(btrim(v_p.first_name), ''), '') <> '' and coalesce(nullif(btrim(v_p.last_name), ''), '') <> ''
                and coalesce(v_company, '') <> '' and coalesce(nullif(btrim(v_sp.job_title), ''), '') <> '';
  insert into ticket (event_id, person_id, speaker_profile_id, pass_type, lounge_access, holder_email, holder_first_name, holder_last_name,
                      holder_company, holder_position, status, personalization_status, price_cents, source, requested_by)
  values (v_sp.edition_id, v_sp.person_id, p_profile_id, v_sp.pass_type, v_sp.lounge_access, v_email, v_p.first_name, v_p.last_name,
          v_company, v_sp.job_title, 'requested', case when v_complete then 'complete' else 'partial' end, 0, 'speaker', current_person_id())
  returning id into v_id;
  perform log_audit('ticket.speaker_requested', 'ticket', v_id::text, null,
                    jsonb_build_object('profile_id', p_profile_id, 'pass_type', v_sp.pass_type, 'lounge_access', v_sp.lounge_access));
  return v_id;
end $$;
revoke execute on function speaker_ticket_create(uuid) from public, anon, authenticated;

-- Öffentlich: Manager/Team können das Ticket nachziehen (z. B. nach manueller Storno)
create or replace function ensure_speaker_ticket(p_profile_id uuid) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is not null and not can_manage_speaker(p_profile_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  return speaker_ticket_create(p_profile_id);
end $$;

create or replace function speaker_profile_tickets_sync() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare v_n integer;
begin
  if speaker_is_confirmed(new.pipeline_status) and (tg_op = 'INSERT' or not speaker_is_confirmed(old.pipeline_status)) then
    perform speaker_ticket_create(new.id);
  elsif tg_op = 'UPDATE' and speaker_is_confirmed(old.pipeline_status) and not speaker_is_confirmed(new.pipeline_status) then
    -- Absage/Rückstufung: noch nicht ausgestellte Freitickets zurückziehen; ausgestellte (valid) storniert das Team über vivenu
    update ticket set status = 'cancelled', team_note = coalesce(team_note, 'speaker_pipeline:' || new.pipeline_status)
     where speaker_profile_id = new.id and status in ('requested', 'approved');
    get diagnostics v_n = row_count;
    if v_n > 0 then
      perform log_audit('ticket.withdrawn', 'speaker_profile', new.id::text, jsonb_build_object('pipeline_status', old.pipeline_status),
                        jsonb_build_object('pipeline_status', new.pipeline_status, 'tickets', v_n));
    end if;
  end if;
  if tg_op = 'UPDATE' and (new.pass_type is distinct from old.pass_type or new.lounge_access is distinct from old.lounge_access) then
    update ticket set pass_type = new.pass_type, lounge_access = new.lounge_access
     where speaker_profile_id = new.id and source = 'speaker' and status in ('requested', 'approved');
    update ticket set pass_type = new.pass_type
     where speaker_profile_id = new.id and source = 'speaker_companion' and status in ('requested', 'approved');
  end if;
  return new;
end $$;
drop trigger if exists trg_speaker_profile_tickets on speaker_profile;
create trigger trg_speaker_profile_tickets after insert or update of pipeline_status, pass_type, lounge_access on speaker_profile
  for each row execute function speaker_profile_tickets_sync();

-- Bestehende bestätigte Speaker nachziehen (aktuell nur Testdaten)
select count(*) as backfilled from (
  select speaker_ticket_create(sp.id) from speaker_profile sp
  where speaker_is_confirmed(sp.pipeline_status)
    and not exists (select 1 from ticket t where t.speaker_profile_id = sp.id and t.source = 'speaker' and t.status <> 'cancelled')
) s;

-- 5) Begleitticket: Anfrage (Speaker/Assistenz/Manager), Rückzug, Bestätigung/Ablehnung (Team)
create or replace function request_companion_ticket(p_profile_id uuid, p_email text, p_first_name text, p_last_name text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_email citext; v_first text; v_last text; v_id uuid; v_speaker text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not (v_sp.person_id = v_me or v_sp.assistant_person_id = v_me or can_manage_speaker(p_profile_id)) then
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

create or replace function cancel_companion_ticket(p_ticket_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_t ticket%rowtype; v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_team boolean;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_t from ticket where id = p_ticket_id and source = 'speaker_companion' for update;
  if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_t.speaker_profile_id;
  v_team := is_speaker_team(v_sp.edition_id);
  if not (v_team or v_sp.person_id = v_me or v_sp.assistant_person_id = v_me or can_manage_speaker(v_sp.id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_t.status = 'cancelled' then return; end if;
  if v_t.status = 'valid' and not v_team then raise exception 'already_issued' using errcode = 'P0001'; end if;  -- ausgestellt: nur Team (Storno in vivenu)
  if v_t.status not in ('requested', 'approved', 'valid') then raise exception 'not_cancellable' using errcode = 'P0001', detail = v_t.status; end if;
  update ticket set status = 'cancelled' where id = p_ticket_id;
  perform log_audit('ticket.companion_cancelled', 'ticket', p_ticket_id::text, jsonb_build_object('status', v_t.status),
                    jsonb_build_object('status', 'cancelled', 'by_team', v_team));
end $$;

create or replace function confirm_companion_ticket(p_ticket_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_t ticket%rowtype; v_sp speaker_profile%rowtype;
begin
  select * into v_t from ticket where id = p_ticket_id and source = 'speaker_companion' for update;
  if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_t.speaker_profile_id;
  if not is_speaker_team(v_sp.edition_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_t.status <> 'requested' then raise exception 'not_pending' using errcode = 'P0001', detail = v_t.status; end if;
  update ticket set status = 'approved', approved_by = current_person_id(), approved_at = now(), team_note = nullif(btrim(p_note), '')
   where id = p_ticket_id;
  perform queue_mail('companion_ticket_confirmed', v_sp.person_id,
                     jsonb_build_object('companion_name', btrim(coalesce(v_t.holder_first_name, '') || ' ' || coalesce(v_t.holder_last_name, '')),
                                        'companion_email', v_t.holder_email::text, 'note', coalesce(nullif(btrim(p_note), ''), '')),
                     'ticket', p_ticket_id);
  perform log_audit('ticket.companion_approved', 'ticket', p_ticket_id::text, jsonb_build_object('status', v_t.status),
                    jsonb_build_object('status', 'approved', 'note', p_note));
end $$;

create or replace function decline_companion_ticket(p_ticket_id uuid, p_note text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_t ticket%rowtype; v_sp speaker_profile%rowtype;
begin
  if nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'note_required' using errcode = '22023'; end if;
  select * into v_t from ticket where id = p_ticket_id and source = 'speaker_companion' for update;
  if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_t.speaker_profile_id;
  if not is_speaker_team(v_sp.edition_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_t.status not in ('requested', 'approved') then raise exception 'not_pending' using errcode = 'P0001', detail = v_t.status; end if;
  update ticket set status = 'cancelled', team_note = btrim(p_note), approved_by = null, approved_at = null where id = p_ticket_id;
  perform queue_mail('companion_ticket_declined', v_sp.person_id,
                     jsonb_build_object('companion_name', btrim(coalesce(v_t.holder_first_name, '') || ' ' || coalesce(v_t.holder_last_name, '')),
                                        'note', btrim(p_note)),
                     'ticket', p_ticket_id);
  perform log_audit('ticket.companion_declined', 'ticket', p_ticket_id::text, jsonb_build_object('status', v_t.status),
                    jsonb_build_object('status', 'cancelled', 'note', p_note));
end $$;

-- 6) Ausstellung über vivenu (App-Route mit service_role; Team darf auch). Ingest (Welle 1 A1) muss auf vivenu_ticket_id upserten,
--    damit der Webhook zum selben Freiticket keine zweite Zeile anlegt.
create or replace function set_ticket_issued(p_ticket_id uuid, p_vivenu_ticket_id text, p_barcode text,
                                             p_vivenu_transaction_id text default null, p_ticket_type_map_id uuid default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_t ticket%rowtype; v_sp speaker_profile%rowtype;
begin
  select * into v_t from ticket where id = p_ticket_id for update;
  if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_t.speaker_profile_id;
  if auth.uid() is not null and not is_speaker_team(v_sp.edition_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_t.source not in ('speaker', 'speaker_companion') then raise exception 'not_a_free_ticket' using errcode = 'P0001', detail = v_t.source; end if;
  if v_t.source = 'speaker' and v_t.status <> 'requested' then raise exception 'not_pending' using errcode = 'P0001', detail = v_t.status; end if;
  if v_t.source = 'speaker_companion' and v_t.status <> 'approved' then raise exception 'not_approved' using errcode = 'P0001', detail = v_t.status; end if;
  if nullif(btrim(coalesce(p_barcode, '')), '') is null or nullif(btrim(coalesce(p_vivenu_ticket_id, '')), '') is null then
    raise exception 'barcode_required' using errcode = '22023';
  end if;
  update ticket set status = 'valid', barcode = btrim(p_barcode), vivenu_ticket_id = btrim(p_vivenu_ticket_id),
                    vivenu_transaction_id = coalesce(nullif(btrim(p_vivenu_transaction_id), ''), vivenu_transaction_id),
                    ticket_type_map_id = coalesce(p_ticket_type_map_id, ticket_type_map_id), purchased_at = now()
   where id = p_ticket_id;
  perform log_audit('ticket.issued', 'ticket', p_ticket_id::text, jsonb_build_object('status', v_t.status),
                    jsonb_build_object('status', 'valid', 'source', v_t.source, 'vivenu_ticket_id', btrim(p_vivenu_ticket_id)));
end $$;

-- 7) Lesewege
create or replace function my_speaker_tickets(p_edition_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_sp speaker_profile%rowtype;
begin
  select sp.* into v_sp from speaker_profile sp where sp.id = my_speaker_profile_id(p_edition_id);
  if not found then return null; end if;
  return jsonb_build_object(
    'eligible', speaker_is_confirmed(v_sp.pipeline_status),
    'pipeline_status', v_sp.pipeline_status,
    'pass_type', v_sp.pass_type,
    'lounge_access', v_sp.lounge_access,
    'own', (select to_jsonb(x) from (
              select t.id, t.status, t.pass_type, t.lounge_access, t.barcode, t.holder_first_name, t.holder_last_name, t.holder_company,
                     t.holder_position, t.personalization_status, t.checked_in_at, t.created_at, t.purchased_at as issued_at
              from ticket t where t.speaker_profile_id = v_sp.id and t.source = 'speaker' and t.status <> 'cancelled'
              order by t.created_at desc limit 1) x),
    'companion', (select to_jsonb(x) from (
              select t.id, t.status, t.pass_type, t.holder_first_name as first_name, t.holder_last_name as last_name, t.holder_email::text as email,
                     t.team_note, t.created_at, t.approved_at, t.purchased_at as issued_at, (t.barcode is not null) as issued
              from ticket t where t.speaker_profile_id = v_sp.id and t.source = 'speaker_companion' and t.status <> 'cancelled'
              order by t.created_at desc limit 1) x),
    'companion_history', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'status', t.status, 'first_name', t.holder_first_name,
                                                                        'last_name', t.holder_last_name, 'team_note', t.team_note, 'created_at', t.created_at)
                                                     order by t.created_at desc), '[]'::jsonb)
                          from ticket t where t.speaker_profile_id = v_sp.id and t.source = 'speaker_companion' and t.status = 'cancelled')
  );
end $$;

create or replace function speaker_tickets_admin(p_edition_id uuid default null)
returns table (id uuid, profile_id uuid, speaker_name text, source text, status text, pass_type text, lounge_access boolean,
               holder_first_name text, holder_last_name text, holder_email text, issued boolean, vivenu_ticket_id text,
               requested_at timestamptz, approved_at timestamptz, team_note text)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_speaker_team(p_edition_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select t.id, t.speaker_profile_id, btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), t.source, t.status, t.pass_type,
           t.lounge_access, t.holder_first_name, t.holder_last_name, t.holder_email::text, (t.barcode is not null), t.vivenu_ticket_id,
           t.created_at, t.approved_at, t.team_note
    from ticket t
    join speaker_profile sp on sp.id = t.speaker_profile_id
    join person p on p.id = sp.person_id
    where t.source in ('speaker', 'speaker_companion')
      and (p_edition_id is null or sp.edition_id = p_edition_id)
    order by case t.status when 'requested' then 0 when 'approved' then 1 when 'valid' then 2 else 3 end, t.created_at;
end $$;

-- 8) Mail-Templates
insert into mail_template (key, locale, version, subject, body_md, description, active)
select v.key, v.locale, v.version, v.subject, v.body_md, v.description, v.active from (values
  ('companion_ticket_requested', 'de', 1, 'Begleitticket-Anfrage von {{speaker_name}}',
   E'Hallo {{first_name}},\n\n**{{speaker_name}}** hat ein Begleitticket für **{{companion_name}}** angefragt.\n\nBitte prüfen und bestätigen: [Speaker-Tickets]({{portal_url}}/admin/speaker-tickets)\n\nChefTreff-Portal',
   'Intern: neue Begleitticket-Anfrage (an area_lead_speaker)', true),
  ('companion_ticket_requested', 'en', 1, 'Companion ticket request from {{speaker_name}}',
   E'Hi {{first_name}},\n\n**{{speaker_name}}** requested a companion ticket for **{{companion_name}}**.\n\nPlease review: [Speaker tickets]({{portal_url}}/admin/speaker-tickets)\n\nChefTreff portal',
   'Internal: new companion ticket request', true),
  ('companion_ticket_confirmed', 'en', 1, 'Companion ticket for {{companion_name}} confirmed',
   E'Hi {{first_name}},\n\nthe companion ticket for **{{companion_name}}** is confirmed. We issue the ticket and send it to {{companion_email}}.\n\n{{note}}\n\nYour tickets in the portal: [Tickets]({{portal_url}}/speaker/tickets)\n\nBest,\nChefTreff',
   'Companion ticket confirmed (to the speaker)', true),
  ('companion_ticket_confirmed', 'de', 1, 'Begleitticket für {{companion_name}} bestätigt',
   E'Hallo {{first_name}},\n\ndas Begleitticket für **{{companion_name}}** ist bestätigt. Wir stellen das Ticket aus und schicken es an {{companion_email}}.\n\n{{note}}\n\nDeine Tickets im Portal: [Tickets]({{portal_url}}/speaker/tickets)\n\nViele Grüße\nChefTreff',
   'Begleitticket bestätigt (an den Speaker)', true),
  ('companion_ticket_declined', 'en', 1, 'Companion ticket for {{companion_name}} not confirmed',
   E'Hi {{first_name}},\n\nwe could not confirm the companion ticket for **{{companion_name}}**:\n\n{{note}}\n\nIf you have questions, reply to the speaker team.\n\nBest,\nChefTreff',
   'Companion ticket declined (to the speaker)', true),
  ('companion_ticket_declined', 'de', 1, 'Begleitticket für {{companion_name}} nicht bestätigt',
   E'Hallo {{first_name}},\n\ndas Begleitticket für **{{companion_name}}** konnten wir nicht bestätigen:\n\n{{note}}\n\nBei Fragen antworte dem Speaker-Team.\n\nViele Grüße\nChefTreff',
   'Begleitticket abgelehnt (an den Speaker)', true)
) as v(key, locale, version, subject, body_md, description, active)
where not exists (select 1 from mail_template t where t.key = v.key and t.locale = v.locale);

select harden_definer_functions();
