create or replace function can_edit_mail_template(p_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select has_admin_section(mail_template_section(p_key))
$$;
