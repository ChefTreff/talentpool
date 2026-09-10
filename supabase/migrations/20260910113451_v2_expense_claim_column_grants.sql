-- 0032 · expense_claim: Spalten-Grants statt Tabellen-Grant.
-- In 0031 stand `revoke select (bank_secret_id)` neben `grant select on expense_claim`; ein Spalten-Revoke wirkt nicht gegen einen
-- Tabellen-Grant (Postgres-Regel), die Vault-ID blieb lesbar. Wie bei stage/slot/application/ticket: Tabellen-Grant weg, Spaltenliste.
-- Folge: `select *` auf expense_claim per PostgREST ist für authenticated nicht möglich; Lesewege sind die RPCs my_expense_claims/expense_queue.
set search_path = public, extensions;

revoke select on expense_claim from authenticated;
grant select (id, profile_id, status, currency, positions, amount_cents, bank_masked, bank_holder, invoice_no, invoice_asset_id,
              submitted_at, submitted_by, reviewed_by, reviewed_at, review_note, sevdesk_ref, sevdesk_sent_at, qonto_sent_at,
              paid_at, paid_by, payment_ref, created_at, updated_at) on expense_claim to authenticated;

select harden_definer_functions();
