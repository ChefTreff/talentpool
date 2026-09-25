create or replace function can_edit_edition_info()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select has_role('admin') or exists (
    select 1 from role_assignment ra
     where ra.person_id = current_person_id() and ra.role like 'area\_lead\_%'
       and not exists (select 1 from person zp where zp.id = current_person_id() and zp.access_blocked_at is not null)
       and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now()))
$$;
