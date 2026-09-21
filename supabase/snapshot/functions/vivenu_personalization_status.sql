create or replace function vivenu_personalization_status(p_status text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select case upper(btrim(coalesce(p_status, '')))
    when 'DETAILSREQUIRED' then 'pending'
    when 'PENDING' then 'pending'
    when 'PARTIAL' then 'partial'
    when 'COMPLETE' then 'complete'
    when 'COMPLETED' then 'complete'
    when 'PERSONALIZED' then 'complete'
    else null end
$$;
