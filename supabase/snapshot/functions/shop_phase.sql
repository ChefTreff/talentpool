create or replace function shop_phase(p_edition_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  with d as (
    select max(due_at) filter (where key = 'shop_phase1_end') as d1,
           max(due_at) filter (where key = 'shop_phase2_end') as d2
    from deadline where edition_id = p_edition_id
  )
  select jsonb_build_object(
    'phase', case when d1 is not null and now() <= d1 then 1
                  when d2 is not null and now() <= d2 then 2
                  else 0 end,
    'ends_at', case when d1 is not null and now() <= d1 then d1
                    when d2 is not null and now() <= d2 then d2
                    else null end,
    'late_only', ((d1 is null or now() > d1) and d2 is not null and now() <= d2),
    'phase1_ends', d1, 'phase2_ends', d2)
  from d
$$;
