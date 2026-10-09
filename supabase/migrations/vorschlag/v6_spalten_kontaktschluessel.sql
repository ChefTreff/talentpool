-- 00NN · Spalten aufräumen und Kontaktschlüssel ableiten (QS-075, ADM-108)
--
-- Anlass: Befund QS-075 (docs/befund-qs075-spalten-2026-10-09.md), Plan-Entscheidungen vom 09.10.2026 (1) und (3).
--
-- **Teil 1 · drei tote Spalten weg.** `organization.logo_dark`, `organization.logo_light`, `org_edition.notes_internal`:
-- kein Schreiber, in der Oberfläche nirgends ausgegeben, 0 belegte Zeilen. Logos liegen in `partner_asset` (Dokumentart
-- `logo_dark`/`logo_light` im Vokabular `doc_type`), nicht in diesen Spalten. Eine Zählprobe bricht die Migration ab, falls
-- doch ein Wert steht (dann nichts löschen, Plan fragen). `partner_overview` (Live-Fassung aus dem Snapshot) gibt die beiden
-- Logo-Schlüssel nicht mehr aus; der Typ `app/(partner)/partner/types.ts` zieht im selben PR nach.
--
-- **Teil 2 · `linkedin_normalized` und `phone_e164` beim Schreiben ableiten.** `duplicate_scan` vergleicht diese zwei Spalten,
-- aber im Portal füllte sie niemand: die Dubletten-Signale „LinkedIn“ und „Telefon“ griffen nur für Importierte und Speaker.
-- Eine Stelle für alle Schreibwege (Talentprofil, Stammdaten im Admin, Speaker-Profil, Import): ein BEFORE-Trigger auf `person`.
--
--   normalize_phone_e164(text)  : '+' und Ziffern; „00…“ ⇒ „+…“; führende „0“ ⇒ „+49“ (Deutschland, wenn kein Land dasteht);
--                                 „(0)“ und „+49 0…“ verlieren die Null; muss ^\+[1-9][0-9]{7,14}$ treffen, sonst null.
--   normalize_linkedin_url(text): `linkedin.com/in|pub|company/<name>` in Kleinschrift ohne Protokoll, Sprach-Subdomain,
--                                 Parameter und Schrägstrich; alles andere null.
--
-- Wann der Trigger ableitet (nie mit Fehler, nie ohne Rückfall auf den Eingabewert):
--   * `phone` ändert sich ⇒ `phone_e164` = normalize_phone_e164(phone); unlesbar ⇒ null (die Eingabe bleibt in `phone`).
--   * `phone_e164` wird **direkt** geschrieben (Speaker-Profil, Import) ⇒ normalisiert, wenn lesbar; sonst bleibt der Wert,
--     wie er kam. **Das Speaker-Formular kennt nur dieses Feld** — ein stilles Leeren würde die Eingabe der Speaker vernichten
--     (Abweichung vom Auftrag „ungültig ⇒ null“, gilt nur für diesen Weg; im PR benannt).
--   * Ändern sich `phone` und `phone_e164` zugleich, gilt der direkt gesetzte Wert, sonst die Ableitung aus `phone`.
--   * `linkedin_url` ändert sich ⇒ `linkedin_normalized` = normalize_linkedin_url(url) (null, wenn keine Profiladresse).
--   * `linkedin_normalized` wird direkt geschrieben (Import, Testdaten) ⇒ lesbare Adresse wird kanonisch; sonst bleibt der
--     Schlüssel, wie er kam (Kleinschrift, getrimmt).
--   * Ein `update`, das keine der vier Spalten nennt, löst den Trigger nicht aus.
-- Backfill: bestehende Zeilen ohne Schlüssel werden abgeleitet; bereits gesetzte, aber lesbare Telefonwerte kanonisch geschrieben.
--
-- Fehlerschlüssel: keine neuen (der Trigger wirft nie).
set search_path = public, extensions;

-- ── Teil 1 ────────────────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from organization where logo_dark is not null or logo_light is not null)
     or exists (select 1 from org_edition where notes_internal is not null) then
    raise exception 'Spalten nicht leer: logo_dark/logo_light/notes_internal enthalten Werte; nichts löschen, Plan fragen' using errcode = 'P0001';
  end if;
end $$;

