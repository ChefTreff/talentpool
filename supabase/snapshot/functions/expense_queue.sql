create or replace function expense_queue(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, profile_id uuid, speaker_name text, email text, status text, amount_cents integer, amount_label text, positions jsonb, bank_masked text, bank_holder text, invoice_no text, invoice_asset_id uuid, submitted_at timestamp with time zone, reviewed_at timestamp with time zone, review_note text, sevdesk_ref text, sevdesk_sent_at timestamp with time zone, qonto_sent_at timestamp with time zone, paid_at timestamp with time zone, payment_ref text, currency text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_expense_approver() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select c.id, c.profile_id, btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
           (select pe.email::text from person_email pe where pe.person_id = p.id and pe.is_primary),
           c.status, c.amount_cents, fmt_cents(c.amount_cents, 'de'), c.positions, c.bank_masked, c.bank_holder, c.invoice_no, c.invoice_asset_id,
           c.submitted_at, c.reviewed_at, c.review_note, c.sevdesk_ref, c.sevdesk_sent_at, c.qonto_sent_at, c.paid_at, c.payment_ref, c.currency
    from expense_claim c
    join speaker_profile sp on sp.id = c.profile_id
    join person p on p.id = sp.person_id
    where c.status in ('submitted', 'approved', 'paid', 'rejected')
      and (p_edition_id is null or sp.edition_id = p_edition_id)
    order by case c.status when 'submitted' then 0 when 'approved' then 1 when 'rejected' then 2 else 3 end, c.submitted_at nulls last;
end $$;
