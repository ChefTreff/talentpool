create or replace function tickets_unpersonalized(p_edition_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 500)
 RETURNS TABLE(ticket_id uuid, event_id uuid, event_name text, pass_type text, personalization_status text, buyer_email text, holder_first_name text, holder_last_name text, holder_company text, purchased_at timestamp with time zone, writeback_open boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not coalesce(has_admin_section('applications'), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select t.id, t.event_id, e.name, t.pass_type, t.personalization_status, t.buyer_email::text,
           t.holder_first_name, t.holder_last_name, t.holder_company, t.purchased_at, t.vivenu_writeback_pending
      from ticket t
      join event e on e.id = t.event_id
     where t.source = 'vivenu' and t.status = 'valid'
       and t.personalization_status in ('pending', 'partial')
       and (p_edition_id is null or t.event_id = p_edition_id)
     order by t.purchased_at nulls last, t.created_at
     limit least(greatest(coalesce(p_limit, 500), 1), 5000);
end $$;
