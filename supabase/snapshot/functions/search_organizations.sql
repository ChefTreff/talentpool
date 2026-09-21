create or replace function search_organizations(p_query text, p_limit integer DEFAULT 10)
 RETURNS TABLE(id uuid, name text, type text, slug text, city text, active boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_q text;
begin
  if not is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_q := btrim(coalesce(p_query, ''));
  if length(v_q) < 2 then return; end if;
  v_q := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select o.id, coalesce(o.communication_name, o.legal_name), o.type, o.slug, o.address_city, o.active
    from organization o
    where coalesce(o.communication_name, '') ilike v_q
       or coalesce(o.legal_name, '') ilike v_q
       or coalesce(o.slug, '') ilike v_q
    order by o.active desc, coalesce(o.communication_name, o.legal_name)
    limit least(greatest(coalesce(p_limit, 10), 1), 25);
end $$;
