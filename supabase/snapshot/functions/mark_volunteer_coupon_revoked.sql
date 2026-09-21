create or replace function mark_volunteer_coupon_revoked(p_id bigint, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  update volunteer_coupon_revocation
     set deactivated_at = case when p_error is null then now() else deactivated_at end,
         error = left(p_error, 500)
   where id = p_id;
  if not found then raise exception 'revocation_not_found' using errcode = 'P0002'; end if;
end $$;
