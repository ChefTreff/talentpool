create or replace function award_purge_contacts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_n integer := 0; v_ed record; v_m integer;
begin
  -- Ohne Sitzung (Cron mit Service-Rolle) oder mit dem Abschnitt `initiatives`.
  if auth.uid() is not null and not has_admin_section('initiatives') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  for v_ed in
    select e.id from event e
     where e.end_date is not null and e.end_date + interval '14 months' < current_date
       and exists (select 1 from award_application a where a.edition_id = e.id and a.contact_purged_at is null)
  loop
    update award_application
       set contact_first_name = null, contact_last_name = null, contact_email = null, contact_purged_at = now()
     where edition_id = v_ed.id and contact_purged_at is null;
    get diagnostics v_m = row_count;
    v_n := v_n + v_m;
    perform log_audit('award.contacts_purged', 'event', v_ed.id::text, null,
                      jsonb_build_object('applications', v_m, 'rule', '14 months after end_date'));
  end loop;
  return v_n;
end $$;
