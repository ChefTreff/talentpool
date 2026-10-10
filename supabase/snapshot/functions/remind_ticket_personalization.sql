create or replace function remind_ticket_personalization()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_row record; v_n integer := 0;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  for v_row in
    select g.person_id, g.tx, g.edition_name, count(*)::integer as n, array_agg(g.id) as ids
      from (
        select t.id, t.vivenu_transaction_id as tx, ed.name as edition_name,
               (select pe.person_id from person_email pe join person p on p.id = pe.person_id and p.deleted_at is null
                 where pe.email = t.buyer_email order by pe.is_primary desc, pe.created_at limit 1) as person_id
          from ticket t
          join event te on te.id = t.event_id
          join event ed on ed.id = coalesce(te.edition_id, te.id)
         where t.source = 'vivenu' and t.status = 'valid'
           and t.personalization_status in ('pending', 'partial')
           and t.personalization_reminded_at is null
           and coalesce(t.purchased_at, t.created_at) < now() - interval '7 days'
           and coalesce(ed.end_date, ed.start_date, now()::date + 1) >= now()::date
      ) g
     where g.person_id is not null
     group by g.person_id, g.tx, g.edition_name
  loop
    perform queue_mail('ticket_personalization_reminder', v_row.person_id,
      jsonb_build_object('edition', v_row.edition_name, 'n', v_row.n,
                         'link_path', case when v_row.tx is not null and v_row.tx ~ '^[A-Za-z0-9_-]{1,120}$'
                                           then '/tickets/bestaetigung?transactionId=' || v_row.tx else '/tickets' end),
      'ticket', v_row.ids[1]);
    update ticket set personalization_reminded_at = now() where id = any(v_row.ids);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
