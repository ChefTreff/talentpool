-- 0000 · Rückwand der Challenge Area nur an der Hackathon-Challenge (K-50).
--
-- Anlass: Konrad 02.10. (K-50): Die Pflicht `hackathon_backdrop` hing an der ganzen Kategorie
-- `hackathon` (0117) — damit öffneten auch „Logo auf der Hauptseite“ oder die
-- Newsletter-Erwähnung den Upload der Rückwand. Entscheidung: nur die Challenge I-37220; der
-- Stand ist Teil des Challenge-Pakets, kein eigenes Item.
--
-- Diese Migration:
--   1 setzt an der Vorlage `hackathon_backdrop` `product_sku = 'I-37220'` (die Kategorie bleibt
--     als Einordnung stehen; `template_applies` prüft bei gesetzter SKU nur die SKU).
--   2 gleicht laufende Editionen ab (`sync_deliverables` je Organisation, wie 0117): wer die
--     Challenge nicht gebucht hat, bekommt offene oder überfällige Rückwand-Pflichten auf
--     `not_required`; eingereichte oder angenommene bleiben unangetastet (keine Daten verloren).
-- Keine Funktion geändert.
-- Test: supabase/tests/v6_rueckwand_nur_challenge.sql
set search_path = public, extensions;

update deliverable_template
   set product_sku = 'I-37220'
 where key = 'hackathon_backdrop' and product_sku is null and category = 'hackathon';

select sync_deliverables(oe.id) from org_edition oe
  join event e on e.id = oe.edition_id
 where e.is_edition and coalesce(e.end_date, current_date) >= current_date;

select harden_definer_functions();
