-- 0147 · Welle 6 · Reisekosten als Pauschale oder per Beleg (SPK-042)
--
-- Nummer 0147 von der Architektur-Session zugeteilt (23.09.). Vorschlag der
-- Build-Session Speaker-Domäne; Anwenden, Umbenennen und der Eintrag ins
-- Entscheidungslog gehören ihr.
--
-- Anlass: Konrad am 22.09. — „So haben wir zwei Arten von Deals. Entweder eine
-- feste Summe, die pauschal abgerechnet wird. Die muss dann vom Stage Lead im
-- Speaker-Admin gesetzt werden und darf vom Speaker nicht verändert werden.
-- Oder die Übernahme per Beleg."
--
-- **Der Betrag steht in Cent** (Auflage der Architektur-Session): Geld in
-- Fliesskomma zu rechnen geht so lange gut, bis es das nicht mehr tut.
--
-- **Beim Wechsel auf Pauschale wird nichts gelöscht**, nur die Erfassung
-- gesperrt (ebenfalls Auflage). Wer schon Belege erfasst hat und danach eine
-- Pauschale bekommt, behält sie im Antrag stehen — sie verschwinden zu lassen
-- wäre ein stiller Datenverlust, und die Entscheidung, was damit passiert,
-- gehört dem Team, nicht einer Migration.
--
-- **Gesperrt wird die Erfassung, nicht der Antrag.** Naheliegend wäre, in
-- `expense_eligibility` einfach `eligible = false` zu setzen — dann wiesen
-- `upsert_expense_claim` und `submit_expense` von selbst ab. Das wäre falsch:
-- die **Bankverbindung hängt am Antrag** (`expense_claim.bank_secret_id`), und
-- ohne Antrag gäbe es keinen Ort für die IBAN, an die wir die Pauschale
-- überweisen. Also bleibt der Antrag erlaubt; abgewiesen werden **Positionen**.
--
-- Gesetzt wird die Art im Speaker-Admin (`/admin/speaker/…`, „Admin zuerst"),
-- beim Speaker ist sie nur lesbar.

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order) values
  ('expense_mode', 'receipts', 'Übernahme per Beleg', 'Reimbursed against receipts', 1),
  ('expense_mode', 'lump_sum', 'Pauschale',           'Lump sum',                    2)
on conflict (vocabulary, key) do nothing;

alter table speaker_profile
  add column if not exists expense_mode text not null default 'receipts',
  add column if not exists expense_lump_sum_cents integer;

comment on column speaker_profile.expense_mode is
  'Wie Reisekosten abgerechnet werden: receipts oder lump_sum (Vokabular expense_mode, SPK-042).';
comment on column speaker_profile.expense_lump_sum_cents is
  'Pauschalbetrag in Cent. Pflicht bei lump_sum, sonst leer.';

alter table speaker_profile drop constraint if exists speaker_expense_mode_chk;
alter table speaker_profile add constraint speaker_expense_mode_chk check (
  (expense_mode = 'receipts' and expense_lump_sum_cents is null)
  or (expense_mode = 'lump_sum' and expense_lump_sum_cents is not null and expense_lump_sum_cents >= 0)
);

