create or replace function team_access_list(p_query text DEFAULT NULL::text, p_filter text DEFAULT 'alle'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(person_id uuid, name text, email text, has_login boolean, blocked_at timestamp with time zone, is_team boolean, is_admin boolean, roles jsonb, since timestamp with time zone, admins integer, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_q text := nullif(btrim(coalesce(p_query, '')), '');
  v_filter text := coalesce(nullif(btrim(coalesce(p_filter, '')), ''), 'alle');
  v_admins integer;
begin
  if not has_admin_section('access') then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_filter not in ('alle', 'team', 'gesperrt', 'ohne_login') then
    raise exception 'invalid_filter' using errcode = '22023', detail = v_filter;
  end if;

  select count(distinct ra.person_id)::integer into v_admins
    from role_assignment ra
   where ra.role = 'admin' and ra.scope_type = 'global'
     and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now());

  return query
  with rollen as (
    select ra.person_id as pid,
           jsonb_agg(jsonb_build_object(
             'id', ra.id, 'role', ra.role, 'scope_type', ra.scope_type,
             'scope_id', ra.scope_id, 'edition_id', ra.edition_id, 'portal', ra.portal,
             'valid_to', ra.valid_to,
             'scope_label', case ra.scope_type
               when 'edition'   then (select e.name from event e where e.id = ra.edition_id)
               when 'portal'    then ra.portal
               when 'org'       then (select coalesce(o.communication_name, o.legal_name) from organization o where o.id = ra.scope_id)
               when 'stage'     then (select s.name from stage s where s.id = ra.scope_id)
               when 'stage_day' then (select s.name || ' · ' || d.day_date::text
                                        from stage_day sd join stage s on s.id = sd.stage_id
                                        join event_day d on d.id = sd.event_day_id where sd.id = ra.scope_id)
               when 'slot'      then (select s.name || ' · ' || to_char(sl.start_at at time zone 'Europe/Berlin', 'DD.MM. HH24:MI')
                                        from slot sl join stage s on s.id = sl.stage_id where sl.id = ra.scope_id)
               else null end)
             order by ra.role, ra.created_at) as r,
           bool_or(ra.role = any (team_role_keys())) as team,
           bool_or(ra.role = 'admin') as adm,
           min(ra.valid_from) filter (where ra.role = any (team_role_keys())) as seit
      from role_assignment ra
     where ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())
     group by ra.person_id
  ), kandidaten as (
    -- Konto **oder** Rolle: ein Konto ohne Rolle kommt ins Portal, eine Rolle ohne Konto wartet auf die Einladung.
    select p.id, p.auth_user_id, p.access_blocked_at,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') as nm,
           (select pe.email::text from person_email pe where pe.person_id = p.id and pe.is_primary limit 1) as mail,
           coalesce(r.r, '[]'::jsonb) as rl, coalesce(r.team, false) as tm, coalesce(r.adm, false) as ad, r.seit
      from person p
      left join rollen r on r.pid = p.id
     where p.deleted_at is null
       and (p.auth_user_id is not null or r.pid is not null)
  )
  select k.id, k.nm, k.mail, k.auth_user_id is not null, k.access_blocked_at, k.tm, k.ad, k.rl, k.seit, v_admins,
         count(*) over ()
    from kandidaten k
   where (v_q is null or coalesce(k.nm, '') ilike board_like_pattern(v_q) or coalesce(k.mail, '') ilike board_like_pattern(v_q))
     and case v_filter
           when 'team' then k.tm
           when 'gesperrt' then k.access_blocked_at is not null
           when 'ohne_login' then k.auth_user_id is null
           else true end
   order by (k.access_blocked_at is not null) desc, k.nm nulls last, k.id
   limit v_limit offset v_offset;
end $$;
