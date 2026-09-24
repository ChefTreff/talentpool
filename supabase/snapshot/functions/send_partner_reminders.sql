create or replace function send_partner_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare r record; m record; v_n integer := 0; v_items_de text; v_items_en text; v_count integer; v_org_name text;
        v_mail bigint; v_primary uuid; v_cc_offen boolean;
begin
  for r in
    select oe.id as oe_id, oe.org_id, coalesce(e.timezone, 'Europe/Berlin') as tz
    from org_edition oe join event e on e.id = oe.edition_id
    where exists (select 1 from partner_digest_items(oe.id))
      and not exists (select 1 from mail_log ml
                      where ml.template_key = 'partner_reminder_digest' and ml.related_type = 'org_edition' and ml.related_id = oe.id
                        and ml.status <> 'failed' and ml.queued_at > now() - interval '7 days')
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
    -- Der Digest geht an alle operativen Kontakte; die Kopie haengt an genau einem davon (PART-063).
    select om.person_id into v_primary from org_membership om join person p on p.id = om.person_id and p.deleted_at is null
     where om.org_id = r.org_id and om.roles @> '{primary_ops}';
    v_cc_offen := true;
    for m in
      select distinct om.person_id, coalesce(p.preferred_language, 'de') as locale
      from org_membership om join person p on p.id = om.person_id
      where om.org_id = r.org_id and om.roles && '{primary_ops,additional}'::text[] and p.deleted_at is null
    loop
      v_mail := queue_mail('partner_reminder_digest', m.person_id,
                         jsonb_build_object('org_name', v_org_name, 'count', v_count, 'items', case when m.locale = 'en' then v_items_en else v_items_de end),
                         'org_edition', r.oe_id);
      if v_cc_offen and v_mail is not null and (v_primary is null or m.person_id = v_primary) then
        perform partner_mail_cc(v_mail, r.org_id);
        v_cc_offen := false;
      end if;
    end loop;
    v_n := v_n + 1;
  end loop;
  if v_n > 0 then
    insert into audit_log (action, object_type, object_id, after) values ('partner.reminder_digest', 'system', 'cron', jsonb_build_object('digests', v_n));
  end if;
  return v_n;
end $$;
