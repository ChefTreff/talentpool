-- =============================================================================
-- 0020 · v2 Bewerbungs-Mails (Welle 1 A5): Warteschlange in mail_log, Trigger,
--        Housekeeping (Fristen ablaufen lassen, Warteliste nachrücken)
-- Prinzip: Die Datenbank entscheidet, WELCHE Mail fällig ist (Freigabe-Gate,
-- Statuswechsel), und legt sie als Auftrag in mail_log ab (status 'queued',
-- meta.vars). Versand: Route Handler /api/cron/mail (Vercel Cron alle 10 Minuten,
-- lib/mail/queue.ts) — vorher run_application_housekeeping().
-- E-Mail-Minimierung (Entscheidungslog 07.09.): sechs Vorlagen, eine Mail je
-- Ereignis, keine Erinnerungs-Kaskaden. Vorlagen sind in mail_template pflegbar.
-- =============================================================================
set search_path = public, extensions;

-- === Vorlagen DE/EN (nur anlegen, wenn der Schlüssel fehlt — Pflege im Admin) ==
insert into mail_template (key, locale, version, subject, body_md, description, active)
select v.key, v.locale, v.version, v.subject, v.body_md, v.description, v.active
from (values
  ('application_received', 'de', 1, 'Deine Bewerbung für „{{session_title}}" ist da',
   E'Hallo {{first_name}},\n\ndeine Bewerbung für **{{session_title}}** ({{session_time}}, {{stage_name}}) ist eingegangen.\n\nWir melden uns, sobald das Team entschieden hat. Den Stand siehst du jederzeit im Portal: [Programm]({{programme_url}})\n\nViele Grüße\nChefTreff',
   'Eingangsbestätigung Bewerbung', true),
  ('application_received', 'en', 1, 'We received your application for "{{session_title}}"',
   E'Hi {{first_name}},\n\nyour application for **{{session_title}}** ({{session_time}}, {{stage_name}}) has arrived.\n\nWe will get back to you once the team has decided. You can check the status any time in the portal: [Programme]({{programme_url}})\n\nBest,\nChefTreff',
   'Application received', true),
  ('application_accepted', 'de', 1, 'Zusage: {{session_title}} – bitte bis {{confirm_by}} bestätigen',
   E'Hallo {{first_name}},\n\ngute Nachricht: Du hast einen Platz bei **{{session_title}}** ({{session_time}}, {{stage_name}}).\n\nBitte bestätige deinen Platz bis **{{confirm_by}}** im Portal, sonst geht er an die Warteliste: [Platz bestätigen]({{programme_url}})\n\nViele Grüße\nChefTreff',
   'Zusage mit Bestätigungsfrist', true),
  ('application_accepted', 'en', 1, 'You are in: {{session_title}} – please confirm by {{confirm_by}}',
   E'Hi {{first_name}},\n\ngood news: you have a spot at **{{session_title}}** ({{session_time}}, {{stage_name}}).\n\nPlease confirm your spot by **{{confirm_by}}** in the portal, otherwise it goes to the waiting list: [Confirm spot]({{programme_url}})\n\nBest,\nChefTreff',
   'Acceptance with confirmation deadline', true),
  ('application_waitlisted', 'de', 1, 'Warteliste: {{session_title}}',
   E'Hallo {{first_name}},\n\nfür **{{session_title}}** ({{session_time}}) stehst du auf der Warteliste. Wird ein Platz frei, bekommst du automatisch eine Nachricht mit Bestätigungsfrist.\n\nDein Stand im Portal: [Programm]({{programme_url}})\n\nViele Grüße\nChefTreff',
   'Warteliste', true),
  ('application_waitlisted', 'en', 1, 'Waiting list: {{session_title}}',
   E'Hi {{first_name}},\n\nyou are on the waiting list for **{{session_title}}** ({{session_time}}). If a spot opens up, you will automatically receive a message with a confirmation deadline.\n\nYour status in the portal: [Programme]({{programme_url}})\n\nBest,\nChefTreff',
   'Waiting list', true),
  ('application_declined', 'de', 1, 'Leider kein Platz: {{session_title}}',
   E'Hallo {{first_name}},\n\nfür **{{session_title}}** ({{session_time}}) konnten wir dir diesmal keinen Platz geben – die Nachfrage war größer als die Plätze.\n\nDas übrige Programm steht dir offen: [Programm]({{programme_url}})\n\nViele Grüße\nChefTreff',
   'Absage', true),
  ('application_declined', 'en', 1, 'No spot this time: {{session_title}}',
   E'Hi {{first_name}},\n\nunfortunately we could not offer you a spot at **{{session_title}}** ({{session_time}}) this time – demand exceeded the available places.\n\nThe rest of the programme is open to you: [Programme]({{programme_url}})\n\nBest,\nChefTreff',
   'Declined', true),
  ('application_promoted', 'de', 1, 'Platz frei geworden: {{session_title}} – bis {{confirm_by}} bestätigen',
   E'Hallo {{first_name}},\n\nbei **{{session_title}}** ({{session_time}}, {{stage_name}}) ist ein Platz frei geworden – und er gehört dir, wenn du ihn bis **{{confirm_by}}** bestätigst: [Platz bestätigen]({{programme_url}})\n\nViele Grüße\nChefTreff',
   'Nachrücken von der Warteliste', true),
  ('application_promoted', 'en', 1, 'A spot opened up: {{session_title}} – confirm by {{confirm_by}}',
   E'Hi {{first_name}},\n\na spot opened up at **{{session_title}}** ({{session_time}}, {{stage_name}}) – and it is yours if you confirm by **{{confirm_by}}**: [Confirm spot]({{programme_url}})\n\nBest,\nChefTreff',
   'Promoted from waiting list', true),
  ('registration_confirmed', 'de', 1, 'Angemeldet: {{session_title}}',
   E'Hallo {{first_name}},\n\ndu bist für **{{session_title}}** ({{session_time}}, {{stage_name}}) angemeldet.\n\nAbmelden kannst du dich jederzeit im Portal: [Programm]({{programme_url}})\n\nViele Grüße\nChefTreff',
   'Anmeldung bestätigt', true),
  ('registration_confirmed', 'en', 1, 'Registered: {{session_title}}',
   E'Hi {{first_name}},\n\nyou are registered for **{{session_title}}** ({{session_time}}, {{stage_name}}).\n\nYou can cancel any time in the portal: [Programme]({{programme_url}})\n\nBest,\nChefTreff',
   'Registration confirmed', true)
) as v(key, locale, version, subject, body_md, description, active)
where not exists (select 1 from mail_template t where t.key = v.key and t.locale = v.locale);

