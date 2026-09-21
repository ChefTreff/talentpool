create or replace function restore_mail_template(p_key text, p_locale text, p_subject text, p_body_md text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from mail_template t where t.key = p_key and t.locale = p_locale) then
    raise exception 'template_not_found' using errcode = 'P0002';
  end if;
  return upsert_mail_template(jsonb_build_object(
    'key', p_key, 'locale', p_locale, 'subject', p_subject, 'body_md', p_body_md));
end $$;
