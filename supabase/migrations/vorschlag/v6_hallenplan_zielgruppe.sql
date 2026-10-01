-- Partner-Hallenplan nicht mehr für Speaker (PROD-009, aus SPK-030)
--
-- Zweck: `set_edition_file` setzt ohne Zielgruppe alle fünf — der heutige
-- Hallenplan (FLS26-Bild, hochgeladen vor PROD-009) ist damit auch für
-- Speaker sichtbar. Die Speaker bekommen einen eigenen Plan (SPK-030): das
-- Formular unter /admin/produktion/dateien bzw. /admin/medien → Dateien fragt
-- die Zielgruppe jetzt ab, und bestehende Einträge lassen sich dort ändern.
-- Diese Migration bereinigt nur den Bestand: aus jedem Hallenplan, der
-- **alle fünf** Zielgruppen trägt (also nie bewusst eingeschränkt wurde),
-- fällt `speaker`. Ein bewusst gesetzter Speaker-Plan bleibt unberührt.
--
-- Keine Funktion geändert: `set_edition_file` nimmt `audience` seit 0101 an,
-- auch beim Ändern (mit `id`).
set search_path = public, extensions;

update edition_file
   set audience = array_remove(audience, 'speaker'), updated_at = now()
 where kind = 'hallenplan'
   and audience @> '{partner,speaker,talent,volunteer,hackathon}'::text[];

select harden_definer_functions();
