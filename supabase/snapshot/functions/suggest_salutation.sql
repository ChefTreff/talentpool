create or replace function suggest_salutation(p_person_id uuid, p_locale text DEFAULT 'de'::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_p person%rowtype;
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_p from person where id = p_person_id;
  if not found or v_p.last_name is null or btrim(v_p.last_name) = '' then return null; end if;
  return case
    when p_locale = 'en' then 'Dear ' || coalesce(nullif(btrim(v_p.title), '') || ' ', '') || v_p.last_name
    when v_p.gender = 'weiblich' then 'Sehr geehrte Frau ' || coalesce(nullif(btrim(v_p.title), '') || ' ', '') || v_p.last_name
    when v_p.gender = 'maennlich' then 'Sehr geehrter Herr ' || coalesce(nullif(btrim(v_p.title), '') || ' ', '') || v_p.last_name
    else null end;
end $$;
