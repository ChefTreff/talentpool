create or replace function edition_file_path_allowed(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null or p_name is null then return false; end if;
  if coalesce(is_staff() or is_production_team() or is_marketing_team(), false) then return true; end if;
  return exists (
    select 1 from edition_file f
     where (f.storage_path = p_name or f.preview_path = p_name)
       and f.audience && my_kb_audiences()
  );
end $$;
