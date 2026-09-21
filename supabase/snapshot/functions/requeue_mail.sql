create or replace function requeue_mail(p_log_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_m mail_log%rowtype; v_neu bigint;
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_m from mail_log where id = p_log_id;
  if not found then raise exception 'mail_not_found' using errcode = 'P0002'; end if;
  if v_m.status not in ('sent', 'failed', 'delivered') then
    raise exception 'not_resendable' using errcode = 'P0001', detail = v_m.status;
  end if;

  insert into mail_log (to_email, person_id, template_key, locale, status, meta, related_type, related_id)
  values (v_m.to_email, v_m.person_id, v_m.template_key, v_m.locale, 'queued',
          jsonb_build_object('vars', coalesce(v_m.meta->'vars', '{}'::jsonb),
                             'attempts', 0, 'resend_of', v_m.id),
          v_m.related_type, v_m.related_id)
  returning id into v_neu;

  perform log_audit('mail.requeue', 'mail_log', v_neu::text,
                    jsonb_build_object('id', v_m.id, 'status', v_m.status),
                    jsonb_build_object('id', v_neu, 'template_key', v_m.template_key));
  return v_neu;
end $$;
