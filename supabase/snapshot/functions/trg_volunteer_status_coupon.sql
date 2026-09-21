create or replace function trg_volunteer_status_coupon()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if new.status in ('declined', 'withdrawn') and old.coupon_status in ('pending', 'issued') then
    new.coupon_status := 'revoked';
    if new.vivenu_coupon_id is not null then
      insert into volunteer_coupon_revocation (profile_id, vivenu_coupon_id, coupon_code)
      values (new.id, new.vivenu_coupon_id, new.coupon_code);
    end if;
  elsif new.status = 'accepted' and old.status <> 'accepted' and old.coupon_status = 'revoked' then
    new.coupon_status := 'none';
    new.coupon_code := null;
    new.vivenu_coupon_id := null;
    new.coupon_issued_at := null;
    new.coupon_error := null;
    new.reminded_at := null;
  end if;
  return new;
end $$;
