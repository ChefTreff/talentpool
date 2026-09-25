create or replace function my_admin_sections()
 RETURNS TABLE(section text, allowed boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  return query
    select r.section, has_admin_section(r.section)
      from (select distinct s.section from admin_section_role s) r
     order by r.section;
end $$;
