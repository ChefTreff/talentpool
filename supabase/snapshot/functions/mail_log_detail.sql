create or replace function mail_log_detail(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_m mail_log%rowtype;
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_m from mail_log where id = p_id;
  if not found then raise exception 'mail_not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'id', v_m.id, 'to_email', v_m.to_email::text, 'person_id', v_m.person_id,
    'person_name', (select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
                      from person p where p.id = v_m.person_id),
    'template_key', v_m.template_key, 'locale', v_m.locale, 'subject', v_m.subject,
    'status', v_m.status, 'error', v_m.error, 'provider', v_m.provider, 'provider_id', v_m.provider_id,
    'related_type', v_m.related_type, 'related_id', v_m.related_id,
    'queued_at', v_m.queued_at, 'sent_at', v_m.sent_at,
    'attempts', coalesce((v_m.meta->>'attempts')::integer, 0),
    'resend_of', (v_m.meta->>'resend_of')::bigint,
    'vars', coalesce(v_m.meta->'vars', '{}'::jsonb),
    -- Kann diese Zeile erneut? Die Oberfläche soll den Knopf nicht anbieten,
    -- wenn die Antwort nein ist.
    'resendable', v_m.status in ('sent', 'failed', 'delivered'));
end $$;
