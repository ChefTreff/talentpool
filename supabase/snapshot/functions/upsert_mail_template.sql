create or replace function upsert_mail_template(p_data jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_key text := nullif(btrim(p_data->>'key'), '');
        v_locale text := nullif(p_data->>'locale', '');
        v_subject text := nullif(btrim(p_data->>'subject'), '');
        v_body text := nullif(btrim(p_data->>'body_md'), '');
        v_before jsonb; v_version integer;
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_key is null then raise exception 'fields_required' using errcode = '22023', detail = 'key'; end if;
  if v_locale not in ('de', 'en') then
    raise exception 'invalid_locale' using errcode = '22023', detail = coalesce(v_locale, 'null');
  end if;

  select to_jsonb(t) into v_before from mail_template t where t.key = v_key and t.locale = v_locale;

  if v_before is null then
    if v_subject is null or v_body is null then
      raise exception 'fields_required' using errcode = '22023', detail = 'subject/body_md';
    end if;
    insert into mail_template (key, locale, version, subject, body_md, description, active, updated_by)
    values (v_key, v_locale, 1, v_subject, v_body,
            nullif(btrim(p_data->>'description'), ''),
            coalesce((p_data->>'active')::boolean, true), current_person_id())
    returning version into v_version;
  else
    if (p_data ? 'subject' and v_subject is null) or (p_data ? 'body_md' and v_body is null) then
      raise exception 'fields_required' using errcode = '22023', detail = 'subject/body_md';
    end if;
    update mail_template set
      subject     = coalesce(v_subject, subject),
      body_md     = coalesce(v_body, body_md),
      description = case when p_data ? 'description' then nullif(btrim(p_data->>'description'), '') else description end,
      active      = coalesce((p_data->>'active')::boolean, active),
      version     = version + 1,
      updated_by  = current_person_id()
    where key = v_key and locale = v_locale
    returning version into v_version;
  end if;

  perform log_audit('mail_template.upsert', 'mail_template', v_key || '/' || v_locale, v_before,
                    jsonb_build_object('subject', coalesce(v_subject, v_before->>'subject'),
                                       'body_md', coalesce(v_body, v_before->>'body_md'),
                                       'version', v_version));
  return v_version;
end $$;
