create or replace function testdaten_person(p_first_name text, p_last_name text, p_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_pid uuid; v_email citext := nullif(btrim(p_email), '')::citext;
begin
  -- Nur das Testdaten-Skript (service_role, ohne Konto) — nie aus dem Portal.
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  if coalesce(p_first_name, '') <> 'TEST' or v_email is null
     or split_part(v_email::text, '@', 1) not like '%+zztest%' then
    raise exception 'not_test_data' using errcode = '22023';
  end if;
  select pe.person_id into v_pid from person_email pe where pe.email = v_email;
  if found then return v_pid; end if;
  insert into person (first_name, last_name, source_first)
  values ('TEST', nullif(btrim(p_last_name), ''), 'testdaten')
  returning id into v_pid;
  insert into person_email (person_id, email, is_primary, verified) values (v_pid, v_email, true, false);
  return v_pid;
end $$;
