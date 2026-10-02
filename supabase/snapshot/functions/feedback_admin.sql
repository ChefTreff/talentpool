create or replace function feedback_admin()
 RETURNS TABLE(id uuid, format text, kind text, ratings jsonb, return_intent text, main_reason text, memorable text, body text, created_on date, status text, tags text[], anonymous boolean, first_name text, last_name text, email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not coalesce(has_admin_section('feedback'), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select f.id, f.format, f.kind, f.ratings, f.return_intent, f.main_reason, f.memorable, f.body, f.created_on,
           f.status, f.tags, f.person_id is null, p.first_name, p.last_name, e.email::text
      from feedback_entry f
      left join person p on p.id = f.person_id
      left join person_email e on e.person_id = f.person_id and e.is_primary
     order by (f.status = 'open') desc, f.created_on desc, f.id;
end $$;
