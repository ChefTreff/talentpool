-- =============================================================================
-- 0031 · v2 Reisekosten (Welle 2 A6): expense_claim, Belege, Bankdaten im Vault,
--        Einreichung mit Rechnungsnummer, Freigabe durch Program Lead, Mails
--   Regeln (Arbeitsauftrag A6, Entscheidungen Konrad 10.09.): Antrag nur mit
--   travel_costs_covered UND finaler Freigabe (travel_costs_approved_at); Assistenz darf
--   Positionen und Belege pflegen, aber weder Bankdaten anlegen noch einreichen; Bankdaten
--   ausschließlich im Supabase Vault (nur Maske und Kontoinhaber in der Tabelle), lesbar nur
--   für Admin/area_lead_speaker über expense_bank_details() mit Audit; Belegpflicht je Position;
--   Freigabe/Ablehnung/Auszahlung durch Admin oder area_lead_speaker (Paulina).
--   A6b (App): PDF-Auslagenrechnung, SevDesk-Beleg per API, Mail an QONTO_INBOX_EMAIL →
--   set_expense_integration() trägt die Referenzen ein.
-- =============================================================================
set search_path = public, extensions;

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order)
select v.vocabulary, v.key, v.label_de, v.label_en, v.sort_order from (values
  ('expense_category', 'train', 'Bahn', 'Train', 1),
  ('expense_category', 'flight', 'Flug', 'Flight', 2),
  ('expense_category', 'car', 'Auto (Kilometer)', 'Car (mileage)', 3),
  ('expense_category', 'local_transport', 'ÖPNV / Taxi', 'Public transport / taxi', 4),
  ('expense_category', 'hotel', 'Hotel', 'Hotel', 5),
  ('expense_category', 'other', 'Sonstiges', 'Other', 6)
) as v(vocabulary, key, label_de, label_en, sort_order)
where not exists (select 1 from vocab_term t where t.vocabulary = v.vocabulary and t.key = v.key);

-- Belege und Rechnungen laufen über denselben Bucket
alter table speaker_asset drop constraint if exists speaker_asset_kind_check;
alter table speaker_asset add constraint speaker_asset_kind_check check (kind in ('presentation', 'photo', 'other', 'receipt', 'invoice'));

create or replace function speaker_asset_path_allowed(p_name text) returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_profile uuid; v_edition uuid; v_sp speaker_profile%rowtype; v_me uuid := current_person_id();
begin
  if v_me is null or p_name is null then return false; end if;
  begin
    v_edition := split_part(p_name, '/', 1)::uuid;
    v_profile := split_part(p_name, '/', 2)::uuid;
  exception when others then return false; end;
  if split_part(p_name, '/', 3) not in ('presentation', 'photo', 'other', 'receipt', 'invoice') or split_part(p_name, '/', 4) = '' then return false; end if;
  select * into v_sp from speaker_profile where id = v_profile and edition_id = v_edition;
  if not found then return false; end if;
  -- Rechnungen schreibt nur das System (service_role); lesen dürfen Speaker/Assistenz und Team
  if split_part(p_name, '/', 3) = 'invoice' and not (v_sp.person_id = v_me or v_sp.assistant_person_id = v_me or is_expense_approver()) then return false; end if;
  return v_sp.person_id = v_me or v_sp.assistant_person_id = v_me or can_manage_speaker(v_profile) or is_staff();
end $$;

create or replace function is_expense_approver() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select has_role('admin') or has_role('area_lead_speaker')
$$;

