create or replace function volunteer_tickets_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(profile_id uuid, person_id uuid, display_name text, email text, status text, coupon_status text, coupon_code text, coupon_issued_at timestamp with time zone, redeemed_at timestamp with time zone, reminded_at timestamp with time zone, coupon_error text, shifts integer, ticket_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not is_volunteer_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_ed := volunteer_edition(p_edition_id);
  return query
    select v.id, v.person_id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           pe.email::text, v.status, v.coupon_status, v.coupon_code, v.coupon_issued_at,
           v.redeemed_at, v.reminded_at, v.coupon_error,
           (select count(*)::integer from shift_assignment a
             where a.person_id = v.person_id and a.status in ('assigned', 'confirmed')),
           -- Ein eingelöstes, danach storniertes Ticket soll der Liste nicht entgehen.
           (select t.status from ticket t where t.id = v.ticket_id)
      from volunteer_profile v
      join person p on p.id = v.person_id
      left join person_email pe on pe.person_id = p.id and pe.is_primary
     where v.edition_id = v_ed and v.status = 'accepted'
     -- Offene zuerst: die Liste ist eine Arbeitsliste, keine Statistik.
     order by case v.coupon_status when 'error' then 0 when 'issued' then 1
                                   when 'pending' then 2 when 'none' then 3 else 4 end,
              v.decided_at nulls last;
end $$;
