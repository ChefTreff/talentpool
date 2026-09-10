-- 0045 · Welle 3 A5: Partner-Housekeeping im Cron /api/cron/mail — Fälligkeiten aus den Fristen nachziehen (Team ändert eine Frist ⇒ Checklisten folgen),
-- `overdue` setzen und wieder aufheben, ein Erinnerungs-Digest je Org × Edition (`partner_reminder_digest`) an primary_ops + additional mit allen Pflichten,
-- die innerhalb `reminder_lead_hours` der Frist fällig, überfällig oder zurückgewiesen sind; höchstens eine Digest-Mail je Org alle 7 Tage (T9/P4: keine Einzel-Reminder).
set search_path = public, extensions;

create or replace function refresh_deliverable_due() returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare v_n integer;
begin
  update deliverable d set due_at = deliverable_due(t, oe)
  from deliverable_template t, org_edition oe
  where t.id = d.template_id and oe.id = d.org_edition_id
    and d.status in ('open', 'overdue', 'rejected')
    and deliverable_due(t, oe) is distinct from d.due_at;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function refresh_deliverable_due() from public, anon, authenticated;

create or replace function mark_overdue_deliverables() returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare v_n integer;
begin
  update deliverable set status = 'open' where status = 'overdue' and (due_at is null or due_at >= now());
  update deliverable set status = 'overdue' where status = 'open' and due_at is not null and due_at < now();
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function mark_overdue_deliverables() from public, anon, authenticated;

-- Pflichten, die in den Digest gehören: überfällig, zurückgewiesen oder innerhalb des Vorlaufs der zugehörigen Frist (Default 7 Tage)
create or replace function partner_digest_items(p_org_edition_id uuid)
returns table (deliverable_id uuid, label_de text, label_en text, status text, due_at timestamptz, sort integer)
language sql stable security definer set search_path = public, extensions as $$
  select d.id, t.label_de, t.label_en, d.status, d.due_at, t.sort
  from deliverable d
  join deliverable_template t on t.id = d.template_id
  join org_edition oe on oe.id = d.org_edition_id
  left join deadline dl on dl.edition_id = oe.edition_id and dl.key = t.due_rule->>'deadline_key'
  where d.org_edition_id = p_org_edition_id
    and (d.status in ('overdue', 'rejected')
         or (d.status = 'open' and d.due_at is not null and d.due_at <= now() + make_interval(hours => coalesce(dl.reminder_lead_hours, 168))))
  order by d.due_at nulls last, t.sort
$$;
revoke execute on function partner_digest_items(uuid) from public, anon, authenticated;

create or replace function send_partner_reminders() returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare r record; m record; v_n integer := 0; v_items_de text; v_items_en text; v_count integer; v_org_name text;
begin
  for r in
    select oe.id as oe_id, oe.org_id, coalesce(e.timezone, 'Europe/Berlin') as tz
    from org_edition oe join event e on e.id = oe.edition_id
    where exists (select 1 from partner_digest_items(oe.id))
      and not exists (select 1 from mail_log ml
                      where ml.template_key = 'partner_reminder_digest' and ml.related_type = 'org_edition' and ml.related_id = oe.id
                        and ml.status <> 'failed' and coalesce(ml.queued_at, ml.created_at) > now() - interval '7 days')
  loop
    select count(*),
           string_agg(format('- %s — %s', i.label_de,
                             case when i.status = 'rejected' then 'zurückgewiesen, bitte erneut einreichen'
                                  when i.due_at is null then 'offen'
                                  when i.due_at < now() then 'überfällig seit ' || mail_fmt_ts(i.due_at, r.tz, 'de')
                                  else 'fällig ' || mail_fmt_ts(i.due_at, r.tz, 'de') end), E'\n' order by i.due_at nulls last, i.sort),
           string_agg(format('- %s — %s', i.label_en,
                             case when i.status = 'rejected' then 'sent back, please resubmit'
                                  when i.due_at is null then 'open'
                                  when i.due_at < now() then 'overdue since ' || mail_fmt_ts(i.due_at, r.tz, 'en')
                                  else 'due ' || mail_fmt_ts(i.due_at, r.tz, 'en') end), E'\n' order by i.due_at nulls last, i.sort)
      into v_count, v_items_de, v_items_en
    from partner_digest_items(r.oe_id) i;
    select coalesce(o.communication_name, o.legal_name) into v_org_name from organization o where o.id = r.org_id;
    for m in
      select distinct om.person_id, coalesce(p.preferred_language, 'de') as locale
      from org_membership om join person p on p.id = om.person_id
      where om.org_id = r.org_id and om.roles && '{primary_ops,additional}'::text[] and p.deleted_at is null
    loop
      perform queue_mail('partner_reminder_digest', m.person_id,
                         jsonb_build_object('org_name', v_org_name, 'count', v_count, 'items', case when m.locale = 'en' then v_items_en else v_items_de end),
                         'org_edition', r.oe_id);
    end loop;
    v_n := v_n + 1;
  end loop;
  if v_n > 0 then
    insert into audit_log (action, object_type, object_id, after) values ('partner.reminder_digest', 'system', 'cron', jsonb_build_object('digests', v_n));
  end if;
  return v_n;
