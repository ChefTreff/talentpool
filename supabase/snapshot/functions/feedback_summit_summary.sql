create or replace function feedback_summit_summary()
 RETURNS TABLE(question text, answers integer, average numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not coalesce(has_admin_section('feedback'), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select q.k, count(f.ratings->>q.k)::integer, round(avg((f.ratings->>q.k)::numeric), 2)
      from unnest(array['overall', 'programme', 'expo', 'masterclasses', 'app', 'side_events']) with ordinality as q(k, o)
      left join feedback_entry f on f.format = 'summit' and f.ratings ? q.k
     group by q.k, q.o
     order by q.o;
end $$;
