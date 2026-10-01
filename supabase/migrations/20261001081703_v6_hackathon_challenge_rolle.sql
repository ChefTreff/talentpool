-- 0223 · Hackathon Challenge (I-37220) vergibt die Rolle hackathon_partner, Storno entzieht (HACK-005)
-- Angewendet von der Architektur-Session am 01.10.2026 als 20261001081703.
--
-- Anlass: HACK-005 (Konrad 17.09., Runde 01.10.): Partner verwalten ihre Challenge im
-- Partner-Portal (PART-033, gebaut #94), die Teilnehmer-App `/hackathon` bleibt für
-- Teilnehmende — und für die Jury. Gejurt wird über `can_judge_hack_team()`, das
-- `has_role('hackathon_partner')` **und** die Mitgliedschaft in der Organisation der
-- Challenge verlangt. Befund 01.10.: **kein** Produkt vergibt `hackathon_partner`
-- (`grants_role` ist bei allen 13 Hackathon-Produkten leer) — ein Challenge-Partner
-- konnte sein Team also nur bewerten, wenn jemand die Rolle von Hand setzte.
--
-- Änderung: Das Produkt **„Hackathon Challenge“ (I-37220)** — dasselbe, an dem das
-- Challenge-Formular hängt (`deliverable_template` `hackathon_challenge`) — vergibt
-- `hackathon_partner`. Der bestehende Trigger an `org_product` (`trg_org_product_roles` →
-- `sync_granted_roles`) gibt die Rolle damit beim Buchen dem Hauptkontakt (org-gebunden,
-- bis Editionsende) und entzieht sie beim Storno. Für schon gebuchte Challenges wird
-- `sync_granted_roles` hier einmal nachgezogen.
--
-- Nicht geändert: die übrigen Hackathon-Produkte (Logo, Newsletter, Stand …) vergeben keine
-- Rolle. Keine Funktion wird neu definiert.
-- Test: supabase/tests/v6_hackathon_challenge_rolle.sql
set search_path = public, extensions;

update product set grants_role = 'hackathon_partner'
 where sku = 'I-37220' and grants_role is distinct from 'hackathon_partner';

do $$
declare r record;
begin
  for r in select distinct oe.org_id
             from org_product op join org_edition oe on oe.id = op.org_edition_id
            where op.product_sku = 'I-37220' and op.status = 'booked' loop
    perform sync_granted_roles(r.org_id);
  end loop;
end $$;

select harden_definer_functions();
