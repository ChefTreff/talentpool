create or replace function registration_mail_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_locale text; v_vars jsonb;
begin
  if new.session_id is null or new.status <> 'confirmed' then return null; end if;
  if tg_op = 'UPDATE' and old.status = 'confirmed' then return null; end if;
  select case when p.preferred_language = 'en' then 'en' else 'de' end into v_locale from person p where p.id = new.person_id;
  v_vars := session_mail_vars(new.session_id, coalesce(v_locale, 'de')) || jsonb_build_object('registration_id', new.id);
  perform queue_mail('registration_confirmed', new.person_id, v_vars, 'registration', new.id);
  return null;
end $$;
