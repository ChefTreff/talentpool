-- 0117 · Welle 6 B4: Backdrop der Challenge Area (PART-033, PART-052).
--
-- Angewendet von der Architektur-Session am 21.09.2026 als 20260921111140.
--
-- Anlass: Konrads Entscheidung D4 vom 18.09. und die Grafikanforderungen, die er im Wortlaut
-- geliefert hat. Der Hackathon hatte bisher **keinen** eigenen Backdrop — `backdrop_print`
-- hängt an den vier großen Stand-SKUs des Summits und meint die Standrückwand. Ein
-- Hackathon-Partner konnte seine Challenge Area also nicht branden (Befund `partner-hub-rest.md`).
--
-- **Die Regeln stehen in der Beschreibung, nicht in der Dateiprüfung** — und das mit Absicht:
-- Schutzrand, Farbraum, Auflösung und eingebettete Schriften lassen sich nicht aus einer
-- hochgeladenen Datei lesen, ohne sie zu rendern. Die Prüfung macht das Team bei der Freigabe.
-- Was die Datei prüft, ist das Format (PDF) und die Größe. Eine behauptete Prüfung wäre
-- schlimmer als keine: der Partner verließe sich darauf.
--
-- **Endformat: 1610 × 2790 mm** (Breite × Höhe), von Konrad am 21.09. nachgereicht als Ergänzung
-- zu D4. Es steht in der Beschreibung, weil es die erste Zahl ist, die ein Grafiker braucht;
-- geprüft wird es nicht (siehe oben). Ändert sich die Fläche, geht das Maß über
-- `/admin/partner/vorlagen` in die Beschreibung, ohne Migration.
--
-- Frist: dieselbe wie für die Challenge (`hackathon_challenge`, 18.03.2027). Die Folie muss
-- produziert werden, und wer vier Wochen vorher seine Aufgabe einreicht, liefert dann auch
-- sein Motiv.

set search_path = public, extensions;

insert into deliverable_template
  (key, product_sku, category, type, label_de, label_en, description_de, description_en,
   due_rule, file_rules, required, audience_roles, sort, active)
values (
  'hackathon_backdrop', null, 'hackathon', 'upload',
  'Rückwand der Challenge Area', 'Challenge area backdrop',
  'Euer Motiv für die Rückwand hinter eurer Challenge Area — wir folieren damit die Fensterscheiben. '
  || 'Anforderungen: PDF/X-4, Farbraum CMYK (ISO Coated v2), mindestens 62 dpi im Endformat, '
  || 'Schriften eingebettet oder in Pfade umgewandelt. '
  || 'Schutzrand: Text, Logos und Gesichter mindestens 100 mm von der sichtbaren Kante entfernt; '
  || 'die Schutzzone liegt 100 mm nach innen und gehört **nicht** zum Beschnitt. '
  || 'Endformat 1610 × 2790 mm (Breite × Höhe) — das ist der sichtbare Rahmen; '
  || 'das Datenformat ist das Endformat plus Beschnitt.',
  'Your artwork for the wall behind your challenge area — we use it to film the window panes. '
  || 'Requirements: PDF/X-4, colour space CMYK (ISO Coated v2), at least 62 dpi at final size, '
  || 'fonts embedded or converted to outlines. '
  || 'Safety margin: text, logos and faces at least 100 mm from the visible edge; '
  || 'the safety zone runs 100 mm inward and is **not** part of the bleed. '
  || 'Final format 1610 × 2790 mm (width × height) — this is the visible frame; '
  || 'the data format is the final format plus bleed.',
  jsonb_build_object('deadline_key', 'hackathon_challenge'),
  -- Geprüft wird, was prüfbar ist: Format und Größe. Alles andere sieht das Team.
  '{"ext": ["pdf"], "mime": ["application/pdf"], "max_bytes": 104857600}'::jsonb,
  true, '{primary_ops,additional}', 65, true)
-- Der Schlüssel der Vorlage ist dreiteilig: (key, product_sku, category).
on conflict (key, product_sku, category) do update set
  label_de = excluded.label_de, label_en = excluded.label_en,
  description_de = excluded.description_de, description_en = excluded.description_en,
  due_rule = excluded.due_rule, file_rules = excluded.file_rules, active = true;

-- Bestehende Organisationen mit Hackathon-Produkt bekommen die Pflicht sofort, nicht erst
-- beim nächsten Housekeeping.
--
-- **Nicht `resync_deliverables`** (Auflage der Architektur-Session, 18.09.): die Funktion prüft
-- `is_partner_team()` und scheitert in einer Migration, weil dort kein Sitzungskontext
-- existiert. `sync_deliverables` je Organisation tut dasselbe ohne Rechteprüfung — derselbe
-- Weg wie in der Shop-Migration 20260917192416.
select sync_deliverables(oe.id) from org_edition oe
  join event e on e.id = oe.edition_id
 where e.is_edition and coalesce(e.end_date, current_date) >= current_date;

select harden_definer_functions();
