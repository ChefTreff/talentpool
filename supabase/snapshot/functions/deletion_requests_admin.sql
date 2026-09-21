create or replace function deletion_requests_admin(p_status text DEFAULT 'pending'::text)
 RETURNS TABLE(id uuid, person_id uuid, person_name text, email text, reason text, blockers text[], status text, requested_at timestamp with time zone, handled_by_name text, handled_at timestamp with time zone, handled_note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select r.id, r.person_id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           (select pe.email::text from person_email pe
             where pe.person_id = r.person_id and pe.is_primary),
           r.reason, r.blockers, r.status, r.requested_at,
           nullif(btrim(coalesce(h.first_name, '') || ' ' || coalesce(h.last_name, '')), ''),
           r.handled_at, r.handled_note
      from profile_deletion_request r
      join person p on p.id = r.person_id
      left join person h on h.id = r.handled_by
     where p_status is null or r.status = p_status
     order by r.requested_at desc;
end $$;
