create or replace function volunteer_coupons_pending()
 RETURNS TABLE(profile_id uuid, person_id uuid, display_name text, email text, edition_id uuid, edition_slug text, vivenu_event_id text, undershop_id text, coupon_code text, vivenu_coupon_id text, coupon_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null and not is_volunteer_team() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select v.id, v.person_id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           pe.email::text, v.edition_id, e.slug, e.vivenu_event_id,
           e.vivenu_volunteer_undershop_id, v.coupon_code, v.vivenu_coupon_id, v.coupon_status
      from volunteer_profile v
      join person p on p.id = v.person_id
      join event e on e.id = v.edition_id
      left join person_email pe on pe.person_id = p.id and pe.is_primary
     where v.status = 'accepted'
       and v.coupon_status in ('none', 'pending', 'error')
       and e.vivenu_event_id is not null
     order by v.decided_at nulls last, v.applied_at;
end $$;
