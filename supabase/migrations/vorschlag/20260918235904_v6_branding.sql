-- 0116 · Welle 6 B5: Branding — Frist und Maße für die Digital-Branding-Datei (PART-043).
--
-- Anlass: Arbeitsauftrag Welle 6 §A2 und B5, Backlog PART-043.
--
-- Die Pflicht `digital_branding` existiert seit `20260910163331` am Produkt `I-95690`, aber
-- **ohne Frist** (`due_rule = '{}'`). Damit wiederholt sich still, was bei der Hackathon-Challenge
-- schon einmal passiert ist: kein Countdown, kein Erinnerungs-Digest, keine Überfälligkeit — der
-- Partner hört bis zum Event nichts. Die Datei geht in die Produktion, also gilt dieselbe Frist
-- wie für den Messestand (`booth_changes_until`, 02.04.2027).
--
-- Dazu die Maßangabe aus Konrads Vorgabe („Digital Branding 16:9"): 1920 × 1080 Bildpunkte.
-- Die **Dateiregeln prüfen sie nicht** — Bildmaße lassen sich serverseitig nur mit einer
-- Bildbibliothek lesen, die es hier nicht gibt. Sie stehen deshalb in der Beschreibung, wo der
-- Partner sie liest, und das Team prüft sie bei der Freigabe. Eine Prüfung zu behaupten, die
-- nicht stattfindet, wäre schlimmer als keine.

set search_path = public, extensions;

update deliverable_template
   set due_rule = jsonb_build_object('deadline_key', 'booth_changes_until'),
       label_de = 'Digital Branding (16:9)',
       label_en = 'Digital branding (16:9)',
       description_de = 'Euer Motiv für die digitalen Flächen: 1920 × 1080 Bildpunkte (16:9), ohne Rand. '
                     || 'PDF, PNG oder JPG bis 50 MB. Weitere Standelemente kommen dazu, sobald sie feststehen.',
       description_en = 'Your artwork for the digital screens: 1920 × 1080 pixels (16:9), no border. '
                     || 'PDF, PNG or JPG up to 50 MB. Further booth elements will follow once they are set.',
       -- SVG und ZIP raus: eine Bildfläche braucht ein Bild, und was in einem Archiv steckt,
       -- sieht erst das Team beim Öffnen.
       file_rules = '{"ext": ["pdf", "png", "jpg", "jpeg"], "mime": ["application/pdf", "image/png", "image/jpeg"], "max_bytes": 52428800}'::jsonb
 where key = 'digital_branding';

-- Schon erzeugte Pflichten tragen die Frist als Kopie; ohne diese Zeile stünde dort weiter
-- „ohne Frist" (dieselbe Stelle wie in 0094 und 0111).
update deliverable d
   set due_at = dl.due_at
  from deliverable_template t, org_edition oe, deadline dl
 where d.template_id = t.id
   and d.org_edition_id = oe.id
   and dl.edition_id = oe.edition_id
   and dl.key = 'booth_changes_until'
   and t.key = 'digital_branding'
   and d.due_at is distinct from dl.due_at;

select harden_definer_functions();
