-- 0033 · my_expense_claims: Tabellenspalte qualifizieren. In plpgsql-Tabellenfunktionen kollidiert die Ausgabespalte `id`
-- mit der unqualifizierten Spalte in `where id = …` (42702). Gleiche Lektion wie 0026/0030.
set search_path = public, extensions;

create or replace function my_expense_claims()
returns table (id uuid, status text, currency text, positions jsonb, amount_cents integer, amount_label text, bank_masked text, bank_holder text, has_bank boolean,
               invoice_no text, invoice_asset_id uuid, submitted_at timestamptz, reviewed_at timestamptz, review_note text, paid_at timestamptz,
               created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_assist boolean; v_locale text;
begin
  select sp.* into v_sp from speaker_profile sp where sp.id = my_speaker_profile_id(null);
  if not found then return; end if;
  v_assist := v_sp.person_id <> v_me;
  select coalesce(p.preferred_language, 'en') into v_locale from person p where p.id = v_me;
  return query
    select c.id, c.status, c.currency, c.positions, c.amount_cents, fmt_cents(c.amount_cents, v_locale),
           case when v_assist then null else c.bank_masked end, case when v_assist then null else c.bank_holder end, (c.bank_secret_id is not null),
           c.invoice_no, c.invoice_asset_id, c.submitted_at, c.reviewed_at, c.review_note, c.paid_at, c.created_at, c.updated_at
    from expense_claim c where c.profile_id = v_sp.id
    order by c.created_at desc;
end $$;

select harden_definer_functions();