create or replace function partner_overview(p_org_id uuid, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_o organization%rowtype; v_oe org_edition; v_roles text[]; v_full boolean;
begin
  v_roles := partner_roles(p_org_id);
  if not (cardinality(v_roles) > 0 or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_o from organization where id = p_org_id;
  if not found then raise exception 'org_not_found' using errcode = 'P0002'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  v_full := is_partner_team() or v_roles && '{primary_ops,additional,signing}'::text[];
  return jsonb_build_object(
    'org', jsonb_build_object('id', v_o.id, 'legal_name', v_o.legal_name, 'communication_name', v_o.communication_name, 'type', v_o.type,
                              'website', v_o.website, 'description_de', v_o.description_de, 'description_en', v_o.description_en,
                              'address', jsonb_build_object('street', v_o.address_street, 'zip', v_o.address_zip, 'city', v_o.address_city, 'country', v_o.address_country,
                                                         'extra', v_o.address_extra),
                              'partner_category', v_o.partner_category, 'industry', v_o.industry,
                              -- PART-059: sichtbar für alle Kontakte der Organisation, schreiben darf sie nur das Team.
                              'customer_number', v_o.customer_number),
    'roles', to_jsonb(v_roles),
    'team', is_partner_team(),
    'edition', case when v_oe.id is null then null else jsonb_build_object(
        'id', v_oe.id, 'edition_id', v_oe.edition_id, 'onboarding_status', v_oe.onboarding_status, 'invited_at', v_oe.invited_at,
        'onboarding_filled_at', v_oe.onboarding_filled_at, 'description_de', v_o.description_de, 'description_en', v_o.description_en,
        'invoice_email', case when v_full then v_oe.invoice_email::text end, 'invoice_name', case when v_full then v_oe.invoice_name end,
        'vat_id', case when v_full then v_oe.vat_id end, 'po_number', case when v_full then v_oe.po_number end,
        'pass_type_choice', v_oe.pass_type_choice, 'sponsoring_level', v_oe.sponsoring_level,
        -- Erlaubnis zum Weissen fuer die Foto-Wand (PART-053). Kein `v_full`-Gate: es ist
        -- keine sensible Angabe, und wer sie sehen darf, soll sie auch geben koennen.
        'logo_whitening_consent_at', v_oe.logo_whitening_consent_at) end,
    'contacts_count', (select count(*) from org_membership om where om.org_id = p_org_id),
    'products', coalesce((select jsonb_agg(jsonb_build_object('sku', op.product_sku, 'name_de', pr.name_de, 'name_en', pr.name_en, 'category', pr.category,
                                                                'type', pr.type, 'qty', op.qty, 'unit_price_cents', case when v_full then op.unit_price_cents end,
                                                                'status', op.status, 'format_key', pr.format_key, 'nachgebucht_am', op.nachgebucht_am) order by pr.type, pr.name_de)
                          from org_product op join product pr on pr.sku = op.product_sku where op.org_edition_id = v_oe.id), '[]'::jsonb),
    'ticket_allocations', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'pass_type', a.pass_type, 'quantity', a.quantity, 'status', a.status,
                                                                          'coupon_code', case when a.status = 'active' then a.coupon_code end,
                                                                          'undershop_url', case when a.status = 'active' then a.undershop_url end,
                                                                          'used_count', a.used_count) order by a.pass_type)
                                    from org_ticket_allocation a where a.org_id = p_org_id and a.event_id = v_oe.edition_id and a.status <> 'disabled'), '[]'::jsonb),
    'deadlines', coalesce((select jsonb_agg(jsonb_build_object('key', d.key, 'due_at', d.due_at, 'label_de', d.label_de, 'label_en', d.label_en,
                                                                 'description_de', d.description_de, 'description_en', d.description_en) order by d.due_at)
                           from deadline d where d.edition_id = v_oe.edition_id and d.audience in ('partner', 'all')), '[]'::jsonb),
    'booth', (select to_jsonb(b) - 'id' - 'notes' from booth_assignment ba join booth b on b.id = ba.booth_id
               where ba.org_edition_id = v_oe.id order by ba.event_day_id nulls first, b.created_at limit 1),
    'checklist', (select jsonb_build_object('total', count(*) filter (where d.status <> 'not_required'),
                                            'done', count(*) filter (where d.status in ('submitted', 'accepted')),
                                            'open', count(*) filter (where d.status in ('open', 'overdue')),
                                            'rejected', count(*) filter (where d.status = 'rejected'),
                                            'overdue', count(*) filter (where d.status = 'overdue'),
                                            'next_due', min(d.due_at) filter (where d.status in ('open', 'rejected', 'overdue')))
                  from deliverable d where d.org_edition_id = v_oe.id),
    'sessions_count', (select count(*) from session se join event ev on ev.id = se.event_id
                       where se.host_org_id = p_org_id and (ev.id = v_oe.edition_id or ev.edition_id = v_oe.edition_id) and se.publish_status <> 'cancelled'),
    'has_stage', exists (select 1 from stage st join event ev on ev.id = st.event_id
                         where st.partner_org_id = p_org_id and st.active and (ev.id = v_oe.edition_id or ev.edition_id = v_oe.edition_id))
  );
