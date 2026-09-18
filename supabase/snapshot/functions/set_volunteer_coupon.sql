create or replace function set_volunteer_coupon(p_profile_id uuid, p_status text, p_coupon_code text DEFAULT NULL::text, p_vivenu_coupon_id text DEFAULT NULL::text, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('pending', 'issued', 'error', 'revoked') then
    raise exception 'invalid_status' using errcode = '22023', detail = p_status;
  end if;
  update volunteer_profile set
    coupon_status = p_status,
    coupon_code = coalesce(nullif(btrim(coalesce(p_coupon_code, '')), ''), coupon_code),
    vivenu_coupon_id = coalesce(nullif(btrim(coalesce(p_vivenu_coupon_id, '')), ''), vivenu_coupon_id),
    coupon_issued_at = case when p_status = 'issued' then coalesce(coupon_issued_at, now()) else coupon_issued_at end,
    coupon_error = case when p_status = 'error' then left(coalesce(p_error, ''), 500) else null end,
    updated_at = now()
  where id = p_profile_id;
  if not found then raise exception 'profile_not_found' using errcode = 'P0002'; end if;
end $$;
