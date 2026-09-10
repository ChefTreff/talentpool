-- 0035 · v2 Präsentations-Erinnerung (Welle 2 A8) + my_manager_scope() (A9)
-- Erinnerung bedarfsgesteuert (Feedback T9/P4): nur für Speaker mit Slot und ohne aktuelle Präsentation, genau einmal je Speaker × Session,
-- `reminder_lead_hours` (Default 48) vor der wirksamen Fälligkeit (Deadline ∧ 48 h vor Slot), ausgelöst im Housekeeping des Mail-Crons.
set search_path = public, extensions;

-- 1) Vorlaufzeit je Deadline
alter table deadline add column if not exists reminder_lead_hours integer not null default 48 check (reminder_lead_hours between 0 and 720);
comment on column deadline.reminder_lead_hours is 'Erinnerung so viele Stunden vor der wirksamen Fälligkeit (Deadline ∧ 48 h vor Slot); 0 = zur Fälligkeit.';

create or replace function upsert_deadline(p_data jsonb) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into deadline (edition_id, key, audience, due_at, label_de, label_en, description_de, description_en, reminder_lead_hours)
  values ((p_data->>'edition_id')::uuid, p_data->>'key', coalesce(nullif(p_data->>'audience', ''), 'all'), (p_data->>'due_at')::timestamptz,
          p_data->>'label_de', p_data->>'label_en', nullif(p_data->>'description_de', ''), nullif(p_data->>'description_en', ''),
          coalesce(nullif(p_data->>'reminder_lead_hours', '')::integer, 48))
  on conflict (edition_id, key) do update set
    audience = excluded.audience, due_at = excluded.due_at, label_de = excluded.label_de, label_en = excluded.label_en,
    description_de = excluded.description_de, description_en = excluded.description_en,
    reminder_lead_hours = case when p_data ? 'reminder_lead_hours' then excluded.reminder_lead_hours else deadline.reminder_lead_hours end
  returning id into v_id;
  perform log_audit('deadline.upsert', 'deadline', v_id::text, null, p_data);
  return v_id;
end $$;

-- 2) Vorlage
insert into mail_template (key, locale, version, subject, body_md, description, active)
select v.key, v.locale, v.version, v.subject, v.body_md, v.description, v.active from (values
  ('presentation_reminder', 'en', 1, 'Reminder: presentation for “{{session_title}}” due {{due_label}}',
   E'Hi {{first_name}},\n\nyour presentation for **{{session_title}}** ({{session_time}}, {{stage_name}}) is not uploaded yet. Please upload it by **{{due_label}}** so the stage team can check it in time.\n\nUpload here: [Your session]({{portal_url}}/speaker/session)\n\nLater uploads are still accepted, but the team is told they are late.\n\nBest,\nChefTreff',
   'Erinnerung Präsentation (einmal je Speaker × Session, Housekeeping)', true),
  ('presentation_reminder', 'de', 1, 'Erinnerung: Präsentation für „{{session_title}}“ bis {{due_label}}',
   E'Hallo {{first_name}},\n\ndeine Präsentation für **{{session_title}}** ({{session_time}}, {{stage_name}}) ist noch nicht hochgeladen. Bitte lade sie bis **{{due_label}}** hoch, damit das Bühnenteam sie rechtzeitig prüfen kann.\n\nHier hochladen: [Deine Session]({{portal_url}}/speaker/session)\n\nSpätere Uploads nehmen wir weiter an, das Team sieht sie aber als verspätet.\n\nViele Grüße\nChefTreff',
   'Erinnerung Präsentation (einmal je Speaker × Session, Housekeeping)', true)
) as v(key, locale, version, subject, body_md, description, active)
where not exists (select 1 from mail_template t where t.key = v.key and t.locale = v.locale);