-- ------------------------------------------------------- setzen darf das Team
create or replace function set_expense_mode(
  p_profile_id uuid, p_mode text, p_amount_cents integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype;
begin
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;

  -- Das Speaker-Team oder die betreuende Person („Stage Lead", Konrad 22.09.).
  -- `coalesce`, weil `can_manage_speaker` für Fremde NULL liefern kann und
  -- `if not NULL` dann nicht auslöst (Lehre aus 0118).
  if not coalesce(is_speaker_team(null) or can_manage_speaker(p_profile_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not is_vocab_key('expense_mode', p_mode) then
    raise exception 'invalid_expense_mode' using errcode = '22023', detail = coalesce(p_mode, 'null');
  end if;
  if p_mode = 'lump_sum' and (p_amount_cents is null or p_amount_cents < 0) then
    raise exception 'lump_sum_amount_required' using errcode = '22023';
  end if;

  update speaker_profile
     set expense_mode = p_mode,
         expense_lump_sum_cents = case when p_mode = 'lump_sum' then p_amount_cents else null end
   where id = p_profile_id;

  perform log_audit('speaker.expense_mode', 'speaker_profile', p_profile_id::text,
    jsonb_build_object('mode', v_sp.expense_mode, 'amount_cents', v_sp.expense_lump_sum_cents),
    jsonb_build_object('mode', p_mode, 'amount_cents',
                       case when p_mode = 'lump_sum' then p_amount_cents else null end));
end $$;

revoke all on function set_expense_mode(uuid, text, integer) from public, anon;
grant execute on function set_expense_mode(uuid, text, integer) to authenticated;

-- --------------------------------------------- die Art steht in der Auskunft
-- Aus dem Snapshot; neu sind `mode` und `lump_sum_cents`. `eligible` bleibt
-- absichtlich unberührt (siehe Kopf).
create or replace function expense_eligibility(p_profile_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_reason text;
begin
  select * into v_sp from speaker_profile where id = coalesce(p_profile_id, my_speaker_profile_id(null));
  if not found then return null; end if;
  if not coalesce((v_sp.person_id = v_me or v_sp.assistant_person_id = v_me or can_manage_speaker(v_sp.id) or is_expense_approver()), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_reason := case when not v_sp.travel_costs_covered then 'not_covered' when v_sp.travel_costs_approved_at is null then 'not_approved' end;
  return jsonb_build_object('eligible', v_reason is null, 'reason', v_reason, 'covered', v_sp.travel_costs_covered,
                            'approved', v_sp.travel_costs_approved_at is not null, 'is_assistant', v_sp.person_id <> v_me,
                            'mode', v_sp.expense_mode,
                            'lump_sum_cents', v_sp.expense_lump_sum_cents,
                            'open_claim', (select c.id from expense_claim c where c.profile_id = v_sp.id and c.status in ('draft', 'submitted', 'approved', 'rejected') order by c.created_at desc limit 1));
end $$;

-- ------------------------------------- bei Pauschale keine Positionen mehr
-- Aus dem Snapshot; neu ist die Sperre und der Betrag aus der Pauschale.
create or replace function upsert_expense_claim(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_id uuid := nullif(p_data->>'id', '')::uuid; v_c expense_claim%rowtype; v_sum integer; v_elig jsonb;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile where id = my_speaker_profile_id(null);
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  v_elig := expense_eligibility(v_sp.id);
  if not (v_elig->>'eligible')::boolean then raise exception 'not_eligible' using errcode = 'P0001', detail = v_elig->>'reason'; end if;
  if not (p_data ? 'positions') then raise exception 'positions_required' using errcode = '22023'; end if;

  if v_sp.expense_mode = 'lump_sum' then
    -- Die Pauschale steht fest; Positionen wären eine zweite Rechnung daneben.
    -- Ein leeres Feld bleibt erlaubt, weil der Antrag die Bankverbindung trägt.
    if jsonb_array_length(coalesce(p_data->'positions', '[]'::jsonb)) > 0 then
      raise exception 'lump_sum_no_positions' using errcode = '22023';
    end if;
    v_sum := coalesce(v_sp.expense_lump_sum_cents, 0);
  else
    v_sum := validate_expense_positions(p_data->'positions', v_sp.id);
  end if;

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

-- ------------------------------------- die Art steht auch im Speaker-Admin
-- Aus dem Snapshot; neu sind die beiden Felder. Ohne sie saehe das Team im
-- Detail nicht, was es selbst gesetzt hat.
create or replace function speaker_detail(p_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_p person%rowtype; v_team boolean;
begin
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not can_manage_speaker(p_profile_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_p from person where id = v_sp.person_id;
  v_team := is_speaker_team(v_sp.edition_id);

  return jsonb_build_object(
    -- Der Kontakt ohne Portalzugang (0127) ist genau fuer das Team da: es
    -- soll wissen, wen es statt der Speakerin anschreibt.
    'contact', case when v_sp.contact_first_name is null and v_sp.contact_last_name is null
                     and v_sp.contact_email is null and v_sp.contact_phone is null
                    then null
                    else jsonb_build_object(
                      'first_name', v_sp.contact_first_name, 'last_name', v_sp.contact_last_name,
                      'email', v_sp.contact_email, 'phone', v_sp.contact_phone,
                      'kind', v_sp.contact_kind, 'consent_at', v_sp.contact_consent_at) end,
    'id', v_sp.id,
    'edition_id', v_sp.edition_id,
    'person', jsonb_build_object(
      'id', v_p.id, 'first_name', v_p.first_name, 'last_name', v_p.last_name, 'title', v_p.title,
      'email', (select pe.email::text from person_email pe where pe.person_id = v_p.id and pe.is_primary),
      'preferred_language', v_p.preferred_language,
      'salutation_de', v_p.salutation_de, 'salutation_en', v_p.salutation_en,
      'has_account', v_p.auth_user_id is not null),
    'speaker_type', v_sp.speaker_type,
    'pipeline_status', v_sp.pipeline_status,
    'confirmed_at', v_sp.confirmed_at,
    'declined_at', v_sp.declined_at,
    'decline_reason', v_sp.decline_reason,
    'invited_at', v_sp.invited_at,
    'owner_person_id', v_sp.owner_person_id,
    'owner_name', (select nullif(btrim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, '')), '')
                     from person o where o.id = v_sp.owner_person_id),
    'assistant_person_id', v_sp.assistant_person_id,
    'assistant_name', (select nullif(btrim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), '')
                         from person a where a.id = v_sp.assistant_person_id),
    'job_title', v_sp.job_title,
    'organization_name', v_sp.organization_name,
    'org_id', v_sp.org_id,
    'org_name', (select coalesce(og.communication_name, og.legal_name) from organization og where og.id = v_sp.org_id),
    'bio_short_de', v_sp.bio_short_de, 'bio_short_en', v_sp.bio_short_en,
    'bio_long_de', v_sp.bio_long_de, 'bio_long_en', v_sp.bio_long_en,
    'socials', v_sp.socials,
    'tech_rider', v_sp.tech_rider,
    'photo_asset_id', v_sp.photo_asset_id,
    'reception_eligible', v_sp.reception_eligible,
    'lounge_access', v_sp.lounge_access,
    'pass_type', v_sp.pass_type,
    'hotel_tier', v_sp.hotel_tier,
    'hospitality_status', v_sp.hospitality_status,
    'travel_costs_covered', v_sp.travel_costs_covered,
    'expense_mode', v_sp.expense_mode,
    'expense_lump_sum_cents', v_sp.expense_lump_sum_cents,
    'travel_costs_approved_at', v_sp.travel_costs_approved_at,
    'travel_costs_approved_by', (select nullif(btrim(coalesce(b.first_name, '') || ' ' || coalesce(b.last_name, '')), '')
                                   from person b where b.id = v_sp.travel_costs_approved_by),
    'lead_contact_id', v_sp.lead_contact_id,
    'buddy_contact_id', v_sp.buddy_contact_id,
    'contacts', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'type', c.type, 'display_name', c.display_name)
                                           order by c.type), '[]'::jsonb)
                   from edition_contact c
                  where c.id in (v_sp.lead_contact_id, v_sp.buddy_contact_id)),
    'travel', (select to_jsonb(tr) - 'updated_by' from speaker_travel tr where tr.profile_id = v_sp.id),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object(
                                   'session_id', se.id, 'title_de', se.title_de, 'title_en', se.title_en,
                                   'publish_status', se.publish_status, 'start_at', sl.start_at, 'stage_name', st.name)
                                 order by sl.start_at nulls last)
                          from session_speaker ss
                          join session se on se.id = ss.session_id
                          join event e on e.id = se.event_id
                          left join slot sl on sl.id = se.slot_id
                          left join stage st on st.id = sl.stage_id
                          where ss.person_id = v_sp.person_id
                            and (e.edition_id = v_sp.edition_id or e.id = v_sp.edition_id)), '[]'::jsonb),
    'internal_notes_visible', v_team,
    'created_at', v_sp.created_at,
    'updated_at', v_sp.updated_at
  ) || case when v_team then jsonb_build_object('internal_notes', v_sp.internal_notes) else '{}'::jsonb end;
end $$;

select harden_definer_functions();