-- === Hilfsfunktionen ========================================================
-- Zeitstempel in Eventzeit, Sprache der Empfängerin.
create or replace function mail_fmt_ts(p_ts timestamptz, p_tz text, p_locale text) returns text
language sql stable set search_path = public, extensions as $$
  select case
    when p_ts is null then null
    when p_locale = 'en' then to_char(p_ts at time zone coalesce(p_tz, 'Europe/Berlin'), 'DD Mon YYYY, HH24:MI')
    else to_char(p_ts at time zone coalesce(p_tz, 'Europe/Berlin'), 'DD.MM.YYYY, HH24:MI') || ' Uhr'
  end
$$;

-- Variablen einer Session für Mail-Vorlagen (Titel, Zeit, Bühne, Event).
create or replace function session_mail_vars(p_session_id uuid, p_locale text) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'session_id', s.id,
    'session_title', coalesce(case when p_locale = 'en' then s.title_en else s.title_de end, s.title_de, s.title_en, ''),
    'session_time', coalesce(
      case when sl.id is null then null
           else mail_fmt_ts(sl.start_at, e.timezone, p_locale) || '–' || to_char(sl.end_at at time zone coalesce(e.timezone, 'Europe/Berlin'), 'HH24:MI') end,
      case when p_locale = 'en' then 'time to be announced' else 'Zeit folgt' end),
    'stage_name', coalesce(st.name, case when p_locale = 'en' then 'stage to be announced' else 'Bühne folgt' end),
    'event_name', coalesce(e.name, '')
  )
  from session s
  left join slot sl on sl.id = s.slot_id
  left join stage st on st.id = sl.stage_id
  left join event e on e.id = s.event_id
  where s.id = p_session_id