-- 3) Erinnerungen verschicken (Housekeeping; service_role oder Admin/Programm-Team)
create or replace function send_presentation_reminders() returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare r record; v_n integer := 0;
begin
  if not (auth.uid() is null or has_role('admin') or has_role('programme_team')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  for r in
    select ss.person_id, se.id as session_id, e.timezone,
           least(d.due_at, sl.start_at - interval '48 hours') as effective_due,
           coalesce(p.preferred_language, 'en') as locale
    from session se
    join slot sl on sl.id = se.slot_id
    join event e on e.id = se.event_id
    join session_speaker ss on ss.session_id = se.id
    join person p on p.id = ss.person_id
    join speaker_profile sp on sp.person_id = ss.person_id and sp.edition_id = coalesce(e.edition_id, e.id)
    left join deadline d on d.key = 'presentation_upload' and d.edition_id = coalesce(e.edition_id, e.id)
    where se.publish_status <> 'cancelled'
      and sl.start_at > now()
      and speaker_is_confirmed(sp.pipeline_status)
      and now() >= least(d.due_at, sl.start_at - interval '48 hours') - make_interval(hours => coalesce(d.reminder_lead_hours, 48))
      and not exists (select 1 from speaker_asset a
                      where a.profile_id = sp.id and a.kind = 'presentation' and a.is_current
                        and (a.session_id = se.id or a.session_id is null))
      and not exists (select 1 from mail_log m
                      where m.template_key = 'presentation_reminder' and m.person_id = ss.person_id
                        and m.related_type = 'session' and m.related_id = se.id)
    order by sl.start_at
  loop
    perform queue_mail('presentation_reminder', r.person_id,
                       session_mail_vars(r.session_id, r.locale) || jsonb_build_object('due_label', mail_fmt_ts(r.effective_due, r.timezone, r.locale)),
                       'session', r.session_id);
    v_n := v_n + 1;
  end loop;
  if v_n > 0 then
    insert into audit_log (action, object_type, object_id, after)
    values ('presentation.reminder', 'system', 'cron', jsonb_build_object('sent', v_n));
  end if;
  return v_n;
end $$;
revoke execute on function send_presentation_reminders() from public, anon, authenticated;

-- 4) Housekeeping des Mail-Crons: Erinnerungen mitnehmen
create or replace function run_application_housekeeping() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_expired integer; v_promoted integer := 0; v_reminders integer := 0; v_free integer; v_n integer; r record;
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
  v_reminders := send_presentation_reminders();
  if v_expired > 0 or v_promoted > 0 then
    insert into audit_log (action, object_type, object_id, after)
    values ('application.housekeeping', 'system', 'cron', jsonb_build_object('expired', v_expired, 'promoted', v_promoted));
  end if;
  return jsonb_build_object('expired', v_expired, 'promoted', v_promoted, 'reminders', v_reminders);
end $$;
revoke execute on function run_application_housekeeping() from public, anon, authenticated;

-- 5) A9 · Scope des Aufrufers für das Lead-Portal (Filter, Board-Vorauswahl)
create or replace function my_manager_scope() returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_team boolean; v_global boolean; v_any boolean;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_team   := is_speaker_team(null);
  v_global := exists (select 1 from role_assignment ra where ra.person_id = v_me and ra.role = 'speaker_manager' and ra.scope_type = 'global'
                      and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now()));
  v_any    := exists (select 1 from role_assignment ra where ra.person_id = v_me and ra.role = 'speaker_manager'
                      and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now()));
  return jsonb_build_object(
    'team', v_team,
    'all', v_team or v_global,
    'is_manager', v_team or v_any,
    'editions', coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from (
        select distinct e.id, e.name, e.slug from role_assignment ra join event e on e.id = ra.edition_id
        where ra.person_id = v_me and ra.role = 'speaker_manager' and ra.scope_type = 'edition'
          and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())) x), '[]'::jsonb),
    'stages', coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from (
        select distinct st.id, st.name, st.event_id, coalesce(e.edition_id, e.id) as edition_id
        from role_assignment ra join stage st on st.id = ra.scope_id join event e on e.id = st.event_id
        where ra.person_id = v_me and ra.role = 'speaker_manager' and ra.scope_type = 'stage'
          and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())) x), '[]'::jsonb),
    'stage_days', coalesce((select jsonb_agg(to_jsonb(x) order by x.day_date, x.stage_name) from (
        select distinct sd.id, sd.stage_id, st.name as stage_name, sd.event_day_id, ed.day_date, coalesce(e.edition_id, e.id) as edition_id
        from role_assignment ra join stage_day sd on sd.id = ra.scope_id join stage st on st.id = sd.stage_id
        join event_day ed on ed.id = sd.event_day_id join event e on e.id = st.event_id
        where ra.person_id = v_me and ra.role = 'speaker_manager' and ra.scope_type = 'stage_day'
          and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())) x), '[]'::jsonb),
    'slots', coalesce((select jsonb_agg(to_jsonb(x) order by x.start_at) from (
        select distinct sl.id, sl.stage_id, st.name as stage_name, sl.start_at, sl.end_at, se.id as session_id, coalesce(e.edition_id, e.id) as edition_id
        from role_assignment ra join slot sl on sl.id = ra.scope_id join stage st on st.id = sl.stage_id join event e on e.id = st.event_id
        left join session se on se.slot_id = sl.id
        where ra.person_id = v_me and ra.role = 'speaker_manager' and ra.scope_type = 'slot'
          and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())) x), '[]'::jsonb),
    'owned_profiles', (select count(*) from speaker_profile sp where sp.owner_person_id = v_me or sp.created_by = v_me)
  );
end $$;

select harden_definer_functions();
