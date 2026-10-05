-- 0268 · Speaker-Tickets final: Kontingent, Begleittickets, Lounge je Ticket, Löschweg der Begleitungen
-- Angewendet von der Architektur-Session am 05.10.2026 als 20261005170530.
-- NNNN · Speaker-Tickets final: Begleittickets beliebig, Lounge je Ticket, das Team legt an (ADM-076, Konrad und Paulina 05.10.2026)
--
-- Anlass: „Speaker-Tickets final“ (Feedbackrunde 05.10.): das Team legt Tickets an und stellt sie aus, **Kontingente je
-- Speaker erhöhen (Begleittickets beliebig — Konrads Prüfpunkt)**, **Lounge-Berechtigung je Ticket**, **Gesamtliste aller
-- Lounge-Berechtigten** (CSV im Code, kein Modell). Bisher gab es genau **ein** aktives Begleitticket je Speaker (Unique-Index),
-- die Lounge stand nur am Profil und wurde bis „approved“ ans Ticket kopiert, Begleittickets bekamen nie Lounge.
--
-- Datenmodell mit Plan abgestimmt (05.10.2026, Antworten a–c und vier Auflagen):
--   1  `speaker_profile.companion_quota` int not null default 1 check (0..50) — heutiges Verhalten bleibt Standard; **0 erlaubt**
--      (das Portal zeigt dann den Grund). Der Unique-Index `ticket_speaker_companion_uidx` (ein aktives Begleitticket) entfällt;
--      `request_companion_ticket` zählt die aktiven Begleittickets unter dem vorhandenen `for update` auf dem Profil.
--   2  Neuer Teilindex über **dieselbe Begleitung** nicht stornierter Begleittickets: `(speaker_profile_id, lower(holder_email))`.
--      `request_companion_ticket` und `team_add_companion_ticket` melden das als `companion_exists`, ein volles Kontingent als
--      `quota_exceeded` (beide P0001) — nie als 23505.
--   3  Neue Team-Funktionen (alle `is_speaker_team`, Audit mit person_id, alt/neu, **keine E-Mail der Begleitung im Audit**):
--      `set_companion_quota` (nicht unter die aktiven), `team_add_companion_ticket` (legt direkt `approved` an, Mail
--      `companion_ticket_confirmed` über die Speaker-Mail-Weiche), `set_ticket_lounge` (**nur Begleittickets**),
--      `speaker_ticket_quotas` (Lesefunktion für die Kontingent-Ansicht).
--   4  **Lounge: eine Quelle je Ticketart.** Am **eigenen** Speaker-Ticket bleibt das Profil-Flag `lounge_access` die Quelle; die
--      Oberfläche schaltet dort das Profil-Flag (bestehender Weg `update_speaker`), `speaker_profile_tickets_sync` zieht nach —
--      jetzt auch an **ausgestellten** Eigentickets, weil vivenu die Lounge nicht trägt. `set_ticket_lounge` gilt **nur** für
--      Begleittickets (`not_a_companion` sonst), sonst überschriebe der Sync, was am Ticket gesetzt wurde.
--   5  Geänderte Funktionen aus dem Snapshot (`supabase/snapshot/functions/`): `request_companion_ticket` (Kontingent statt 23505,
--      `companion_exists`, Namenslänge), `speaker_profile_tickets_sync` (Lounge folgt dem Profil auch bei `valid`),
--      `my_speaker_tickets` **additiv** (`companions[]`, `companion_quota`, `companion_used`; `companion` bleibt das jüngste aktive,
--      damit ein alter App-Stand zwischen „Migration live“ und Deploy weiterläuft).
--   6  Mail: Die Vorlage `companion_ticket_confirmed` nannte `{{companion_email}}` im Text. Die Mail geht an den Empfänger der
--      Speaker-Mails — bei einem verwalteten Speaker eine **dritte Person** —, und die Begleitung soll dort nicht mit Adresse
--      stehen (Plan, Antwort c). Der Satz wird **an Ort und Stelle** ersetzt (nur wenn er noch den Platzhalter trägt, also
--      sind Änderungen am Rest der Vorlage sicher); `team_add_companion_ticket` übergibt keine Adresse, und `confirm_companion_ticket`
--      (Abschnitt 12, eine Zeile weniger) nicht mehr — `mail_log.meta.vars` speichert die Variablen im Klartext.
--   7  Stornieren **ausgestellter** Tickets bleibt beim vivenu-Storno (der Webhook zieht den Stand hier nach); die Oberfläche
--      sagt das und ruft vivenu nicht selbst. `cancel_companion_ticket` bleibt unverändert.
--   8  **Löschweg (Fund beim Datenschutz-Abgleich, nicht abgestimmt — bitte im Review entscheiden):** `anonymize_person` leerte nur
--      Tickets mit `person_id`; Begleittickets haben keine, Name und Adresse der Begleitung blieben nach „Profil löschen“ des
--      Speakers stehen. Abschnitt 11 ergänzt **eine** Anweisung (aus dem Snapshot, Rest unverändert): Begleittickets der Profile der
--      Person verlieren Name, Adresse, Firma, Position, Teamnotiz und Zusatzfelder; Status, Pass und Lounge bleiben.
--
-- Nicht angefasst: `decline_companion_ticket`, `cancel_companion_ticket`, `set_ticket_issued`, `speaker_ticket_for_issue`,
-- `speaker_tickets_admin` — die Admin-Liste bekommt Lounge und Kontingent über die neuen Funktionen.
set search_path = public, extensions;

