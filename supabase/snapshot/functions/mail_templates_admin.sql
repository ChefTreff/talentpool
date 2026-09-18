create or replace function mail_templates_admin()
 RETURNS TABLE(key text, locale text, subject text, body_md text, description text, active boolean, version integer, updated_at timestamp with time zone, updated_by_name text, queued integer, sent_30d integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select t.key, t.locale, t.subject, t.body_md, t.description, t.active, t.version, t.updated_at,
           (select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
              from person p where p.id = t.updated_by),
           (select count(*)::integer from mail_log m
             where m.template_key = t.key and m.locale = t.locale and m.status = 'queued'),
           (select count(*)::integer from mail_log m
             where m.template_key = t.key and m.locale = t.locale
               and m.status in ('sent', 'delivered') and m.queued_at > now() - interval '30 days')
      from mail_template t
     order by t.key, t.locale;
end $$;
