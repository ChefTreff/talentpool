create or replace function claim_or_create_person()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_uid      uuid   := auth.uid();
  v_email    citext := auth.email();
  v_verified boolean;
  v_pid      uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select id into v_pid from person where auth_user_id = v_uid;
  if found then
    return v_pid;
  end if;
  select (email_confirmed_at is not null) into v_verified
    from auth.users where id = v_uid;
  if v_email is not null and coalesce(v_verified, false) then
    select pe.person_id into v_pid
      from person_email pe
      join person p on p.id = pe.person_id
     where pe.email = v_email and p.auth_user_id is null
     limit 1;
    if found then
      update person set auth_user_id = v_uid where id = v_pid;
      update person_email set verified = true
        where person_id = v_pid and email = v_email;
      return v_pid;
    end if;
  end if;
  if v_email is null then
    raise exception 'authenticated user has no email' using errcode = '23502';
  end if;
  insert into person (auth_user_id, source_first) values (v_uid, 'portal')
    returning id into v_pid;
  insert into person_email (person_id, email, is_primary, verified)
    values (v_pid, v_email, true, coalesce(v_verified, false));
  return v_pid;
end $$;
