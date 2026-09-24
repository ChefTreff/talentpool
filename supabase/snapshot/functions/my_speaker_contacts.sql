create or replace function my_speaker_contacts(p_profile_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id();
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile
   where id = coalesce(p_profile_id, my_speaker_profile_id(null));
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce((v_sp.person_id = v_me or is_speaker_assistant(v_sp.id, v_me)
                   or can_manage_speaker(v_sp.id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'kind', c.kind,
             'first_name', c.first_name, 'last_name', c.last_name,
             'email', c.email, 'phone', c.phone,
             'has_access', c.has_access,
             'consent_at', c.consent_at,
             -- Ob die Einladung schon angenommen wurde: ohne `auth_user_id`
             -- hat die Person noch kein Konto.
             'signed_in', (select p.auth_user_id is not null from person p where p.id = c.person_id))
           order by c.kind, c.created_at)
      from speaker_contact c where c.profile_id = v_sp.id), '[]'::jsonb);
end $$;
