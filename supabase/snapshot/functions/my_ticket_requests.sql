create or replace function my_ticket_requests(p_org_id uuid, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, pass_type text, quantity integer, status text, answer text, created_at timestamp with time zone, answered_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition;
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  return query
    select r.id, r.pass_type, r.quantity, r.status, r.answer, r.created_at, r.answered_at
      from shop_request r
     where r.org_edition_id = v_oe.id and r.pass_type is not null
     order by r.created_at desc;
end $$;
