create or replace function is_u35(p_birthdate date, p_ref date DEFAULT CURRENT_DATE)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select case when p_birthdate is null then null
              else extract(year from age(p_ref, p_birthdate)) < 35 end
$$;
