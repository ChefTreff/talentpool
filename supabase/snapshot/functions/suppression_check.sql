create or replace function suppression_check(p_email text)
 RETURNS TABLE(suppressed boolean, reason text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_mail text := lower(nullif(btrim(coalesce(p_email, '')), ''));
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('suppression') then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_mail is null or v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = '22023', detail = coalesce(v_mail, 'null');
  end if;
  return query
    select true, s.reason, s.created_at from suppression s where s.email_hash = email_hash(v_mail)
    union all
    select false, null::text, null::timestamptz
     where not exists (select 1 from suppression s where s.email_hash = email_hash(v_mail));
end $$;
