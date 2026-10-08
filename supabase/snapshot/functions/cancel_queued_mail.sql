create or replace function cancel_queued_mail(p_template_key text, p_related_id uuid, p_person_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_n integer;
begin
  if nullif(btrim(coalesce(p_template_key, '')), '') is null or p_related_id is null then
    raise exception 'invalid_mail_key' using errcode = '22023';
  end if;
  -- Nur Zeilen im Status `queued`: eine versendete Mail lässt sich nicht zurückholen. Der Token einer One-Click-Mail gehört nicht in
  -- ein Protokoll, das Admins lesen (Liste wie lib/mail/geheimnisse.ts).
  with c as (
    update mail_log m
       set status = 'cancelled',
           meta = jsonb_set(
                    coalesce(m.meta, '{}'::jsonb)
                      || jsonb_build_object('cancelled_at', now(), 'cancel_reason', nullif(btrim(coalesce(p_reason, '')), '')),
                    '{vars}', coalesce(m.meta->'vars', '{}'::jsonb) - 'side_event_token'),
           updated_at = now()
     where m.status = 'queued' and m.template_key = p_template_key and m.related_id = p_related_id
       and (p_person_id is null or m.person_id = p_person_id)
    returning 1)
  select count(*)::integer into v_n from c;
  return v_n;
end $$;
