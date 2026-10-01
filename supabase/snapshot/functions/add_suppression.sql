create or replace function add_suppression(p_email text, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_mail text := lower(nullif(btrim(coalesce(p_email, '')), '')); v_hash text; v_n integer; v_neu boolean;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('suppression') then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_mail is null or v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = '22023', detail = coalesce(v_mail, 'null');
  end if;
  if p_reason is null or p_reason not in ('unsubscribed', 'hard_bounce', 'manual') then
    raise exception 'invalid_reason' using errcode = '22023', detail = coalesce(p_reason, 'null');
  end if;
  v_hash := email_hash(v_mail);
  insert into suppression (email_hash, reason) values (v_hash, p_reason)
  on conflict (email_hash) do nothing;
  get diagnostics v_n = row_count;
  v_neu := v_n > 0;
  -- Ein bestehender Eintrag behält seinen Grund
  -- (eine Löschung bleibt eine Löschung, auch wenn jemand „manuell" dazuschreibt).
  perform log_audit('suppression.added', 'suppression', left(v_hash, 12), null,
                    jsonb_build_object('reason', p_reason, 'new', v_neu));
  return v_neu;
end $$;
