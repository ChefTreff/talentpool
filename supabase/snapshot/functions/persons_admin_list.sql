create or replace function persons_admin_list(p_query text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_edition uuid DEFAULT NULL::uuid, p_account text DEFAULT NULL::text, p_sort text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(person_id uuid, first_name text, last_name text, email text, occupation_status text, employer_name text, tier text, has_login boolean, blocked_at timestamp with time zone, deleted_at timestamp with time zone, deletion_pending boolean, roles text[], editions text[], created_at timestamp with time zone, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
        v_offset integer := greatest(0, coalesce(p_offset, 0));
        v_q text := nullif(btrim(coalesce(p_query, '')), '');
        v_role text := nullif(btrim(coalesce(p_role, '')), '');
        v_account text := nullif(btrim(coalesce(p_account, '')), '');
        v_sort text := coalesce(nullif(btrim(coalesce(p_sort, '')), ''), 'neu');
        v_words text[];
begin
  if not has_admin_section('persons') then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_account is not null and v_account not in ('alle', 'login', 'ohne_login', 'gesperrt', 'antrag', 'geloescht') then
    raise exception 'invalid_filter' using errcode = '22023', detail = v_account;
  end if;
  if v_sort not in ('neu', 'name') then
    raise exception 'invalid_filter' using errcode = '22023', detail = v_sort;
  end if;
  -- Jedes Wort einzeln, `\`, `%` und `_` als Zeichen: wer „max_” sucht, meint kein Muster.
  select coalesce(array_agg(replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_')), '{}')
    into v_words from unnest(string_to_array(coalesce(v_q, ''), ' ')) as w where w <> '';

  return query
  with treffer as (
    select p.id, p.first_name, p.last_name, p.occupation_status, p.employer_name, p.tier, p.auth_user_id,
           p.access_blocked_at, p.deleted_at, p.created_at,
           (select pe.email::text from person_email pe where pe.person_id = p.id
             order by pe.is_primary desc, pe.created_at limit 1) as email,
           exists (select 1 from profile_deletion_request r where r.person_id = p.id and r.status = 'pending') as antrag,
           count(*) over () as gesamt,
           row_number() over (order by case when v_sort = 'name' then lower(coalesce(p.last_name, '')) end,
                                       case when v_sort = 'name' then lower(coalesce(p.first_name, '')) end,
                                       case when v_sort = 'neu' then p.created_at end desc, p.id) as ord
      from person p
     where (case v_account
              when 'alle' then true
              when 'geloescht' then p.deleted_at is not null
              else p.deleted_at is null end)
       and (v_account is distinct from 'login' or p.auth_user_id is not null)
       and (v_account is distinct from 'ohne_login' or p.auth_user_id is null)
       and (v_account is distinct from 'gesperrt' or p.access_blocked_at is not null)
       and (v_account is distinct from 'antrag'
            or exists (select 1 from profile_deletion_request r where r.person_id = p.id and r.status = 'pending'))
       and (v_role is null or exists (select 1 from role_assignment ra
             where ra.person_id = p.id and ra.role = v_role
               and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())))
       and (p_edition is null
            or exists (select 1 from registration g where g.person_id = p.id and g.event_id = p_edition)
            or exists (select 1 from role_assignment ra where ra.person_id = p.id and ra.edition_id = p_edition))
       and not exists (
             select 1 from unnest(v_words) as w
              where not (coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '') ilike '%' || w || '%' escape '\'
                      or coalesce(p.last_name, '') || ' ' || coalesce(p.first_name, '') ilike '%' || w || '%' escape '\'
                      or coalesce(p.employer_name, '') ilike '%' || w || '%' escape '\'
                      or exists (select 1 from person_email pe where pe.person_id = p.id
                                  and pe.email::text ilike '%' || w || '%' escape '\')))
  ), seite as (
    select * from treffer t where t.ord > v_offset and t.ord <= v_offset + v_limit
  )
  select s.id, s.first_name, s.last_name, s.email, s.occupation_status, s.employer_name, s.tier,
         s.auth_user_id is not null, s.access_blocked_at, s.deleted_at, s.antrag,
         coalesce((select array_agg(distinct ra.role order by ra.role) from role_assignment ra
                    where ra.person_id = s.id and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())), '{}'),
         coalesce((select array_agg(distinct e.name order by e.name) from event e
                    where e.is_edition
                      and (exists (select 1 from registration g where g.person_id = s.id and g.event_id = e.id)
                           or exists (select 1 from role_assignment ra where ra.person_id = s.id and ra.edition_id = e.id))), '{}'),
         s.created_at, s.gesamt
    from seite s
   order by s.ord;
end $$;
