create or replace function revoke_application_share(p_application_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_pid uuid := current_person_id(); v_a application; v_version text;
begin
  if v_pid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_a from application a where a.id = p_application_id and a.person_id = v_pid for update;
  if not found then raise exception 'application_not_found' using errcode = 'P0002'; end if;
  if not v_a.consent_share then return; end if;
  update application set consent_share = false where id = v_a.id;
  -- Die Version, auf die sich die Einwilligung bezog (letzter Nachweis dieser Bewerbung).
  select r.version into v_version from consent_record r
   where r.person_id = v_pid and r.consent_type = 'share_with_partner' and r.granted and r.meta->>'application_id' = v_a.id::text
   order by r.granted_at desc limit 1;
  insert into consent_record (person_id, consent_type, version, granted, source, meta)
  values (v_pid, 'share_with_partner', coalesce(v_version, 'partner_share_2027-1'), false, 'portal',
          jsonb_build_object('application_id', v_a.id, 'session_id', v_a.session_id, 'form', 'revoke'));
  perform log_audit('application.share_revoke', 'application', v_a.id::text, null, jsonb_build_object('session_id', v_a.session_id));
end $$;
