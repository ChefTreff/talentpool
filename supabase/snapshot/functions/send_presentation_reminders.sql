create or replace function send_presentation_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare r record; v_n integer := 0;
begin
  if not (auth.uid() is null or has_role('admin') or has_role('programme_team')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- PART-091: je Empfänger und Session eine Mail. Verwaltet ein Kontakt
  -- mehrere Speaker derselben Session (ein Panel des Partners), nennt die eine
  -- Mail sie alle — `queue_mail` ließe eine zweite sonst als Doppel fallen.
  for r in
    select x.recipient, x.session_id, x.timezone, x.effective_due, x.start_at,
           coalesce(case when rp.preferred_language in ('de', 'en') then rp.preferred_language end, 'en') as locale,
           string_agg(distinct x.fuer, ', ' order by x.fuer) as fuer
    from (
    select speaker_mail_recipient(sp.id) as recipient, se.id as session_id, e.timezone,
           least(d.due_at, sl.start_at - interval '48 hours') as effective_due, sl.start_at,
           case when speaker_mail_recipient(sp.id) is distinct from ss.person_id
                then nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') end as fuer
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
      -- SPK-070: Gäste laden keine Präsentation im Portal hoch, sie haben keins.
      and not sp.stage_guest
      and now() >= least(d.due_at, sl.start_at - interval '48 hours') - make_interval(hours => coalesce(d.reminder_lead_hours, 48))
      and not exists (select 1 from speaker_asset a
                      where a.profile_id = sp.id and a.kind = 'presentation' and a.is_current
                        and (a.session_id = se.id or a.session_id is null))
      and not exists (select 1 from mail_log m
                      where m.template_key = 'presentation_reminder' and m.person_id = speaker_mail_recipient(sp.id)
                        and m.related_type = 'session' and m.related_id = se.id)
    ) x
    join person rp on rp.id = x.recipient
    group by x.recipient, x.session_id, x.timezone, x.effective_due, x.start_at, rp.preferred_language
    order by x.start_at
  loop
    perform queue_mail('presentation_reminder', r.recipient,
                       session_mail_vars(r.session_id, r.locale) || jsonb_build_object('due_label', mail_fmt_ts(r.effective_due, r.timezone, r.locale))
                         || case when r.fuer is not null then jsonb_build_object('on_behalf_of', r.fuer) else '{}'::jsonb end,
                       'session', r.session_id);
    v_n := v_n + 1;
  end loop;
  if v_n > 0 then
    insert into audit_log (action, object_type, object_id, after)
    values ('presentation.reminder', 'system', 'cron', jsonb_build_object('sent', v_n));
  end if;
  return v_n;
end $$;