end $$;

alter table organization drop column logo_dark, drop column logo_light;
alter table org_edition drop column notes_internal;

-- ── Teil 2 ────────────────────────────────────────────────────────────────────────────────────
create or replace function normalize_phone_e164(p_raw text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $$
declare s text := nullif(btrim(coalesce(p_raw, '')), '');
begin
  if s is null then return null; end if;
  s := regexp_replace(s, '\(\s*0\s*\)', '', 'g');
  s := regexp_replace(s, '[^0-9+]', '', 'g');
  if s like '00%' then s := '+' || substr(s, 3);
  elsif s like '0%' then s := '+49' || substr(s, 2);
  end if;
  if s like '+490%' then s := '+49' || substr(s, 5); end if;
  if s ~ '^\+[1-9][0-9]{7,14}$' then return s; end if;
  return null;
end $$;

create or replace function normalize_linkedin_url(p_url text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $$
declare v text := lower(btrim(coalesce(p_url, ''))); m text[];
begin
  if v = '' then return null; end if;
  m := regexp_match(v, '^(?:https?://)?(?:[a-z0-9-]+\.)?linkedin\.com/(in|pub|company)/([^/?#[:space:]]+)');
  if m is null then return null; end if;
  return 'linkedin.com/' || m[1] || '/' || m[2];
end $$;

create or replace function person_derive_contact_keys()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_tel_neu boolean; v_e164_neu boolean; v_url_neu boolean; v_key_neu boolean; v text;
begin
  v_tel_neu  := case when tg_op = 'INSERT' then new.phone is not null else new.phone is distinct from old.phone end;
  v_e164_neu := case when tg_op = 'INSERT' then new.phone_e164 is not null else new.phone_e164 is distinct from old.phone_e164 end;
  v_url_neu  := case when tg_op = 'INSERT' then new.linkedin_url is not null else new.linkedin_url is distinct from old.linkedin_url end;
  v_key_neu  := case when tg_op = 'INSERT' then new.linkedin_normalized is not null else new.linkedin_normalized is distinct from old.linkedin_normalized end;

  if v_e164_neu then
    v := normalize_phone_e164(new.phone_e164);
    if v is not null then new.phone_e164 := v;
    elsif v_tel_neu then new.phone_e164 := normalize_phone_e164(new.phone);
    else new.phone_e164 := nullif(btrim(coalesce(new.phone_e164, '')), '');
    end if;
  elsif v_tel_neu then
    new.phone_e164 := normalize_phone_e164(new.phone);
  end if;

  if v_key_neu then
    v := normalize_linkedin_url(new.linkedin_normalized);
    if v is not null then new.linkedin_normalized := v;
    elsif v_url_neu then new.linkedin_normalized := normalize_linkedin_url(new.linkedin_url);
    else new.linkedin_normalized := nullif(lower(btrim(coalesce(new.linkedin_normalized, ''))), '');
    end if;
  elsif v_url_neu then
    new.linkedin_normalized := normalize_linkedin_url(new.linkedin_url);
  end if;
  return new;
end $$;

drop trigger if exists trg_person_contact_keys on person;
create trigger trg_person_contact_keys before insert or update of phone, phone_e164, linkedin_url, linkedin_normalized on person
  for each row execute function person_derive_contact_keys();

-- Backfill: abgeleitet wird nur, was noch fehlt; vorhandene lesbare Telefonwerte werden kanonisch geschrieben.
update person set phone_e164 = normalize_phone_e164(phone)
 where phone is not null and phone_e164 is null and normalize_phone_e164(phone) is not null;
update person set phone_e164 = normalize_phone_e164(phone_e164)
 where phone_e164 is not null and normalize_phone_e164(phone_e164) is not null and normalize_phone_e164(phone_e164) <> phone_e164;
update person set linkedin_normalized = normalize_linkedin_url(linkedin_url)
 where linkedin_url is not null and linkedin_normalized is null and normalize_linkedin_url(linkedin_url) is not null;

select harden_definer_functions();
