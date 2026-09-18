create or replace function notify_speaker_leads(p_template_key text, p_vars jsonb, p_related_type text, p_related_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare r record; v_n integer := 0;
begin
  for r in
    select distinct ra.person_id from role_assignment ra
    where ra.role = 'area_lead_speaker' and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())
  loop
    perform queue_mail(p_template_key, r.person_id, p_vars, p_related_type, p_related_id); v_n := v_n + 1;
  end loop;
  if v_n = 0 then
    for r in
      select distinct ra.person_id from role_assignment ra
      where ra.role = 'admin' and ra.scope_type = 'global' and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())
    loop
      perform queue_mail(p_template_key, r.person_id, p_vars, p_related_type, p_related_id); v_n := v_n + 1;
    end loop;
  end if;
  return v_n;
end $$;