-- === 1 · Kontingent je Speaker ===========================================================================================
alter table speaker_profile
  add column if not exists companion_quota integer not null default 1 check (companion_quota between 0 and 50);
comment on column speaker_profile.companion_quota is
  'Wie viele Begleittickets dieser Speaker haben darf (0–50, Standard 1). Das Team erhöht es im Admin (set_companion_quota); '
  'gezählt werden nicht stornierte Begleittickets.';
comment on column ticket.lounge_access is
  'Speaker-Lounge. Am eigenen Speaker-Ticket aus speaker_profile.lounge_access (der Sync zieht nach, auch nach der Ausstellung); '
  'am Begleitticket setzt das Team sie je Ticket (set_ticket_lounge), Standard aus.';

-- === 2 · Dieselbe Begleitung nicht doppelt, aber mehrere Begleitungen ==============================================================
drop index if exists ticket_speaker_companion_uidx;
create unique index if not exists ticket_speaker_companion_email_uidx
  on ticket (speaker_profile_id, lower(holder_email::text))
  where source = 'speaker_companion' and status <> 'cancelled';

-- === 3 · Begleitticket anfragen: Kontingent statt Index (aus dem Snapshot) ======================================================
create or replace function request_companion_ticket(p_profile_id uuid, p_email text, p_first_name text, p_last_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_email citext; v_first text; v_last text; v_id uuid; v_speaker text; v_used integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce((v_sp.person_id = v_me or is_speaker_assistant(v_sp.id, v_me) or can_manage_speaker(p_profile_id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not speaker_is_confirmed(v_sp.pipeline_status) then raise exception 'not_eligible' using errcode = 'P0001', detail = v_sp.pipeline_status; end if;
  v_email := lower(btrim(coalesce(p_email, '')))::citext;
  if v_email::text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email::text) > 254 then raise exception 'invalid_email' using errcode = '22023'; end if;
  v_first := nullif(btrim(coalesce(p_first_name, '')), '');
  v_last  := nullif(btrim(coalesce(p_last_name, '')), '');
  if v_first is null or v_last is null then raise exception 'name_required' using errcode = '22023'; end if;
  if char_length(v_first) > 100 or char_length(v_last) > 100 then raise exception 'too_long' using errcode = '22023', detail = 'name'; end if;
  if exists (select 1 from person_email pe where pe.person_id = v_sp.person_id and pe.email = v_email) then
    raise exception 'companion_is_speaker' using errcode = '22023';
  end if;
  -- Dieselbe Begleitung zweimal ⇒ companion_exists; ein volles Kontingent ⇒ quota_exceeded (beide P0001, nie 23505).
  -- Gezählt wird unter dem `for update` auf dem Profil: zwei gleichzeitige Anfragen laufen nacheinander.
  if exists (select 1 from ticket t where t.speaker_profile_id = p_profile_id and t.source = 'speaker_companion'
                and t.status <> 'cancelled' and lower(t.holder_email::text) = v_email::text) then
    raise exception 'companion_exists' using errcode = 'P0001';
  end if;
  select count(*)::integer into v_used from ticket t
   where t.speaker_profile_id = p_profile_id and t.source = 'speaker_companion' and t.status <> 'cancelled';
  if v_used >= v_sp.companion_quota then
    raise exception 'quota_exceeded' using errcode = 'P0001', detail = v_sp.companion_quota::text;
  end if;
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

-- === 4 · Das Team legt ein Begleitticket an (neu) ================================================================================
create or replace function team_add_companion_ticket(
  p_profile_id uuid, p_email text, p_first_name text, p_last_name text, p_lounge boolean default false)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_email citext; v_first text; v_last text; v_id uuid; v_used integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not coalesce(is_speaker_team(null), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  -- Gäste einer Standbühne haben keine Tickets aus dem Speaker-Portal (PART-081, `speaker_ticket_create` verweigert sie ebenso).
  if v_sp.stage_guest then raise exception 'not_eligible' using errcode = 'P0001', detail = 'stage_guest'; end if;
  if not speaker_is_confirmed(v_sp.pipeline_status) then raise exception 'not_eligible' using errcode = 'P0001', detail = v_sp.pipeline_status; end if;
  v_email := lower(btrim(coalesce(p_email, '')))::citext;
  if v_email::text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email::text) > 254 then raise exception 'invalid_email' using errcode = '22023'; end if;
  v_first := nullif(btrim(coalesce(p_first_name, '')), '');
  v_last  := nullif(btrim(coalesce(p_last_name, '')), '');
  if v_first is null or v_last is null then raise exception 'name_required' using errcode = '22023'; end if;
  if char_length(v_first) > 100 or char_length(v_last) > 100 then raise exception 'too_long' using errcode = '22023', detail = 'name'; end if;
  if exists (select 1 from person_email pe where pe.person_id = v_sp.person_id and pe.email = v_email) then
    raise exception 'companion_is_speaker' using errcode = '22023';
  end if;
  if exists (select 1 from ticket t where t.speaker_profile_id = p_profile_id and t.source = 'speaker_companion'
                and t.status <> 'cancelled' and lower(t.holder_email::text) = v_email::text) then
    raise exception 'companion_exists' using errcode = 'P0001';
  end if;
  select count(*)::integer into v_used from ticket t
   where t.speaker_profile_id = p_profile_id and t.source = 'speaker_companion' and t.status <> 'cancelled';
  if v_used >= v_sp.companion_quota then
    raise exception 'quota_exceeded' using errcode = 'P0001', detail = v_sp.companion_quota::text;
  end if;
  -- Direkt `approved`: das Team hat entschieden, es gibt nichts mehr zu bestätigen. Ausgestellt wird danach wie jedes Begleitticket.
  insert into ticket (event_id, speaker_profile_id, pass_type, lounge_access, holder_email, holder_first_name, holder_last_name,
                      status, personalization_status, price_cents, source, requested_by, approved_by, approved_at)
  values (v_sp.edition_id, p_profile_id, v_sp.pass_type, coalesce(p_lounge, false), v_email, v_first, v_last,
          'approved', 'partial', 0, 'speaker_companion', v_me, v_me, now())
  returning id into v_id;
  -- An den Empfänger der Speaker-Mails (bei einem verwalteten Speaker eine dritte Person): **ohne** die Adresse der Begleitung.
  perform queue_speaker_mail('companion_ticket_confirmed', v_sp.id,
                             jsonb_build_object('companion_name', v_first || ' ' || v_last, 'note', ''), 'ticket', v_id);
  -- Audit nur mit der Person des Speakers, nie mit Namen oder Adresse der Begleitung.
  perform log_audit('ticket.companion_added_by_team', 'ticket', v_id::text, null,
                    jsonb_build_object('person_id', v_sp.person_id, 'profile_id', p_profile_id, 'lounge', coalesce(p_lounge, false),
                                       'quota', v_sp.companion_quota, 'used_before', v_used));
  return v_id;
end $$;

-- === 5 · Kontingent erhöhen oder senken (neu) ====================================================================================
create or replace function set_companion_quota(p_profile_id uuid, p_quota integer)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $$
declare v_sp speaker_profile%rowtype; v_used integer;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not coalesce(is_speaker_team(null), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_quota is null or p_quota < 0 or p_quota > 50 then raise exception 'invalid_quota' using errcode = '22023'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  select count(*)::integer into v_used from ticket t
   where t.speaker_profile_id = p_profile_id and t.source = 'speaker_companion' and t.status <> 'cancelled';
  -- Unter die schon vergebenen geht es nicht: erst stornieren, dann senken (sonst stünde „2 von 1“ im Portal).
  if p_quota < v_used then raise exception 'quota_below_used' using errcode = 'P0001', detail = v_used::text; end if;
  if p_quota = v_sp.companion_quota then return; end if;
  update speaker_profile set companion_quota = p_quota where id = p_profile_id;
  perform log_audit('ticket.companion_quota_set', 'speaker_profile', p_profile_id::text,
                    jsonb_build_object('person_id', v_sp.person_id, 'quota', v_sp.companion_quota),
                    jsonb_build_object('person_id', v_sp.person_id, 'quota', p_quota, 'used', v_used));
end $$;

-- === 6 · Lounge am Begleitticket (neu; das eigene Ticket folgt dem Profil) ========================================================
create or replace function set_ticket_lounge(p_ticket_id uuid, p_lounge boolean)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $$
declare v_t ticket%rowtype; v_sp speaker_profile%rowtype;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not coalesce(is_speaker_team(null), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_lounge is null then raise exception 'invalid_argument' using errcode = '22023'; end if;
  select * into v_t from ticket where id = p_ticket_id for update;
  if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;
  -- Eine Quelle je Ticketart: am eigenen Ticket gilt das Profil-Flag (`speaker_profile_tickets_sync`), hier nur die Begleitung.
  if v_t.source <> 'speaker_companion' then raise exception 'not_a_companion' using errcode = 'P0001', detail = v_t.source; end if;
  if v_t.status = 'cancelled' then raise exception 'ticket_cancelled' using errcode = 'P0001'; end if;
  select * into v_sp from speaker_profile where id = v_t.speaker_profile_id;
  if v_t.lounge_access = p_lounge then return; end if;
  update ticket set lounge_access = p_lounge where id = p_ticket_id;
  perform log_audit('ticket.lounge_set', 'ticket', p_ticket_id::text,
                    jsonb_build_object('person_id', v_sp.person_id, 'lounge', v_t.lounge_access),
                    jsonb_build_object('person_id', v_sp.person_id, 'lounge', p_lounge));
end $$;

-- === 7 · Kontingente je Speaker, lesend (neu) ===================================================================================
create or replace function speaker_ticket_quotas(p_edition_id uuid default null)
 returns table (
   profile_id        uuid,
   speaker_name      text,
   pass_type         text,
   lounge_access     boolean,
   companion_quota   integer,
   companions_active integer,
   own_status        text)
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'extensions'
as $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not coalesce(is_speaker_team(p_edition_id), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select sp.id,
           coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), '—'),
           sp.pass_type, sp.lounge_access, sp.companion_quota,
           (select count(*)::integer from ticket t where t.speaker_profile_id = sp.id and t.source = 'speaker_companion' and t.status <> 'cancelled'),
           (select t.status from ticket t where t.speaker_profile_id = sp.id and t.source = 'speaker' and t.status <> 'cancelled'
             order by t.created_at desc limit 1)
      from speaker_profile sp
      join person p on p.id = sp.person_id
     where speaker_is_confirmed(sp.pipeline_status)
       and not sp.stage_guest
       and (p_edition_id is null or sp.edition_id = p_edition_id)
     order by lower(coalesce(p.last_name, '')), lower(coalesce(p.first_name, '')), sp.id;
end $$;

-- === 8 · Lounge folgt dem Profil auch an ausgestellten Eigentickets (aus dem Snapshot) =========================================
create or replace function speaker_profile_tickets_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_n integer;
begin
  -- PART-081: für Gäste kein Freiticket — die Anlage steht schon auf „zugesagt“.
  if not new.stage_guest and speaker_is_confirmed(new.pipeline_status) and (tg_op = 'INSERT' or not speaker_is_confirmed(old.pipeline_status)) then
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
  -- Der Pass-Typ steckt im vivenu-Tickettyp: nach der Ausstellung ändert er sich hier nicht mehr.
  if tg_op = 'UPDATE' and new.pass_type is distinct from old.pass_type then
    update ticket set pass_type = new.pass_type
     where speaker_profile_id = new.id and source in ('speaker', 'speaker_companion') and status in ('requested', 'approved');
  end if;
  -- ADM-076: Die Lounge trägt vivenu nicht — sie ist **unser** Merkmal und folgt dem Profil am eigenen Ticket in jedem
  -- lebenden Stand, auch ausgestellt. (Begleittickets steuert `set_ticket_lounge`, nie dieses Flag.)
  if tg_op = 'UPDATE' and new.lounge_access is distinct from old.lounge_access then
    update ticket set lounge_access = new.lounge_access
     where speaker_profile_id = new.id and source = 'speaker' and status in ('requested', 'approved', 'valid');
  end if;
  return new;
end $$;

-- === 9 · Meine Tickets: mehrere Begleitungen und das Kontingent, additiv (aus dem Snapshot) =======================================
create or replace function my_speaker_tickets(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_self boolean;
begin
  select sp.* into v_sp from speaker_profile sp where sp.id = my_speaker_profile_id(p_edition_id);
  if not found then return null; end if;
  v_self := (v_sp.person_id = v_me);
  return jsonb_build_object(
    'eligible', speaker_is_confirmed(v_sp.pipeline_status),
    'pipeline_status', v_sp.pipeline_status,
    'pass_type', v_sp.pass_type,
    'lounge_access', v_sp.lounge_access,
    'is_assistant', not v_self,
    'own', (select to_jsonb(x) from (
              select t.id, t.status, t.pass_type, t.lounge_access,
                     case when v_self then t.barcode end as barcode, (t.barcode is not null) as issued,
                     t.holder_first_name, t.holder_last_name, t.holder_company, t.holder_position, t.personalization_status,
                     t.checked_in_at, t.created_at, t.purchased_at as issued_at
              from ticket t where t.speaker_profile_id = v_sp.id and t.source = 'speaker' and t.status <> 'cancelled'
              order by t.created_at desc limit 1) x),
    -- Bis zur Umstellung der Oberfläche: das jüngste aktive Begleitticket wie bisher (ein alter App-Stand liest nur dieses).
    'companion', (select to_jsonb(x) from (
              select t.id, t.status, t.pass_type, t.holder_first_name as first_name, t.holder_last_name as last_name, t.holder_email::text as email,
                     t.team_note, t.created_at, t.approved_at, t.purchased_at as issued_at, (t.barcode is not null) as issued
              from ticket t where t.speaker_profile_id = v_sp.id and t.source = 'speaker_companion' and t.status <> 'cancelled'
              order by t.created_at desc limit 1) x),
    -- ADM-076: alle aktiven Begleitungen, die älteste zuerst, mit der Lounge-Berechtigung, und das Kontingent dazu.
    'companions', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at, x.id) from (
              select t.id, t.status, t.pass_type, t.holder_first_name as first_name, t.holder_last_name as last_name, t.holder_email::text as email,
                     t.team_note, t.created_at, t.approved_at, t.purchased_at as issued_at, (t.barcode is not null) as issued, t.lounge_access
              from ticket t where t.speaker_profile_id = v_sp.id and t.source = 'speaker_companion' and t.status <> 'cancelled') x), '[]'::jsonb),
    'companion_quota', v_sp.companion_quota,
    'companion_used', (select count(*)::integer from ticket t where t.speaker_profile_id = v_sp.id and t.source = 'speaker_companion' and t.status <> 'cancelled'),
    'companion_history', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'status', t.status, 'first_name', t.holder_first_name,
                                                                        'last_name', t.holder_last_name, 'team_note', t.team_note, 'created_at', t.created_at)
                                                     order by t.created_at desc), '[]'::jsonb)
                          from ticket t where t.speaker_profile_id = v_sp.id and t.source = 'speaker_companion' and t.status = 'cancelled')
  );
