create or replace function log_access_invite(p_person_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not has_admin_section('access') then raise exception 'not allowed' using errcode = '42501'; end if;
  -- Ueber die **Nutzer**-Sitzung gerufen, nicht ueber den Service-Client: sonst
  -- stuende im Protokoll „jemand hat eingeladen" statt „Konrad hat eingeladen".
  -- `log_audit` nimmt den Akteur aus `current_person_id()`.
  perform log_audit('access.invited', 'person', p_person_id::text, null,
                    jsonb_build_object('via', 'magic_link'));
end $$;
