create or replace function access_accounts(p_query text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(person_id uuid, name text, email text, has_login boolean, blocked_at timestamp with time zone, roles text[], total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
        v_offset integer := greatest(0, coalesce(p_offset, 0));
        v_q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if not has_admin_section('access') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  with kandidaten as (
    -- Wer ein Konto hat **oder** eine Rolle traegt. Beides zusammen, weil beides
    -- Zugang bedeutet: ein Konto ohne Rolle kommt ins Portal, eine Rolle ohne
    -- Konto wartet auf die Einladung — und genau die soll man hier sehen.
    select p.id, p.auth_user_id, p.access_blocked_at,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') as name,
           (select pe.email::text from person_email pe
             where pe.person_id = p.id and pe.is_primary limit 1) as email
      from person p
     where p.deleted_at is null
       and (p.auth_user_id is not null
            or exists (select 1 from role_assignment ra where ra.person_id = p.id
                        and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())))
  )
  select k.id, k.name, k.email, k.auth_user_id is not null, k.access_blocked_at,
         coalesce((select array_agg(distinct ra.role order by ra.role)
                     from role_assignment ra
                    where ra.person_id = k.id
                      and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())), '{}'),
         count(*) over ()
    from kandidaten k
   where v_q is null
      or coalesce(k.name, '') ilike '%' || v_q || '%'
      or coalesce(k.email, '') ilike '%' || v_q || '%'
   -- Gesperrte zuerst: wer hier sucht, sucht meistens die.
   order by (k.access_blocked_at is not null) desc, k.name nulls last
   limit v_limit offset v_offset;
end $$;
