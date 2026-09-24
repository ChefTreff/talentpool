-- 0167 · Welle 6 · Belege im Dateibereich einordnen (PART-065): my_partner_documents (Angebot, Rechnung, Messeshop-Rechnung)
-- Angewendet von der Architektur-Session am 24.09.2026 als 20260924142604.
-- Vorschlag · Welle 6 · Belege im Dateibereich einordnen (PART-065): my_partner_documents
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: Konrad, Eingang 21./24.09. („Seite Dateien"): „Unbedingt enthalten sein müssen die
-- Angebote und Rechnungen … Dateien: Alle Logos · Euer Angebot · Rechnung · Messeshop Rechnung".
--
-- Die Belege selbst kommen seit 0122 aus SevDesk in den Dateibereich (`partner_asset`, `kind`
-- `offer` bzw. `invoice`, Datei `<edition>/<org>/documents/<sevdesk-id>.pdf`). Eine
-- **Messeshop-Rechnung** ist darunter nicht von einer anderen Rechnung zu unterscheiden — SevDesk
-- kennt nur „Rechnung". Unterscheiden kann nur, wer weiss, welche SevDesk-Rechnung aus dem Shop
-- entstand: `record_shop_invoice` hält das je Bestellung in `external_ref` fest (system `sevdesk`,
-- object_type `shop_order`, `meta.invoice_id`). Diese Tabelle hat keine Grants für Partner, und das
-- soll so bleiben; deshalb eine Lesefunktion, die nur die Einordnung herausgibt, nicht die Referenz.
--
-- Rechte wie `my_partner_assets`: Mitglied der Organisation oder Partner-Team, sonst 42501.
-- Nur Belege (`offer`, `invoice`) — Uploads stehen weiter in `my_partner_assets`.
--
-- Test: supabase/tests/v6_partner_belege.sql

set search_path = public, extensions;

create or replace function my_partner_documents(p_org_id uuid, p_edition_id uuid default null)
 returns table (id uuid, beleg text, filename text, storage_path text, size_bytes bigint, created_at timestamp with time zone)
 language plpgsql
 stable
 security definer
 set search_path = public, extensions
as $$
declare v_oe org_edition;
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  return query
    select a.id,
           case
             when a.kind = 'offer' then 'angebot'
             -- Aus dem Messeshop, wenn eine Bestellung dieser Organisation auf genau diese
             -- SevDesk-Rechnung verweist (Dateiname = SevDesk-Id, 0122).
             when exists (select 1 from external_ref x join shop_order o on o.id = x.object_id
                           where x.system = 'sevdesk' and x.object_type = 'shop_order'
                             and o.org_edition_id = v_oe.id
                             and x.meta->>'invoice_id' = regexp_replace(a.filename, '\.pdf$', ''))
               then 'messeshop_rechnung'
             else 'rechnung'
           end,
           a.filename, a.storage_path, a.size_bytes, a.created_at
      from partner_asset a
     where a.org_edition_id = v_oe.id and a.kind in ('offer', 'invoice')
     order by a.created_at desc;
end $$;

select harden_definer_functions();
