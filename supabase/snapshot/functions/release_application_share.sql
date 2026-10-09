create or replace function release_application_share(p_application_id uuid, p_version text DEFAULT 'partner_share_2027-1'::text, p_language text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_pid uuid := current_person_id(); v_a application; v_version text := coalesce(nullif(btrim(p_version), ''), 'partner_share_2027-1');
begin
  if v_pid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if v_version !~ '^partner_share_[0-9]{4}-[0-9]+$' then raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'consent_version'; end if;
  select * into v_a from application a where a.id = p_application_id and a.person_id = v_pid for update;
  if not found then raise exception 'application_not_found' using errcode = 'P0002'; end if;
  if v_a.status in ('withdrawn', 'expired') then raise exception 'application_not_found' using errcode = 'P0002'; end if;
  if v_a.consent_share then return; end if;
  update application set consent_share = true where id = v_a.id;
  insert into consent_record (person_id, consent_type, version, granted, source, meta)
  values (v_pid, 'share_with_partner', v_version, true, 'portal',
          jsonb_build_object('application_id', v_a.id, 'session_id', v_a.session_id, 'language', p_language, 'form', 'release'));
  perform log_audit('application.share_release', 'application', v_a.id::text, null, jsonb_build_object('session_id', v_a.session_id));
end $$;
