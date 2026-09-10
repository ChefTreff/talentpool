-- 0039 · Nachbesserungen aus dem B8-Review (PR #12): expense_bank_details war STABLE und schrieb ein Audit — in PostgREST-Lesetransaktionen 25006,
-- Funktion damit unbenutzbar ⇒ VOLATILE. Speaker/Assistenz dürfen den invoice/-Pfad im Bucket nicht mehr beschreiben (nur lesen; die Ablage
-- macht die Freigabe mit service_role), sonst könnte nach der Freigabe eine andere Datei untergeschoben werden. expense_queue liefert currency.
set search_path = public, extensions;

create or replace function expense_bank_details(p_claim_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_c expense_claim%rowtype; v_secret text;
begin
  if not is_expense_approver() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_c from expense_claim where id = p_claim_id;
  if not found then raise exception 'claim_not_found' using errcode = 'P0002'; end if;
  if v_c.bank_secret_id is null then return null; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where id = v_c.bank_secret_id;
  perform log_audit('expense.bank_view', 'expense_claim', p_claim_id::text, null, null);
  return v_secret::jsonb;
end $$;

drop policy if exists "speaker assets insert" on storage.objects;
create policy "speaker assets insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'speaker-assets' and speaker_asset_path_allowed(name) and split_part(name, '/', 3) <> 'invoice');
drop policy if exists "speaker assets update" on storage.objects;
create policy "speaker assets update" on storage.objects for update to authenticated
  using (bucket_id = 'speaker-assets' and speaker_asset_path_allowed(name) and split_part(name, '/', 3) <> 'invoice')
  with check (bucket_id = 'speaker-assets' and speaker_asset_path_allowed(name) and split_part(name, '/', 3) <> 'invoice');
drop policy if exists "speaker assets delete" on storage.objects;
create policy "speaker assets delete" on storage.objects for delete to authenticated
  using (bucket_id = 'speaker-assets' and speaker_asset_path_allowed(name) and split_part(name, '/', 3) <> 'invoice');

drop function if exists expense_queue(uuid);
create function expense_queue(p_edition_id uuid default null)
returns table (id uuid, profile_id uuid, speaker_name text, email text, status text, amount_cents integer, amount_label text, positions jsonb,
               bank_masked text, bank_holder text, invoice_no text, invoice_asset_id uuid, submitted_at timestamptz, reviewed_at timestamptz, review_note text,
               sevdesk_ref text, sevdesk_sent_at timestamptz, qonto_sent_at timestamptz, paid_at timestamptz, payment_ref text, currency text)
language plpgsql stable security definer set search_path = public, extensions as $$
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

select harden_definer_functions();
