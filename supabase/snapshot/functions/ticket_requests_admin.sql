create or replace function ticket_requests_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, org_id uuid, org_name text, pass_type text, quantity integer, text text, status text, answer text, created_by_name text, created_at timestamp with time zone, answered_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select r.id, oe.org_id, coalesce(o.communication_name, o.legal_name), r.pass_type, r.quantity, r.text,
           r.status, r.answer, btrim(concat_ws(' ', p.first_name, p.last_name)), r.created_at, r.answered_at
      from shop_request r
      join org_edition oe on oe.id = r.org_edition_id
      join organization o on o.id = oe.org_id
      left join person p on p.id = r.created_by
     where r.pass_type is not null
       and (p_edition_id is null or oe.edition_id = p_edition_id)
     -- Offene zuerst: das ist, was jemand tun muss.
     order by (r.status = 'open') desc, r.created_at desc;
end $$;