$$;

-- Mail-Auftrag anlegen. Empfängerin, Sprache und Suppression löst die Datenbank auf.
-- Rückgabe: mail_log.id oder NULL (gelöschte Person, keine Adresse, doppelter Auftrag).
create or replace function queue_mail(
  p_template_key text, p_person_id uuid, p_vars jsonb default '{}'::jsonb,
  p_related_type text default null, p_related_id uuid default null
) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_email text; v_locale text; v_first text; v_vars jsonb; v_id bigint;
begin
  select pe.email::text, case when p.preferred_language = 'en' then 'en' else 'de' end, coalesce(p.first_name, '')
    into v_email, v_locale, v_first
  from person p join person_email pe on pe.person_id = p.id and pe.is_primary
  where p.id = p_person_id and p.deleted_at is null;
  if v_email is null then return null; end if;
  -- Gleiche Vorlage zum gleichen Objekt, noch nicht versendet: kein zweiter Auftrag.
  if p_related_id is not null and exists (
       select 1 from mail_log where template_key = p_template_key and related_id = p_related_id and status = 'queued') then
    return null;
  end if;
  v_vars := coalesce(p_vars, '{}'::jsonb) || jsonb_build_object('first_name', v_first);
  if is_suppressed(v_email) then
    -- Gelöschte Adresse: nie wieder anschreiben, nur der Hash bleibt (Entscheidungslog 08.09.).
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
revoke execute on function queue_mail(text, uuid, jsonb, text, uuid) from public, anon, authenticated;

-- === Trigger: Bewerbung ======================================================
-- 'applied' → Eingangsbestätigung. Entscheidungen nur nach Freigabe (Gate):
-- accepted/promoted/waitlisted/declined → je eine Mail beim Statuswechsel.
create or replace function application_mail_trigger() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare v_key text; v_locale text; v_tz text; v_vars jsonb;
begin
  if tg_op = 'UPDATE' and new.status = old.status then return null; end if;
  if new.status = 'applied' then
    v_key := 'application_received';
  elsif decisions_released(new.session_id) then
    v_key := case new.status
      when 'accepted'   then 'application_accepted'
      when 'promoted'   then 'application_promoted'
      when 'waitlisted' then 'application_waitlisted'
      when 'declined'   then 'application_declined'
      else null end;
  end if;
  if v_key is null then return null; end if;
  select case when p.preferred_language = 'en' then 'en' else 'de' end into v_locale from person p where p.id = new.person_id;
  select e.timezone into v_tz from session s join event e on e.id = s.event_id where s.id = new.session_id;
  v_vars := session_mail_vars(new.session_id, coalesce(v_locale, 'de'))
            || jsonb_build_object('confirm_by', mail_fmt_ts(new.confirm_by, v_tz, coalesce(v_locale, 'de')), 'application_id', new.id);
  perform queue_mail(v_key, new.person_id, v_vars, 'application', new.id);
  return null;
end $$;
drop trigger if exists trg_application_mail on application;
create trigger trg_application_mail after insert or update of status on application
  for each row execute function application_mail_trigger();

-- === Trigger: Freigabe =======================================================
-- Beim Öffnen des Gates bekommt jede entschiedene Bewerbung ihre Mail — genau eine.
create or replace function decision_release_mail_trigger() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare r record; v_tz text; v_vars jsonb; v_key text;
begin
  select e.timezone into v_tz from session s join event e on e.id = s.event_id where s.id = new.session_id;
  for r in
    select a.id, a.person_id, a.status, a.confirm_by,
           case when p.preferred_language = 'en' then 'en' else 'de' end as locale
    from application a join person p on p.id = a.person_id
    where a.session_id = new.session_id and a.status in ('accepted', 'promoted', 'waitlisted', 'declined')
  loop
    v_key := case r.status
      when 'accepted' then 'application_accepted'
      when 'promoted' then 'application_promoted'
      when 'waitlisted' then 'application_waitlisted'
      else 'application_declined' end;
    v_vars := session_mail_vars(new.session_id, r.locale)
              || jsonb_build_object('confirm_by', mail_fmt_ts(r.confirm_by, v_tz, r.locale), 'application_id', r.id);
    perform queue_mail(v_key, r.person_id, v_vars, 'application', r.id);
  end loop;
  return null;