end $$;

-- === 10 · Mail: die Adresse der Begleitung steht nicht mehr im Text an Dritte ====================================================
-- Nur der eine Satz, nur wenn er noch den Platzhalter trägt: wer die Vorlage im Admin angepasst hat, behält seine Fassung.
update mail_template
   set body_md = replace(body_md, 'Wir stellen das Ticket aus und schicken es an {{companion_email}}.',
                                  'Wir stellen das Ticket aus und schicken es direkt an die Begleitung (an die hinterlegte E-Mail-Adresse).'),
       version = version + 1
 where key = 'companion_ticket_confirmed' and locale = 'de'
   and body_md like '%Wir stellen das Ticket aus und schicken es an {{companion_email}}.%';
update mail_template
   set body_md = replace(body_md, 'We issue the ticket and send it to {{companion_email}}.',
                                  'We issue the ticket and send it directly to your companion (at the email address on file).'),
       version = version + 1
 where key = 'companion_ticket_confirmed' and locale = 'en'
   and body_md like '%We issue the ticket and send it to {{companion_email}}.%';

-- === 11 · Löschweg: die Begleitungen fallen mit dem Profil des Speakers (aus dem Snapshot) ======================================
-- `anonymize_person` leerte nur Tickets mit `person_id` — Begleittickets haben keine, Name und Adresse der Begleitung blieben
-- nach „Profil löschen“ stehen. Mit mehreren Begleitungen je Speaker wiegt das schwerer. Eine Anweisung neu, sonst unverändert.
create or replace function anonymize_person(p_person_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_hash text; v_profile uuid[];
begin
  if p_person_id is null then raise exception 'person_not_found' using errcode = 'P0002'; end if;
  perform log_audit('profile.delete', 'person', p_person_id::text, null, null);

  select array_agg(sp.id) into v_profile from speaker_profile sp where sp.person_id = p_person_id;
  v_profile := coalesce(v_profile, '{}');

  -- 1 · Sperrliste. Der Hash bleibt, die Adresse geht.
  insert into suppression (email_hash, reason)
    select email_hash(email::text), 'profile_deleted' from person_email where person_id = p_person_id
  on conflict (email_hash) do nothing;
  select email_hash(pe.email::text) into v_hash
    from person_email pe where pe.person_id = p_person_id and pe.is_primary;

  -- 2 · Dateien zum Wegräumen anmelden, **bevor** die Zeilen fallen: danach
  --     wüsste niemand mehr, welche Pfade gemeint waren.
  insert into storage_purge_queue (bucket, path)
    select 'speaker-assets', sa.storage_path from speaker_asset sa where sa.profile_id = any (v_profile)
  on conflict (bucket, path) do nothing;
  -- Porträt aus dem Teilnehmer-Profil (TAL-012).
  insert into storage_purge_queue (bucket, path)
    select 'person-photos', p.photo_path from person p
     where p.id = p_person_id and p.photo_path is not null
  on conflict (bucket, path) do nothing;
  -- Lebenslauf aus dem Teilnehmer-Profil (TAL-013, B3).
  insert into storage_purge_queue (bucket, path)
    select 'person-cv', p.cv_path from person p
     where p.id = p_person_id and p.cv_path is not null
  on conflict (bucket, path) do nothing;

  -- 3 · Zeilen, die ohne die Person keinen Sinn mehr haben.
  delete from person_interest            where person_id = p_person_id;
  delete from person_acquisition_channel where person_id = p_person_id;
  delete from person_language            where person_id = p_person_id;
  delete from role_assignment            where person_id = p_person_id;
  -- Ansprechperson einer Organisation kann nur sein, wen es gibt.
  delete from org_membership             where person_id = p_person_id;
  delete from speaker_asset  where profile_id = any (v_profile);
  -- Anreise ist reine Logistik eines vergangenen Termins: Flugnummer, Ankunft,
  -- Notiz. Nichts davon trägt eine Zahl, die später jemand braucht.
  delete from speaker_travel where profile_id = any (v_profile);

  -- 4 · Die Person selbst. Grobe Merkmale bleiben für die Statistik
  --     (career_level, study_field, country, tier, occupation_status) — sie
  --     beschreiben eine Gruppe, keinen Menschen. Freitext, Kontaktdaten und
  --     alles nach Art. 9 DSGVO (Ernährung, Geschlecht) fällt weg.
  update person set
    first_name = null, last_name = null, birthdate = null, phone = null, phone_e164 = null,
    linkedin_url = null, linkedin_normalized = null,
    employer_name = null, university = null, title = null, city = null,
    nationality = null, invite_code = null, auth_user_id = null,
    gender = null, diet = null, diet_note = null, photo_path = null,
    job_title = null, study_program_label = null, cv_path = null,
    salutation_de = null, salutation_en = null, self_assessment = null,
    deleted_at = now()
  where id = p_person_id;

  delete from person_email where person_id = p_person_id and not is_primary;
  update person_email
     set email = ('deleted+' || p_person_id::text || '@anonym.invalid')::citext, verified = false
   where person_id = p_person_id and is_primary;

  -- 5 · Mail-Protokoll: die Zeile bleibt als Zahl (wie viele Einladungen gingen
  --     raus), die Adresse wird zum Hash und die eingesetzten Angaben — dort
  --     steht der Name im Klartext — verschwinden.
  update mail_log
     set to_email = ('deleted:' || coalesce(v_hash, p_person_id::text))::citext,
         meta = coalesce(meta, '{}'::jsonb) - 'vars'
   where person_id = p_person_id;

  -- 6 · Freitexte und Fremdschlüssel in allen übrigen Tabellen mit `person_id`.
  --     Was bleibt, ist jeweils der zählbare Teil: Status, Typ, Zeitpunkt.
  update application      set answers = '{}'::jsonb where person_id = p_person_id;
  update hack_application set motivation = null, team_pref = null, note = null,
                              github_url = null, website_url = null, behance_url = null
   where person_id = p_person_id;
  -- Der Einwilligungsnachweis bleibt — er ist der Beleg, dass wir durften, was
  -- wir getan haben. Das Gerät, von dem sie kam, ist dafür ohne Bedeutung.
  update consent_record   set user_agent = null where person_id = p_person_id;
  -- Fremdsystem-Verweise zeigen auf Kopien, die dort noch den Namen tragen;
  -- der Verweis selbst darf nicht bleiben (siehe Kopf, vivenu).
  update registration     set external_ref = null, external_ids = '{}'::jsonb where person_id = p_person_id;
  update shift_assignment set decline_reason = null where person_id = p_person_id;
  update volunteer_profile set availability = null, buddy_note = null, notes_internal = null,
                               decision_note = null, coupon_error = null, buddy_person_id = null
   where person_id = p_person_id;
  update ticket set holder_email = null, holder_first_name = null, holder_last_name = null,
                    holder_company = null, holder_position = null, buyer_email = null,
                    team_note = null, extra_fields = '{}'::jsonb
   where person_id = p_person_id;
  -- ADM-076: Begleittickets hängen am Profil des Speakers, nicht an einer Person (`person_id` ist leer). Die Begleitung hat
  --         hier nie ein Konto gehabt und kann die Löschung nicht selbst verlangen — wie der Kontakt ohne Portalzugang (0127)
  --         fällt sie mit dem Profil, das sie eingetragen hat. Name und Adresse gehen; Status, Pass und Lounge bleiben als Zahl.
  --         Was bei vivenu steht (ausgestellte Tickets), räumt die externe Löschung dort auf.
  update ticket set holder_email = null, holder_first_name = null, holder_last_name = null,
                    holder_company = null, holder_position = null, buyer_email = null,
                    team_note = null, extra_fields = '{}'::jsonb
   where source = 'speaker_companion' and speaker_profile_id = any (v_profile);

  -- 7 · Speaker-Profil und was daran hängt.
  update speaker_profile set
    bio_short_de = null, bio_short_en = null, bio_long_de = null, bio_long_en = null,
    job_title = null, organization_name = null, internal_notes = null,
    -- `tech_rider` und `socials` sind `not null default '{}'` — hier gehoert der
    -- leere Wert hin, nicht `null` (Probelauf der Architektur-Session, 23502).
    tech_rider = '{}'::jsonb, socials = '{}'::jsonb,
    decline_reason = null, photo_asset_id = null,
    -- Der Kontakt ohne Portalzugang (0127) gehoert einer **dritten** Person:
    -- Agentur, Office, Management. Sie hat hier nie ein Konto gehabt und kann
    -- die Loeschung auch nicht selbst verlangen — deshalb faellt sie mit dem
    -- Profil, das sie eingetragen hat. Keine Sperrliste: die Adresse stand nie
    -- in einem Verteiler, das Portal kann an sie gar nicht senden (`queue_mail`
    -- braucht eine `person_id`, und eine hat sie nicht).
    contact_first_name = null, contact_last_name = null, contact_email = null,
    contact_phone = null, contact_kind = null, contact_consent_at = null,
    -- LEAD-039: die Einordnung ist eine Einschätzung über die Person, und
    -- `contact_via` nennt, über wen sie läuft.
    category = null, topic_cluster = null, topic_role = null, priority = null,
    recommended_format = null, contact_via = null, outreach_channel = null
   where person_id = p_person_id;
  delete from speaker_stage_candidate where profile_id = any (v_profile);
  -- LEAD-039 Schnitt 2: der Verlauf über die Person geht mit. Einträge, die sie
  -- selbst über andere geschrieben hat, bleiben; sie zeigen dann den
  -- anonymisierten Namen.
  delete from speaker_activity where profile_id = any (v_profile);
  -- Titel und Beschreibung sind der veröffentlichte Programmpunkt und gehören
  -- zur Veranstaltung, nicht zur Person; die interne Notiz nicht.
  update session_submission  set notes = null      where speaker_profile_id = any (v_profile);
  update hospitality_booking set details = '{}'::jsonb, team_note = null where profile_id = any (v_profile);

  -- 8 · Reisekosten. Der Antrag bleibt als Buchung (§147 AO), die Bankdaten
  --     nicht: bezahlt ist bezahlt, und ein offener Antrag ist eine Hürde, die
  --     bis hierher gar nicht kommt.
  delete from vault.secrets
   where id in (select ec.bank_secret_id from expense_claim ec
                 where ec.profile_id = any (v_profile) and ec.bank_secret_id is not null);
  update expense_claim set bank_secret_id = null, bank_masked = null, bank_holder = null,
                           review_note = null
   where profile_id = any (v_profile);

  -- 9 · Der selbst geschriebene Grund ist Freitext von dieser Person und darf
  --     ihre Löschung nicht überleben. Status, Hürden und Zeitpunkt bleiben —
  --     das ist der Nachweis, und der trägt keinen Personenbezug.
  update profile_deletion_request set reason = null where person_id = p_person_id;

  -- 10 · ADM-036: Zusammenführungen, in denen diese Person die bleibende war,
  --      tragen im Protokoll die Daten der zweiten Person (für den Rückweg).
  --      Mit der Löschung gibt es keinen Rückweg mehr; die Zeile bleibt als
  --      Nachweis, dass zusammengeführt wurde.
  update person_merge_log set payload = null where surviving_person_id = p_person_id;
end $$;

-- === 12 · Bestätigen: die Adresse der Begleitung wandert nicht ins Mail-Protokoll (aus dem Snapshot) =============================
-- Die Mail geht an den Empfänger der Speaker-Mails, bei einem verwalteten Speaker an eine dritte Person. Der Satz mit der Adresse
-- ist aus der Vorlage (Abschnitt 10); hier fällt die Variable, die sonst unbenutzt im Protokoll stünde. Eine Zeile weniger, sonst unverändert.
create or replace function confirm_companion_ticket(p_ticket_id uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_t ticket%rowtype; v_sp speaker_profile%rowtype;
begin
  select * into v_t from ticket where id = p_ticket_id and source = 'speaker_companion' for update;
  if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_t.speaker_profile_id;
  if not is_speaker_team(v_sp.edition_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_t.status <> 'requested' then raise exception 'not_pending' using errcode = 'P0001', detail = v_t.status; end if;
  update ticket set status = 'approved', approved_by = current_person_id(), approved_at = now(), team_note = nullif(btrim(p_note), '')
   where id = p_ticket_id;
  -- PART-091: an den Empfänger der Speaker-Mails — bei einem verwalteten Speaker eine dritte Person. ADM-076: **ohne** die Adresse der
  -- Begleitung; `mail_log.meta.vars` speichert die Variablen im Klartext, und die Vorlage nennt die Adresse nicht mehr.
  perform queue_speaker_mail('companion_ticket_confirmed', v_sp.id,
                     jsonb_build_object('companion_name', btrim(coalesce(v_t.holder_first_name, '') || ' ' || coalesce(v_t.holder_last_name, '')),
                                        'note', coalesce(nullif(btrim(p_note), ''), '')),
                     'ticket', p_ticket_id);
  perform log_audit('ticket.companion_approved', 'ticket', p_ticket_id::text, jsonb_build_object('status', v_t.status),
                    jsonb_build_object('status', 'approved', 'note', p_note));
end $$;

select harden_definer_functions();
