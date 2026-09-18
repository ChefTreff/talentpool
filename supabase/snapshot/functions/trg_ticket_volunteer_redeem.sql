create or replace function trg_ticket_volunteer_redeem()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_profile uuid;
begin
  if new.status = 'cancelled' then return new; end if;

  if new.vivenu_discount_id is not null then
    select v.id into v_profile from volunteer_profile v
     where v.vivenu_coupon_id = new.vivenu_discount_id limit 1;
  end if;

  if v_profile is null and new.vivenu_undershop_id is not null and new.person_id is not null then
    select v.id into v_profile from volunteer_profile v
      join event e on e.id = v.edition_id
     where v.person_id = new.person_id
       and e.vivenu_volunteer_undershop_id = new.vivenu_undershop_id
       and v.coupon_status in ('issued', 'redeemed')
     limit 1;
  end if;

  if v_profile is null then return new; end if;

  update volunteer_profile
     set coupon_status = 'redeemed',
         redeemed_at = coalesce(redeemed_at, now()),
         ticket_id = coalesce(ticket_id, new.id),
         updated_at = now()
   where id = v_profile and coupon_status <> 'redeemed';
  return new;
end $$;
