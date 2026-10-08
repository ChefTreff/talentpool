create or replace function application_mail_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_key text; v_locale text; v_tz text; v_vars jsonb;
begin
  if tg_op = 'UPDATE' then
    if new.status = old.status then return null; end if;
    -- PART-124: die Zusage wurde zurückgenommen oder bestätigt, bevor ihre Mail rausging → die wartende Mail entfällt.
    if old.status = 'accepted' then
      perform cancel_queued_mail('application_accepted', new.id, new.person_id,
                                 case new.status when 'confirmed' then 'accept_confirmed' else 'accept_revoked' end);
    end if;
  end if;
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
  if v_key = 'application_accepted' then
    -- PART-124: zehn Minuten Frist, in der sich die Zusage zurücknehmen lässt (siehe oben); alle anderen Mails gehen wie bisher.
    perform queue_mail_debounced(v_key, new.person_id, v_vars, 'application', new.id, interval '10 minutes');
  else
    perform queue_mail(v_key, new.person_id, v_vars, 'application', new.id);
  end if;
  return null;
end $$;
