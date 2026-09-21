create or replace function run_application_housekeeping()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_expired integer; v_promoted integer := 0; v_reminders integer; v_free integer; v_n integer;
        r record; v_partner jsonb; v_volunteers jsonb; v_diet integer; v_questions integer;
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
  v_volunteers := run_volunteer_housekeeping();
  v_diet := purge_diet_data();
  v_questions := purge_kb_questions();
  if v_expired > 0 or v_promoted > 0 then
    insert into audit_log (action, object_type, object_id, after)
    values ('application.housekeeping', 'system', 'cron', jsonb_build_object('expired', v_expired, 'promoted', v_promoted));
  end if;
  return jsonb_build_object('expired', v_expired, 'promoted', v_promoted, 'reminders', v_reminders,
                            'partner', v_partner, 'volunteers', v_volunteers, 'diet_purged', v_diet,
                            'questions_purged', v_questions);
end $$;
