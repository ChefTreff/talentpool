create or replace function set_person_salutation(p_person_id uuid, p_de text, p_en text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_before jsonb;
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  select jsonb_build_object('de', salutation_de, 'en', salutation_en) into v_before
    from person where id = p_person_id;
  if v_before is null then raise exception 'person_not_found' using errcode = 'P0002', detail = p_person_id::text; end if;
  update person set
    salutation_de = nullif(btrim(coalesce(p_de, '')), ''),
    salutation_en = nullif(btrim(coalesce(p_en, '')), '')
   where id = p_person_id;
  perform log_audit('person.salutation', 'person', p_person_id::text, v_before,
                    jsonb_build_object('de', p_de, 'en', p_en));
end $$;
