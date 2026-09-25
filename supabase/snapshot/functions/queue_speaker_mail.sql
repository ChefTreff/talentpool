create or replace function queue_speaker_mail(p_template_key text, p_profile_id uuid, p_vars jsonb DEFAULT '{}'::jsonb, p_related_type text DEFAULT NULL::text, p_related_id uuid DEFAULT NULL::uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_person uuid; v_an uuid; v_name text;
begin
  select sp.person_id into v_person from speaker_profile sp where sp.id = p_profile_id;
  if v_person is null then return null; end if;
  v_an := speaker_mail_recipient(p_profile_id);
  if v_an is distinct from v_person then
    select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') into v_name
      from person p where p.id = v_person;
    return queue_mail(p_template_key, v_an,
                      coalesce(p_vars, '{}'::jsonb) || jsonb_build_object('on_behalf_of', coalesce(v_name, '')),
                      p_related_type, p_related_id);
  end if;
  return queue_mail(p_template_key, v_person, p_vars, p_related_type, p_related_id);
end $$;
