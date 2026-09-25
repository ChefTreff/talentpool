-- Vorschlag · Welle 6 · SevDesk-Belege ueber die Kundennummer finden (ADM-050)
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: ADM-050 — Angebot und Rechnung liegen in SevDesk und erreichen den Partner nicht.
-- Der Abruf **ist** gebaut (`syncPartnerDocuments`, `listDocuments`, `downloadPdf`); was fehlte,
-- ist der Weg zum richtigen Kontakt.
--
-- **Der Befund:** `sevdesk_document_targets` nahm nur Partner mit gesetzter `sevdesk_contact_id`.
-- Diese Kennung schreibt aber **allein** `record_shop_invoice` — sie entsteht also erst, wenn
-- jemand im Messeshop bestellt hat. Ein Partner mit Angebot und Rechnung, aber ohne
-- Messeshop-Bestellung, fiel damit **still** aus dem Abruf: keine Fehlermeldung, keine leere Zeile,
-- er stand einfach nicht in der Liste. Genau die Belege, die ADM-050 meint.
--
-- **Die Bruecke ist die Kundennummer** (ADM-057, 0177). Am 25.09.2026 lesend gegen SevDesk
-- geprueft: `Contact` fuehrt `customerNumber` in derselben Form wie HubSpot (`C-…`), der Filter
-- `GET /Contact?customerNumber=…` liefert genau einen Treffer und bei unbekannter Nummer null.
-- Der Lauf loest damit den Kontakt auf und **merkt sich die Kennung** ueber das vorhandene
-- `set_org_sevdesk_contact`, damit die Aufloesung einmal passiert und nicht jede Nacht.
--
-- **Diese Funktion bleibt unangetastet.** Ihr Gate (`auth.uid() is null or is_partner_team()`) wird
-- gebraucht: `lib/sevdesk/shop-invoices.ts` ruft sie mit dem Client des Teammitglieds. Mein erster
-- Entwurf haette sie auf server-only verengt und damit den Messeshop-Rechnungslauf gebrochen —
-- gefunden mit `db.sh fn-diff` vor dem Push. Gerufen wird sie wie dort **nur**, wenn noch keine
-- Kennung steht; ein Ueberschreiben findet also nicht statt.
--
-- Wer weder Kennung noch Kundennummer hat, bleibt draussen — fuer ihn gibt es drueben nichts zu
-- suchen. Dass er fehlt, meldet der Lauf, statt es zu verschweigen.
--
-- Rechte unveraendert: `sevdesk_document_targets` bleibt bei den zwei erlaubten Kontexten
-- (Partner-Team oder Servicekontext). Es aendert sich **eine** Funktion, und an ihr nur die
-- `where`-Bedingung und eine Spalte in der Rueckgabe.
-- Basis: `supabase/snapshot/functions/sevdesk_document_targets.sql` (Konvention §1).
-- Test: `supabase/tests/v6_sevdesk_kundennummer.sql`.

-- 1 · Ziele: Kennung **oder** Kundennummer
-- Die Rueckgabe bekommt eine Spalte, deshalb drop + create: eine geaenderte
-- RETURNS TABLE laesst sich nicht ersetzen.
drop function if exists sevdesk_document_targets(uuid);
create or replace function sevdesk_document_targets(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(org_id uuid, org_edition_id uuid, edition_id uuid, org_name text, sevdesk_contact_id text, customer_number text, bekannt text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  -- **Zwei erlaubte Kontexte, und beide ausdrücklich.** Das Team liest die Liste
  -- im Portal; der nächtliche Lauf liest sie als `service_role`, wo `auth.uid()`
  -- null und `has_role(…)` deshalb immer false ist. Eine reine Rollenprüfung
  -- hätte den Cron beim ersten Aufruf mit 42501 abgewiesen — derselbe Fehler,
  -- den die Architektur-Session in 0120 gefunden hat. `coalesce` nach §4: eine
  -- nackte ODER-Kette wird NULL, sobald ein Glied NULL ist.
  if not coalesce(is_partner_team() or auth.uid() is null, false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by e.start_date desc limit 1))
    into v_ed;
  return query
    select o.id, oe.id, oe.edition_id,
           coalesce(nullif(btrim(o.communication_name), ''), o.legal_name),
           o.sevdesk_contact_id,
           o.customer_number,
           coalesce((select array_agg(a.filename order by a.filename)
                       from partner_asset a
                      where a.org_edition_id = oe.id and a.kind in ('offer', 'invoice')), '{}')
      from org_edition oe
      join organization o on o.id = oe.org_id
     -- ADM-050: **oder** die Kundennummer. Bisher stand hier nur die
     -- SevDesk-Kennung, und die schreibt allein `record_shop_invoice` — ein
     -- Partner mit Angebot und Rechnung, aber ohne Messeshop-Bestellung, fiel
     -- deshalb still aus dem Abruf. Wer weder das eine noch das andere hat,
     -- bleibt draussen: fuer ihn gibt es drueben nichts zu suchen. Dass er fehlt,
     -- meldet der Lauf (`ohneKennung`), statt es zu verschweigen.
     where oe.edition_id = v_ed
       and (nullif(btrim(o.sevdesk_contact_id), '') is not null
            or nullif(btrim(o.customer_number), '') is not null)
     order by 4;
end $$;

select harden_definer_functions();
