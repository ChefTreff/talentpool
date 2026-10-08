create or replace function manage_person_email(p_person_id uuid, p_action text, p_email_id uuid DEFAULT NULL::uuid, p_email text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_login boolean; v_geloescht boolean; v_zeile person_email%rowtype;
  v_mail text := lower(btrim(coalesce(p_email, '')));
  v_besitzer uuid; v_neu_id uuid;
begin
  if not has_admin_section('persons') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('add', 'primary', 'remove', 'change') then
    raise exception 'invalid_action' using errcode = '22023', detail = coalesce(p_action, '');
  end if;
  select p.auth_user_id is not null, p.deleted_at is not null into v_login, v_geloescht
    from person p where p.id = p_person_id for update;
  if v_login is null then raise exception 'person_not_found' using errcode = 'P0002', detail = p_person_id::text; end if;
  if v_geloescht then raise exception 'person_anonymized' using errcode = 'P0001', detail = p_person_id::text; end if;

  if p_action in ('add', 'change') then
    if length(v_mail) > 254 or v_mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception 'invalid_email' using errcode = 'P0001';
    end if;
    select pe.person_id into v_besitzer from person_email pe where pe.email = v_mail::citext
       and (p_action = 'add' or pe.id is distinct from p_email_id);
    if v_besitzer is not null then
      raise exception 'person_email_taken' using errcode = 'P0001', detail = v_besitzer::text;
    end if;
  end if;

  if p_action = 'add' then
    insert into person_email (person_id, email, type, is_primary, verified)
      values (p_person_id, v_mail::citext, 'private', false, false) returning id into v_neu_id;
    perform log_audit('person.email_add', 'person', p_person_id::text, null,
                      jsonb_build_object('email_id', v_neu_id, 'email_hash', left(email_hash(v_mail), 12)));
    return;
  end if;

  select * into v_zeile from person_email where id = p_email_id and person_id = p_person_id;
  if not found then raise exception 'email_not_found' using errcode = 'P0001', detail = coalesce(p_email_id::text, ''); end if;

  if p_action = 'primary' then
    -- Zwei Anweisungen: der partielle Unique-Index (eine primaere je Person) prueft zeilenweise, die
    -- Genau-eine-Pruefung erst beim Commit. Erst die alte abwaehlen, dann die neue setzen.
    update person_email set is_primary = false where person_id = p_person_id and is_primary and id <> p_email_id;
    update person_email set is_primary = true where id = p_email_id;
    perform log_audit('person.email_primary', 'person', p_person_id::text, null,
                      jsonb_build_object('email_id', p_email_id, 'email_hash', left(email_hash(v_zeile.email::text), 12)));
  elsif p_action = 'remove' then
    if v_zeile.is_primary then raise exception 'primary_email_required' using errcode = 'P0001'; end if;
    delete from person_email where id = p_email_id;
    perform log_audit('person.email_remove', 'person', p_person_id::text,
                      jsonb_build_object('email_id', p_email_id, 'email_hash', left(email_hash(v_zeile.email::text), 12)), null);
  else
    if v_login then raise exception 'login_email_locked' using errcode = 'P0001'; end if;
    update person_email set email = v_mail::citext, verified = false where id = p_email_id;
    perform log_audit('person.email_change', 'person', p_person_id::text,
                      jsonb_build_object('email_id', p_email_id, 'email_hash', left(email_hash(v_zeile.email::text), 12)),
                      jsonb_build_object('email_id', p_email_id, 'email_hash', left(email_hash(v_mail), 12)));
  end if;
end $$;