-- register_speaker_asset: Arten erweitert; 'invoice' nur über das System
create or replace function register_speaker_asset(
  p_profile_id uuid, p_kind text, p_storage_path text, p_filename text,
  p_mime text default null, p_size_bytes bigint default null, p_session_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_me uuid := current_person_id(); v_sp speaker_profile%rowtype; v_version integer; v_late boolean := false; v_due timestamptz; v_id uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not (v_sp.person_id = v_me or v_sp.assistant_person_id = v_me or can_manage_speaker(p_profile_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_kind not in ('presentation', 'photo', 'other', 'receipt') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if p_storage_path not like v_sp.edition_id::text || '/' || p_profile_id::text || '/' || p_kind || '/%' then
    raise exception 'path_mismatch' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'speaker-assets' and o.name = p_storage_path) then
    raise exception 'object_not_found' using errcode = 'P0002';
  end if;
  if p_session_id is not null and not exists (select 1 from session_speaker ss where ss.session_id = p_session_id and ss.person_id = v_sp.person_id) then
    raise exception 'session_mismatch' using errcode = '22023';
  end if;
  if p_kind = 'presentation' and p_session_id is not null then
    v_due := (presentation_window(p_session_id)->>'effective_due')::timestamptz;
    v_late := v_due is not null and now() > v_due;
  end if;
  select coalesce(max(version), 0) + 1 into v_version
    from speaker_asset where profile_id = p_profile_id and kind = p_kind and coalesce(session_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_session_id, '00000000-0000-0000-0000-000000000000'::uuid);
  if p_kind in ('presentation', 'photo') then
    update speaker_asset set is_current = false
     where profile_id = p_profile_id and kind = p_kind and is_current
       and coalesce(session_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_session_id, '00000000-0000-0000-0000-000000000000'::uuid);
  end if;
  insert into speaker_asset (profile_id, session_id, kind, storage_path, filename, mime, size_bytes, version, late, uploaded_by)
  values (p_profile_id, p_session_id, p_kind, p_storage_path, p_filename, p_mime, p_size_bytes, v_version, v_late, v_me)
  returning id into v_id;
  if p_kind = 'photo' then update speaker_profile set photo_asset_id = v_id where id = p_profile_id; end if;
  perform log_audit('speaker.asset', 'speaker_profile', p_profile_id::text, null,
    jsonb_build_object('asset_id', v_id, 'kind', p_kind, 'version', v_version, 'late', v_late, 'session_id', p_session_id));
  return jsonb_build_object('id', v_id, 'version', v_version, 'late', v_late, 'effective_due', v_due);
end $$;

-- === expense_claim ===============================================================
create sequence if not exists expense_invoice_seq;

create table if not exists expense_claim (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references speaker_profile (id) on delete cascade,
  status           text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected', 'paid')),
  currency         text not null default 'EUR',
  positions        jsonb not null default '[]'::jsonb,      -- [{date, category, description, amount_cents, receipt_asset_id}]
  amount_cents     integer not null default 0 check (amount_cents >= 0),
  bank_secret_id   uuid,                                     -- vault.secrets.id: {iban, bic, holder}
  bank_masked      text,                                     -- z. B. DE****1234
  bank_holder      text,
  invoice_no       text unique,                              -- RK-2027-0001, vergeben bei Einreichung
  invoice_asset_id uuid references speaker_asset (id) on delete set null,
  submitted_at     timestamptz,
  submitted_by     uuid references person (id) on delete set null,
  reviewed_by      uuid references person (id) on delete set null,
  reviewed_at      timestamptz,
  review_note      text,
  sevdesk_ref      text,
  sevdesk_sent_at  timestamptz,
  qonto_sent_at    timestamptz,
  paid_at          timestamptz,
  paid_by          uuid references person (id) on delete set null,
  payment_ref      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists expense_claim_profile_idx on expense_claim (profile_id, status);
create index if not exists expense_claim_status_idx on expense_claim (status, submitted_at);
comment on table expense_claim is 'Reisekostenanträge der Speaker. Bankdaten nur im Vault (bank_secret_id), hier nur Maske und Kontoinhaber.';
drop trigger if exists trg_expense_claim_updated on expense_claim;
create trigger trg_expense_claim_updated before update on expense_claim for each row execute function set_updated_at();
alter table expense_claim enable row level security;
drop policy if exists ec_read on expense_claim;
create policy ec_read on expense_claim for select to authenticated using (
  exists (select 1 from speaker_profile sp where sp.id = profile_id and (sp.person_id = current_person_id() or sp.assistant_person_id = current_person_id()))
  or is_expense_approver());
revoke all on expense_claim from anon;
revoke insert, update, delete on expense_claim from authenticated;
revoke select (bank_secret_id) on expense_claim from authenticated;   -- die Vault-ID hat im Client nichts verloren
grant select on expense_claim to authenticated;
grant all on expense_claim to service_role;

-- === Helfer ====================================================================
create or replace function iban_valid(p_iban text) returns boolean
language plpgsql immutable as $$
declare v text := upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g')); r text := ''; c text; i integer; chunk text := '';
begin
  if length(v) < 15 or length(v) > 34 or v !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]+$' then return false; end if;
  v := substr(v, 5) || substr(v, 1, 4);
  for i in 1..length(v) loop
    c := substr(v, i, 1);
    if c between 'A' and 'Z' then r := r || (ascii(c) - 55)::text; else r := r || c; end if;
  end loop;
  for i in 1..length(r) loop
    chunk := chunk || substr(r, i, 1);
    if length(chunk) >= 9 then chunk := (chunk::bigint % 97)::text; end if;
  end loop;
  return (chunk::bigint % 97) = 1;
end $$;

create or replace function fmt_cents(p_cents integer, p_locale text) returns text
language sql immutable as $$
  select case when p_locale = 'de'
              then translate(to_char(coalesce(p_cents, 0) / 100.0, 'FM9G999G999G990D00'), ',.', '.,') || ' €'
              else '€' || to_char(coalesce(p_cents, 0) / 100.0, 'FM9G999G999G990D00') end
$$;

create or replace function expense_eligibility(p_profile_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_reason text;
begin
  select * into v_sp from speaker_profile where id = coalesce(p_profile_id, my_speaker_profile_id(null));
  if not found then return null; end if;
  if not (v_sp.person_id = v_me or v_sp.assistant_person_id = v_me or can_manage_speaker(v_sp.id) or is_expense_approver()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_reason := case when not v_sp.travel_costs_covered then 'not_covered' when v_sp.travel_costs_approved_at is null then 'not_approved' end;
  return jsonb_build_object('eligible', v_reason is null, 'reason', v_reason, 'covered', v_sp.travel_costs_covered,
                            'approved', v_sp.travel_costs_approved_at is not null, 'is_assistant', v_sp.person_id <> v_me,
                            'open_claim', (select c.id from expense_claim c where c.profile_id = v_sp.id and c.status in ('draft', 'submitted', 'approved', 'rejected') order by c.created_at desc limit 1));
end $$;

create or replace function validate_expense_positions(p_positions jsonb, p_profile_id uuid) returns integer
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_sum integer := 0; x jsonb; v_amt integer; v_receipt uuid; v_n integer := 0;
begin
  if p_positions is null or jsonb_typeof(p_positions) <> 'array' then raise exception 'invalid_positions' using errcode = '22023'; end if;
  for x in select value from jsonb_array_elements(p_positions) loop
    v_n := v_n + 1;
    if jsonb_typeof(x) <> 'object' then raise exception 'invalid_positions' using errcode = '22023'; end if;
    v_amt := nullif(x->>'amount_cents', '')::integer;
    if v_amt is null or v_amt <= 0 or v_amt > 500000 then raise exception 'invalid_amount' using errcode = '22023', detail = 'position ' || v_n::text; end if;
    if not is_vocab_key('expense_category', coalesce(x->>'category', '')) then raise exception 'invalid_category' using errcode = '22023', detail = coalesce(x->>'category', ''); end if;
    if nullif(x->>'date', '') is null then raise exception 'date_required' using errcode = '22023', detail = 'position ' || v_n::text; end if;
    perform (x->>'date')::date;
    if length(coalesce(x->>'description', '')) > 200 then raise exception 'description_too_long' using errcode = '22023'; end if;
    v_receipt := nullif(x->>'receipt_asset_id', '')::uuid;
    if v_receipt is not null and not exists (select 1 from speaker_asset a where a.id = v_receipt and a.profile_id = p_profile_id and a.kind = 'receipt') then
      raise exception 'receipt_not_found' using errcode = 'P0002';
    end if;
    v_sum := v_sum + v_amt;
  end loop;
  if v_n > 50 then raise exception 'too_many_positions' using errcode = '22023'; end if;
  return v_sum;
end $$;

-- === Speaker/Assistenz ===========================================================
create or replace function my_expense_claims()
returns table (id uuid, status text, currency text, positions jsonb, amount_cents integer, amount_label text, bank_masked text, bank_holder text, has_bank boolean,
               invoice_no text, invoice_asset_id uuid, submitted_at timestamptz, reviewed_at timestamptz, review_note text, paid_at timestamptz,
               created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_assist boolean; v_locale text;
begin
  select * into v_sp from speaker_profile where id = my_speaker_profile_id(null);
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

-- Entwurf anlegen/ändern (Speaker oder Assistenz). Ein offener Entwurf je Profil; abgelehnte Anträge werden beim Ändern wieder Entwurf.
create or replace function upsert_expense_claim(p_data jsonb) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_id uuid := nullif(p_data->>'id', '')::uuid; v_c expense_claim%rowtype; v_sum integer; v_elig jsonb;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile where id = my_speaker_profile_id(null);
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  v_elig := expense_eligibility(v_sp.id);
  if not (v_elig->>'eligible')::boolean then raise exception 'not_eligible' using errcode = 'P0001', detail = v_elig->>'reason'; end if;
  if not (p_data ? 'positions') then raise exception 'positions_required' using errcode = '22023'; end if;
  v_sum := validate_expense_positions(p_data->'positions', v_sp.id);
  if v_id is null then
    select * into v_c from expense_claim where profile_id = v_sp.id and status in ('draft', 'rejected') order by created_at desc limit 1 for update;
    if found then v_id := v_c.id; end if;
  else
    select * into v_c from expense_claim where id = v_id and profile_id = v_sp.id for update;
    if not found then raise exception 'claim_not_found' using errcode = 'P0002'; end if;
    if v_c.status not in ('draft', 'rejected') then raise exception 'not_editable' using errcode = 'P0001', detail = v_c.status; end if;
  end if;
  if v_id is null then
    insert into expense_claim (profile_id, positions, amount_cents) values (v_sp.id, p_data->'positions', v_sum) returning id into v_id;
  else
    update expense_claim set positions = p_data->'positions', amount_cents = v_sum, status = 'draft', review_note = null where id = v_id;
  end if;
  perform log_audit('expense.upsert', 'expense_claim', v_id::text, null, jsonb_build_object('positions', jsonb_array_length(p_data->'positions'), 'amount_cents', v_sum, 'by_assistant', v_sp.person_id <> v_me));
  return v_id;
end $$;

-- Bankdaten: nur der Speaker selbst, nur im Vault
create or replace function set_expense_bank_details(p_claim_id uuid, p_iban text, p_bic text default null, p_holder text default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_c expense_claim%rowtype; v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_iban text; v_bic text; v_holder text; v_secret text; v_sid uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_c from expense_claim where id = p_claim_id for update;
  if not found then raise exception 'claim_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_c.profile_id;
  if v_sp.person_id <> v_me then raise exception 'not allowed' using errcode = '42501', detail = 'speaker_only'; end if;
  if v_c.status not in ('draft', 'rejected') then raise exception 'not_editable' using errcode = 'P0001', detail = v_c.status; end if;
  v_iban := upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g'));
  if not iban_valid(v_iban) then raise exception 'invalid_iban' using errcode = '22023'; end if;
  v_bic := nullif(upper(regexp_replace(coalesce(p_bic, ''), '\s', '', 'g')), '');
  if v_bic is not null and v_bic !~ '^[A-Z0-9]{8}([A-Z0-9]{3})?$' then raise exception 'invalid_bic' using errcode = '22023'; end if;
  v_holder := nullif(btrim(coalesce(p_holder, '')), '');
  if v_holder is null or length(v_holder) < 2 then raise exception 'holder_required' using errcode = '22023'; end if;
  v_secret := jsonb_build_object('iban', v_iban, 'bic', v_bic, 'holder', v_holder)::text;
  if v_c.bank_secret_id is null then
    v_sid := vault.create_secret(v_secret, 'expense_bank:' || p_claim_id::text, 'Bankdaten Reisekostenantrag ' || p_claim_id::text);
  else
    perform vault.update_secret(v_c.bank_secret_id, v_secret);
    v_sid := v_c.bank_secret_id;
  end if;
  update expense_claim set bank_secret_id = v_sid, bank_masked = substr(v_iban, 1, 2) || '****' || right(v_iban, 4), bank_holder = v_holder where id = p_claim_id;
  perform log_audit('expense.bank_set', 'expense_claim', p_claim_id::text, null, jsonb_build_object('masked', substr(v_iban, 1, 2) || '****' || right(v_iban, 4)));
end $$;

-- Einreichen: nur der Speaker; Belegpflicht je Position; Bankdaten müssen vorliegen; Rechnungsnummer; Mail an Freigeber
create or replace function submit_expense(p_claim_id uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_c expense_claim%rowtype; v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_elig jsonb; v_no text; r record; v_notified integer := 0; v_speaker text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_c from expense_claim where id = p_claim_id for update;
  if not found then raise exception 'claim_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_c.profile_id;
  if v_sp.person_id <> v_me then raise exception 'not allowed' using errcode = '42501', detail = 'speaker_only'; end if;
  if v_c.status not in ('draft', 'rejected') then raise exception 'not_editable' using errcode = 'P0001', detail = v_c.status; end if;
  v_elig := expense_eligibility(v_sp.id);
  if not (v_elig->>'eligible')::boolean then raise exception 'not_eligible' using errcode = 'P0001', detail = v_elig->>'reason'; end if;
  if jsonb_array_length(v_c.positions) = 0 then raise exception 'positions_required' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(v_c.positions) x where nullif(x->>'receipt_asset_id', '') is null) then
    raise exception 'receipt_required' using errcode = 'P0001';
  end if;
  if v_c.bank_secret_id is null then raise exception 'bank_required' using errcode = 'P0001'; end if;
  v_no := coalesce(v_c.invoice_no, 'RK-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('expense_invoice_seq')::text, 4, '0'));
  update expense_claim set status = 'submitted', submitted_at = now(), submitted_by = v_me, invoice_no = v_no, review_note = null where id = p_claim_id;
  select btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) into v_speaker from person p where p.id = v_sp.person_id;
  for r in
    select distinct ra.person_id from role_assignment ra
    where ra.role = 'area_lead_speaker' and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())
  loop
    perform queue_mail('expense_submitted', r.person_id, jsonb_build_object('speaker_name', v_speaker, 'amount', fmt_cents(v_c.amount_cents, 'de'), 'positions', jsonb_array_length(v_c.positions), 'invoice_no', v_no), 'expense_claim', p_claim_id);
    v_notified := v_notified + 1;
  end loop;
  if v_notified = 0 then
    for r in
      select distinct ra.person_id from role_assignment ra
      where ra.role = 'admin' and ra.scope_type = 'global' and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())
    loop
      perform queue_mail('expense_submitted', r.person_id, jsonb_build_object('speaker_name', v_speaker, 'amount', fmt_cents(v_c.amount_cents, 'de'), 'positions', jsonb_array_length(v_c.positions), 'invoice_no', v_no), 'expense_claim', p_claim_id);
    end loop;
  end if;
  perform log_audit('expense.submit', 'expense_claim', p_claim_id::text, null, jsonb_build_object('invoice_no', v_no, 'amount_cents', v_c.amount_cents));
  return v_no;
end $$;

-- === Freigeber (Admin / Program Lead) ===================================================
create or replace function expense_queue(p_edition_id uuid default null)
returns table (id uuid, profile_id uuid, speaker_name text, email text, status text, amount_cents integer, amount_label text, positions jsonb,
               bank_masked text, bank_holder text, invoice_no text, invoice_asset_id uuid, submitted_at timestamptz, reviewed_at timestamptz, review_note text,
               sevdesk_ref text, sevdesk_sent_at timestamptz, qonto_sent_at timestamptz, paid_at timestamptz, payment_ref text)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_expense_approver() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select c.id, c.profile_id, btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
           (select pe.email::text from person_email pe where pe.person_id = p.id and pe.is_primary),
           c.status, c.amount_cents, fmt_cents(c.amount_cents, 'de'), c.positions, c.bank_masked, c.bank_holder, c.invoice_no, c.invoice_asset_id,
           c.submitted_at, c.reviewed_at, c.review_note, c.sevdesk_ref, c.sevdesk_sent_at, c.qonto_sent_at, c.paid_at, c.payment_ref
    from expense_claim c
    join speaker_profile sp on sp.id = c.profile_id
    join person p on p.id = sp.person_id
    where c.status in ('submitted', 'approved', 'paid', 'rejected')
      and (p_edition_id is null or sp.edition_id = p_edition_id)
    order by case c.status when 'submitted' then 0 when 'approved' then 1 when 'rejected' then 2 else 3 end, c.submitted_at nulls last;
end $$;

-- Bankdaten entschlüsselt lesen: nur Freigeber, immer im Audit
create or replace function expense_bank_details(p_claim_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
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

create or replace function approve_expense(p_claim_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_c expense_claim%rowtype; v_sp speaker_profile%rowtype; v_locale text;
begin
  if not is_expense_approver() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_c from expense_claim where id = p_claim_id for update;
  if not found then raise exception 'claim_not_found' using errcode = 'P0002'; end if;
  if v_c.status <> 'submitted' then raise exception 'not_pending' using errcode = 'P0001', detail = v_c.status; end if;
  select * into v_sp from speaker_profile where id = v_c.profile_id;
  update expense_claim set status = 'approved', reviewed_by = current_person_id(), reviewed_at = now(), review_note = nullif(btrim(p_note), '') where id = p_claim_id;
  select coalesce(p.preferred_language, 'en') into v_locale from person p where p.id = v_sp.person_id;
  perform queue_mail('expense_approved', v_sp.person_id, jsonb_build_object('amount', fmt_cents(v_c.amount_cents, v_locale), 'invoice_no', v_c.invoice_no, 'note', coalesce(p_note, '')), 'expense_claim', p_claim_id);
  perform log_audit('expense.approve', 'expense_claim', p_claim_id::text, jsonb_build_object('status', v_c.status), jsonb_build_object('status', 'approved', 'note', p_note));
end $$;

create or replace function reject_expense(p_claim_id uuid, p_note text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_c expense_claim%rowtype; v_sp speaker_profile%rowtype; v_locale text;
begin
  if not is_expense_approver() then raise exception 'not allowed' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'note_required' using errcode = '22023'; end if;
  select * into v_c from expense_claim where id = p_claim_id for update;
  if not found then raise exception 'claim_not_found' using errcode = 'P0002'; end if;
  if v_c.status <> 'submitted' then raise exception 'not_pending' using errcode = 'P0001', detail = v_c.status; end if;
  select * into v_sp from speaker_profile where id = v_c.profile_id;
  update expense_claim set status = 'rejected', reviewed_by = current_person_id(), reviewed_at = now(), review_note = btrim(p_note) where id = p_claim_id;
  select coalesce(p.preferred_language, 'en') into v_locale from person p where p.id = v_sp.person_id;
  perform queue_mail('expense_rejected', v_sp.person_id, jsonb_build_object('amount', fmt_cents(v_c.amount_cents, v_locale), 'invoice_no', v_c.invoice_no, 'note', btrim(p_note)), 'expense_claim', p_claim_id);
  perform log_audit('expense.reject', 'expense_claim', p_claim_id::text, jsonb_build_object('status', v_c.status), jsonb_build_object('status', 'rejected', 'note', p_note));
end $$;

create or replace function mark_expense_paid(p_claim_id uuid, p_payment_ref text default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_c expense_claim%rowtype;
begin
  if not is_expense_approver() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_c from expense_claim where id = p_claim_id for update;
  if not found then raise exception 'claim_not_found' using errcode = 'P0002'; end if;
  if v_c.status <> 'approved' then raise exception 'not_approved' using errcode = 'P0001', detail = v_c.status; end if;
  update expense_claim set status = 'paid', paid_at = now(), paid_by = current_person_id(), payment_ref = nullif(btrim(p_payment_ref), '') where id = p_claim_id;
  perform log_audit('expense.paid', 'expense_claim', p_claim_id::text, null, jsonb_build_object('payment_ref', p_payment_ref));
end $$;

-- Integrationsergebnis (A6b): PDF-Asset, SevDesk-Referenz, Qonto-Versand. Service-Role (Route Handler) oder Freigeber.
create or replace function set_expense_integration(p_claim_id uuid, p_invoice_asset_id uuid default null, p_sevdesk_ref text default null, p_qonto_sent boolean default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is not null and not is_expense_approver() then raise exception 'not allowed' using errcode = '42501'; end if;
  update expense_claim set
    invoice_asset_id = coalesce(p_invoice_asset_id, invoice_asset_id),
    sevdesk_ref      = coalesce(nullif(btrim(p_sevdesk_ref), ''), sevdesk_ref),
    sevdesk_sent_at  = case when nullif(btrim(p_sevdesk_ref), '') is not null then now() else sevdesk_sent_at end,
    qonto_sent_at    = case when coalesce(p_qonto_sent, false) then now() else qonto_sent_at end
  where id = p_claim_id;
  if not found then raise exception 'claim_not_found' using errcode = 'P0002'; end if;
  insert into audit_log (actor_person_id, actor_auth_uid, action, object_type, object_id, after)
  values (current_person_id(), auth.uid(), 'expense.integration', 'expense_claim', p_claim_id::text,
          jsonb_build_object('invoice_asset_id', p_invoice_asset_id, 'sevdesk_ref', p_sevdesk_ref, 'qonto_sent', p_qonto_sent));
end $$;
revoke execute on function set_expense_integration(uuid, uuid, text, boolean) from public, anon;

-- === Mail-Vorlagen ==============================================================
insert into mail_template (key, locale, version, subject, body_md, description, active)
select v.key, v.locale, v.version, v.subject, v.body_md, v.description, v.active from (values
  ('expense_submitted', 'de', 1, 'Reisekostenantrag {{invoice_no}} von {{speaker_name}}',
   E'Hallo {{first_name}},\n\n**{{speaker_name}}** hat einen Reisekostenantrag eingereicht: **{{amount}}** in {{positions}} Position(en), Nummer {{invoice_no}}.\n\nBitte prüfen und freigeben: [Reisekosten]({{portal_url}}/admin/reisekosten)\n\nChefTreff-Portal',
   'Intern: neuer Reisekostenantrag (an area_lead_speaker)', true),
  ('expense_submitted', 'en', 1, 'Expense claim {{invoice_no}} from {{speaker_name}}',
   E'Hi {{first_name}},\n\n**{{speaker_name}}** submitted an expense claim: **{{amount}}** in {{positions}} item(s), number {{invoice_no}}.\n\nPlease review: [Expenses]({{portal_url}}/admin/reisekosten)\n\nChefTreff portal',
   'Internal: new expense claim', true),
  ('expense_approved', 'en', 1, 'Your expense claim {{invoice_no}} is approved',
   E'Hi {{first_name}},\n\nyour expense claim **{{invoice_no}}** for **{{amount}}** has been approved. The reimbursement will be transferred to the account you provided.\n\n{{note}}\n\nDetails in the portal: [Expenses]({{portal_url}}/speaker/reisekosten)\n\nBest,\nChefTreff',
   'Expense claim approved', true),
  ('expense_approved', 'de', 1, 'Dein Reisekostenantrag {{invoice_no}} ist freigegeben',
   E'Hallo {{first_name}},\n\ndein Reisekostenantrag **{{invoice_no}}** über **{{amount}}** ist freigegeben. Die Erstattung geht auf das von dir angegebene Konto.\n\n{{note}}\n\nDetails im Portal: [Reisekosten]({{portal_url}}/speaker/reisekosten)\n\nViele Grüße\nChefTreff',
   'Reisekostenantrag freigegeben', true),
  ('expense_rejected', 'en', 1, 'Your expense claim {{invoice_no}} needs changes',
   E'Hi {{first_name}},\n\nwe could not approve your expense claim **{{invoice_no}}** ({{amount}}) as submitted:\n\n{{note}}\n\nYou can edit and resubmit it in the portal: [Expenses]({{portal_url}}/speaker/reisekosten)\n\nBest,\nChefTreff',
   'Expense claim rejected', true),
  ('expense_rejected', 'de', 1, 'Dein Reisekostenantrag {{invoice_no}} braucht Änderungen',
   E'Hallo {{first_name}},\n\ndeinen Reisekostenantrag **{{invoice_no}}** ({{amount}}) konnten wir so nicht freigeben:\n\n{{note}}\n\nDu kannst ihn im Portal ändern und erneut einreichen: [Reisekosten]({{portal_url}}/speaker/reisekosten)\n\nViele Grüße\nChefTreff',
   'Reisekostenantrag abgelehnt', true)
) as v(key, locale, version, subject, body_md, description, active)
where not exists (select 1 from mail_template t where t.key = v.key and t.locale = v.locale);

select harden_definer_functions();
