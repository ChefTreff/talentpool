create or replace function mail_log_admin(p_query text DEFAULT NULL::text, p_template text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_person_id uuid DEFAULT NULL::uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id bigint, to_email text, person_id uuid, person_name text, template_key text, locale text, subject text, status text, error text, provider_id text, queued_at timestamp with time zone, sent_at timestamp with time zone, resend_of bigint, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  -- Sonderzeichen entschärfen: die Eingabe kommt aus einem Suchfeld.
  if v_q is not null then
    v_q := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  return query
    select m.id, m.to_email::text, m.person_id,
           (select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
              from person p where p.id = m.person_id),
           m.template_key, m.locale, m.subject, m.status, m.error, m.provider_id,
           m.queued_at, m.sent_at, (m.meta->>'resend_of')::bigint,
           count(*) over ()
      from mail_log m
     where (p_template is null or m.template_key = p_template)
       and (p_status is null or m.status = p_status)
       and (p_person_id is null or m.person_id = p_person_id)
       and (p_from is null or m.queued_at >= p_from)
       and (p_to is null or m.queued_at < p_to)
       and (v_q is null or m.to_email::text ilike v_q or m.subject ilike v_q)
     order by m.queued_at desc, m.id desc
     limit greatest(1, least(coalesce(p_limit, 50), 200))
    offset greatest(0, coalesce(p_offset, 0));
end $$;
