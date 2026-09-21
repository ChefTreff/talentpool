create or replace function decision_release_mail_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
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