end $$;
revoke execute on function send_partner_reminders() from public, anon, authenticated;

create or replace function run_partner_housekeeping() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_refreshed integer; v_overdue integer; v_digests integer;
begin
  v_refreshed := refresh_deliverable_due();
  v_overdue := mark_overdue_deliverables();
  v_digests := send_partner_reminders();
  return jsonb_build_object('refreshed', v_refreshed, 'overdue', v_overdue, 'digests', v_digests);
end $$;
revoke execute on function run_partner_housekeeping() from public, anon, authenticated;

-- Einhängen in das Housekeeping des Mail-Crons (Rückgabe erweitert um `partner`)
create or replace function run_application_housekeeping() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_expired integer; v_promoted integer := 0; v_reminders integer := 0; v_free integer; v_n integer; r record; v_partner jsonb;
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
  v_partner := run_partner_housekeeping();
  if v_expired > 0 or v_promoted > 0 then
    insert into audit_log (action, object_type, object_id, after)
    values ('application.housekeeping', 'system', 'cron', jsonb_build_object('expired', v_expired, 'promoted', v_promoted));
  end if;
  return jsonb_build_object('expired', v_expired, 'promoted', v_promoted, 'reminders', v_reminders, 'partner', v_partner);
end $$;

insert into mail_template (key, locale, version, subject, body_md, description, active)
select v.key, v.locale, v.version, v.subject, v.body_md, v.description, v.active from (values
  ('partner_reminder_digest', 'de', 1, 'Eure Checkliste: {{count}} offene Punkte – {{org_name}}',
   E'Hallo {{first_name}},\n\nfür **{{org_name}}** stehen in der Checkliste an:\n\n{{items}}\n\nAlles Weitere im Portal: [Checkliste]({{portal_url}}/partner/checkliste)\n\nDiese Erinnerung kommt höchstens einmal pro Woche und nur, solange etwas offen ist.\n\nViele Grüße\nChefTreff',
   'Wöchentlicher Digest offener/überfälliger/zurückgewiesener Pflichten an primary_ops + additional (A5)', true),
  ('partner_reminder_digest', 'en', 1, 'Your checklist: {{count}} open items – {{org_name}}',
   E'Hi {{first_name}},\n\nthese items are pending on the checklist for **{{org_name}}**:\n\n{{items}}\n\nEverything else in the portal: [Checklist]({{portal_url}}/partner/checkliste)\n\nThis reminder comes at most once a week and only while something is open.\n\nBest,\nChefTreff',
   'Weekly digest of open/overdue/rejected deliverables to primary_ops + additional (A5)', true)
) as v(key, locale, version, subject, body_md, description, active)
where not exists (select 1 from mail_template t where t.key = v.key and t.locale = v.locale);

select harden_definer_functions();
