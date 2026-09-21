create or replace function volunteer_coupon_revocations_pending()
 RETURNS TABLE(id bigint, profile_id uuid, vivenu_coupon_id text, coupon_code text, revoked_at timestamp with time zone, error text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null and not is_volunteer_team() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select r.id, r.profile_id, r.vivenu_coupon_id, r.coupon_code, r.revoked_at, r.error
      from volunteer_coupon_revocation r
     where r.deactivated_at is null
     order by r.revoked_at;
end $$;