end $$;
drop trigger if exists trg_decision_release_mail on decision_release;
create trigger trg_decision_release_mail after insert on decision_release
  for each row execute function decision_release_mail_trigger();

-- release_decisions: Fristen VOR dem Freigabe-Eintrag setzen, damit die Mails sie kennen.
create or replace function release_decisions(p_session_id uuid, p_note text default null) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare v_hours integer; v_n integer;
begin
  if not (has_role('admin') or has_role('programme_team') or has_role('area_lead_talent')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select confirm_by_hours into v_hours from session where id = p_session_id;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  update application
     set confirm_by = now() + make_interval(hours => v_hours)
   where session_id = p_session_id and status in ('accepted', 'promoted') and confirm_by is null;
  get diagnostics v_n = row_count;
  insert into decision_release (session_id, released_by, note)
    values (p_session_id, current_person_id(), p_note)
  on conflict (session_id) do nothing;
  perform log_audit('application.release', 'session', p_session_id::text, null, jsonb_build_object('accepted', v_n));
  return v_n;
end $$;

-- === Trigger: Anmeldung ======================================================
create or replace function registration_mail_trigger() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare v_locale text; v_vars jsonb;
begin
  if new.session_id is null or new.status <> 'confirmed' then return null; end if;
  if tg_op = 'UPDATE' and old.status = 'confirmed' then return null; end if;
  select case when p.preferred_language = 'en' then 'en' else 'de' end into v_locale from person p where p.id = new.person_id;
  v_vars := session_mail_vars(new.session_id, coalesce(v_locale, 'de')) || jsonb_build_object('registration_id', new.id);
  perform queue_mail('registration_confirmed', new.person_id, v_vars, 'registration', new.id);
  return null;
end $$;
drop trigger if exists trg_registration_mail on registration;
create trigger trg_registration_mail after insert or update of status on registration
  for each row execute function registration_mail_trigger();

-- === Housekeeping (Cron) =====================================================
-- Abgelaufene Zusagen verfallen; frei gewordene Plätze freigegebener Sessions gehen
-- an die Warteliste (promote_waitlist setzt Frist, der Trigger legt die Mail an).
create or replace function run_application_housekeeping() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_expired integer; v_promoted integer := 0; v_free integer; v_n integer; r record;
begin
  if not (auth.uid() is null or has_role('admin') or has_role('programme_team')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_expired := expire_overdue_applications();
  for r in
    select s.id, s.capacity
    from session s
    where s.access_mode = 'application' and s.capacity is not null
      and exists (select 1 from decision_release d where d.session_id = s.id)
      and exists (select 1 from application a where a.session_id = s.id and a.status = 'waitlisted')
  loop
    select r.capacity - count(*) into v_free
      from application a where a.session_id = r.id and a.status in ('accepted', 'promoted', 'confirmed');
    if v_free > 0 then
      v_n := promote_waitlist(r.id, v_free);
      v_promoted := v_promoted + coalesce(v_n, 0);
    end if;
  end loop;
  if v_expired > 0 or v_promoted > 0 then
    insert into audit_log (action, object_type, object_id, after)
    values ('application.housekeeping', 'system', 'cron', jsonb_build_object('expired', v_expired, 'promoted', v_promoted));
  end if;
  return jsonb_build_object('expired', v_expired, 'promoted', v_promoted);
end $$;
revoke execute on function run_application_housekeeping() from public, anon, authenticated;

select harden_definer_functions();
