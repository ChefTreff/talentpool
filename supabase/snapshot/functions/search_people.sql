create or replace function search_people(p_query text, p_limit integer DEFAULT 10)
 RETURNS TABLE(id uuid, display_name text, email text, tier text, city text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_q text; v_admin boolean;
begin
  if not is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_q := btrim(coalesce(p_query, ''));
  if length(v_q) < 2 then return; end if;
  v_q := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_admin := has_role('admin');
  return query
    select p.id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           case when v_admin then (select pe.email::text from person_email pe where pe.person_id = p.id and pe.is_primary) end,
           p.tier, p.city
    from person p
    where p.deleted_at is null
      and (p.first_name ilike v_q or p.last_name ilike v_q
           or (coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) ilike v_q
           or (v_admin and exists (select 1 from person_email pe where pe.person_id = p.id and pe.email::text ilike v_q)))
    order by p.last_name nulls last, p.first_name nulls last
    limit least(greatest(coalesce(p_limit, 10), 1), 25);
end $$;
