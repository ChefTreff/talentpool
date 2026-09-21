create or replace function remind_volunteer_tickets()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_row record; v_n integer := 0;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  for v_row in
    select v.id, v.person_id, v.coupon_code, e.name as edition_name
      from volunteer_profile v join event e on e.id = v.edition_id
     where v.status = 'accepted'
       and v.coupon_status = 'issued'
       and v.reminded_at is null
       and v.coupon_issued_at is not null
       and v.coupon_issued_at < now() - interval '7 days'
  loop
    perform queue_mail('volunteer_ticket_reminder', v_row.person_id,
      jsonb_build_object('code', coalesce(v_row.coupon_code, ''), 'edition', v_row.edition_name),
      'volunteer_profile', v_row.id);
    update volunteer_profile set reminded_at = now() where id = v_row.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
