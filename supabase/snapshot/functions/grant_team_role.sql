create or replace function grant_team_role(p_person_id uuid, p_role text, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_ed uuid := case when p_role = 'admin' then null else p_edition_id end;
  v_scope text; v_blocked timestamptz; v_login boolean; v_neu boolean;
  v_mail text := 'none'; v_mail_id bigint; v_de text; v_en text;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('access') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_role is null or not (p_role = any (team_role_keys())) then
    raise exception 'invalid_role' using errcode = '22023', detail = coalesce(p_role, 'null');
  end if;
  select p.access_blocked_at, p.auth_user_id is not null into v_blocked, v_login
    from person p where p.id = p_person_id and p.deleted_at is null;
  if not found then raise exception 'person_not_found' using errcode = 'P0002'; end if;
  if v_blocked is not null then raise exception 'access_blocked' using errcode = 'P0001'; end if;
  if v_ed is not null and not exists (select 1 from event e where e.id = v_ed and e.is_edition) then
    raise exception 'edition_not_found' using errcode = 'P0002';
  end if;
  v_scope := case when v_ed is null then 'global' else 'edition' end;

  v_neu := not exists (
    select 1 from role_assignment ra
     where ra.person_id = p_person_id and ra.role = p_role and ra.scope_type = v_scope
       and ra.scope_id is null and ra.edition_id is not distinct from v_ed and ra.portal is null
       and (ra.valid_to is null or ra.valid_to > now()));

  perform assign_role(p_person_id, p_role, v_scope, null, v_ed, null, null, null, 'Team (Admin)');

  if v_login and v_neu then
    select coalesce(t.label_de, p_role), coalesce(t.label_en, p_role) into v_de, v_en
      from (select 1) x left join vocab_term t on t.vocabulary = 'role' and t.key = p_role;
    v_mail_id := queue_mail('team_member_added', p_person_id, jsonb_build_object('roles_de', v_de, 'roles_en', v_en), 'person', null);
    if v_mail_id is not null then
      select ml.status into v_mail from mail_log ml where ml.id = v_mail_id;
    end if;
  end if;

  perform log_audit('access.team_role', 'person', p_person_id::text, null,
                    jsonb_build_object('role', p_role, 'scope_type', v_scope, 'edition_id', v_ed, 'new', v_neu, 'mail', v_mail));
  return jsonb_build_object('person_id', p_person_id, 'role', p_role, 'granted', v_neu, 'has_login', v_login, 'mail', v_mail);
end $$;
