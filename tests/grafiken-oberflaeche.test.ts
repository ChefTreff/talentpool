import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { compile } from "tailwindcss";

/**
 * ADM-075 (Konrad 05.10.: „die Buttons sauberer strukturieren, das sieht total doof aus“): die Oberfläche von
 * `/admin/grafiken`. Die Rechte (Marketing-Rolle, `has_admin_section('graphics')`) und die Mail zum Upload macht der
 * Speaker-Chat; hier steht, was an der Oberfläche feststeht — und dass der Weg der Bytes derselbe geblieben ist.
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");
const ANSICHT = lies("app/(admin)/admin/grafiken/GrafikenView.tsx");
const PARTNER = lies("app/(admin)/admin/grafiken/PartnergrafikenAdmin.tsx");
const MEDIA = lies("app/(admin)/admin/grafiken/MediaKitAdmin.tsx");
const SEITE = lies("app/(admin)/admin/grafiken/page.tsx");
const FILEBUTTON = lies("components/ui/FileButton.tsx");

describe("Auftritte: eine Zeile, ein ruhiger Knopf (ADM-075)", () => {
  it("die Zeile trägt keine Auswahl, kein Feld und keinen Dateiknopf mehr — nur den Knopf „Bilder“", () => {
    const tabelle = ANSICHT.slice(ANSICHT.indexOf("<Tbody>"), ANSICHT.indexOf("</Tbody>"));
    assert.doesNotMatch(tabelle, /<Select|<Input|<FileButton/);
    assert.match(tabelle, /<Button\s+size="sm"\s+variant="secondary"/);
    // Jeder Knopf nennt seinen Auftritt, sonst stünden acht gleiche „Bilder“ in der Liste der Knöpfe.
    assert.match(tabelle, /aria-label=\{t\.manageLabel\.replace\("\{title\}", s\.title \?\? common\.none\)\}/);
  });

  it("der Zustand steht in Wort und Farbe: „Fehlt“ gelb, „Da“ grün, das Foto als Zahl", () => {
    assert.match(ANSICHT, /<Badge tone="warning">\{t\.missing\}<\/Badge>/);
    assert.match(ANSICHT, /<Badge tone="success">\{t\.present\}<\/Badge>/);
    assert.match(ANSICHT, /<span className="ct-small tabular-nums text-ink">\{s\.photos\}<\/span>/);
  });

  it("der Name öffnet das Schubfach und ist das Ziel der ganzen Zelle (`.ct-ziel`, Zelle `relative`)", () => {
    assert.match(ANSICHT, /<Td className="relative">\s*<button\s+type="button"\s+className="ct-link ct-ziel text-left font-medium"/);
  });

  it("am Handy stapelt die Tabelle (jede Zelle mit Beschriftung, der Name ohne)", () => {
    assert.match(ANSICHT, /<Table stapeln>/);
    assert.match(ANSICHT, /<Td label=\{t\.colSpeakers\}>/);
    assert.match(ANSICHT, /<Td label=\{t\.colPhotos\}>/);
    assert.match(ANSICHT, /<Td label=\{t\.colGraphic\}>/);
  });

  it("der häufigste Filter liegt offen da, mit der Zahl: Auswahlknöpfe statt eines Auswahlfelds", () => {
    assert.match(ANSICHT, /<div role="group" aria-label=\{t\.filter\} className="flex flex-wrap gap-1">/);
    for (const f of ["alle", "ohne_foto", "ohne_grafik"]) assert.match(ANSICHT, new RegExp(`<Chip aktiv=\\{filter === "${f}"\\}`));
    assert.match(ANSICHT, /\{t\.filterNoPhoto\} \(\{ohneFoto\}\)/);
    assert.match(ANSICHT, /\{t\.filterNoGraphic\} \(\{ohneGrafik\}\)/);
  });
});

describe("Das Schubfach (ADM-075)", () => {
  it("Bilder und Upload liegen in einem Schubfach statt in einer Karte unter der Tabelle", () => {
    assert.match(ANSICHT, /<Drawer\s+open=\{offen !== null\}/);
    assert.doesNotMatch(ANSICHT, /<CardHeader/);
  });

  it("das Formular ist beschriftet: Art, Bildnachweis mit Hilfetext, dann die Datei", () => {
    assert.match(ANSICHT, /<Field label=\{t\.kindLabel\} htmlFor="gr-art">/);
    assert.match(ANSICHT, /<Field label=\{t\.credit\} htmlFor="gr-credit" hint=\{t\.creditHint\}>/);
    assert.match(ANSICHT, /<h3 id="gr-neu" className="ct-label text-ink">/);
  });

  it("Auswählen ist zweitrangig; das Hochladen danach (Knopf des Bausteins) die eine Hauptaktion", () => {
    assert.match(ANSICHT, /<FileButton[\s\S]*?variant="secondary"/);
    assert.match(ANSICHT, /laedt=\{pending\}/);
  });

  it("Fehler und Erfolg stehen im Schubfach neben dem Knopf und bleiben stehen, statt nach vier Sekunden als Toast zu verschwinden (ADM-062)", () => {
    assert.match(ANSICHT, /error=\{fehler\}/);
    assert.match(ANSICHT, /if \(offen\) setFehler\(text\);\s*else toast\("error", text\);/);
    assert.match(ANSICHT, /<p role="status" className="ct-small text-success-ink">\s*\{erfolg\}/);
    // Der Erfolgs-Toast ist weg: die Meldung steht im Schubfach, ein zweiter daneben sagte dasselbe flüchtig.
    assert.doesNotMatch(ANSICHT, /toast\("success"/);
  });

  it("Löschen fragt vorher, weil das Bild danach auch aus dem Speicher ist", () => {
    assert.match(ANSICHT, /<ConfirmDialog\s+title=\{t\.deleteTitle\}/);
    assert.match(ANSICHT, /onDelete=\{\(b\) => setZuLoeschen\(b\)\}/);
    assert.match(ANSICHT, /startTransition\(async \(\) => loeschen\(id\)\)/);
  });

  it("der Weg der Bytes ist derselbe geblieben: Platz holen, direkt zu Supabase, Zeile anlegen", () => {
    assert.match(ANSICHT, /"\/api\/admin\/session-assets\?step=url"/);
    assert.match(ANSICHT, /\.uploadToSignedUrl\(platz\.data\.path, platz\.data\.token, datei, \{ contentType: datei\.type \}\)/);
    assert.match(ANSICHT, /postJson<\{ id: string \}>\("\/api\/admin\/session-assets", \{/);
    assert.match(ANSICHT, /cutout: kind === "slot_graphic"/);
    assert.match(ANSICHT, /fetch\(`\/api\/admin\/session-assets\?id=\$\{id\}`, \{ method: "DELETE" \}\)/);
    assert.match(ANSICHT, /const MAX_BYTES = 25 \* 1024 \* 1024;/);
  });
});

describe("Partnergrafiken und Media Kit (ADM-075)", () => {
  it("Partnergrafiken sind eine Tabelle: Partner, Stand, Aktionen in festen Spalten, rechtsbündig, alle klein", () => {
    assert.match(PARTNER, /<Table stapeln>/);
    assert.match(PARTNER, /<Th>\{t\.colPartner\}<\/Th>/);
    assert.match(PARTNER, /<Th>\{t\.colStatus\}<\/Th>/);
    assert.match(PARTNER, /flex flex-wrap items-center gap-2 sm:justify-end/);
    assert.match(PARTNER, /variant="ghost" size="sm" \{\.\.\.neuesFenster\}/);
    assert.match(PARTNER, /<ButtonLink href=\{`\/admin\/grafiken\/meet-us-at\?org=\$\{z\.org_id\}`\} variant="secondary" size="sm">/);
    assert.match(PARTNER, /<FileButton[\s\S]*?variant="secondary"\s+size="sm"/);
  });

  it("im Media Kit ist Auswählen zweitrangig", () => {
    assert.match(MEDIA, /<FileButton[\s\S]*?variant="secondary"/);
  });

  it("der Baustein kennt eine kleine Größe: 32 px wie `Button size=\"sm\"`, am Handy 44; die Vorgabe bleibt", () => {
    assert.match(FILEBUTTON, /size = "md",/);
    assert.match(FILEBUTTON, /size === "sm" \? "h-8 px-3 pointer-coarse:min-h-11" : "min-h-11 px-5"/);
    assert.match(FILEBUTTON, /size\?: "md" \| "sm";/);
  });
});

describe("Die Seite (ADM-075)", () => {
  it("drei Abschnitte mit Anker und die Übersicht „Auf dieser Seite“; Media Kit und Partnergrafiken nur mit Edition", () => {
    assert.match(SEITE, /<AbschnittsNavigation/);
    assert.match(SEITE, /<Sektion id="auftritte" title=\{g\.sectionSessions\}>/);
    assert.match(SEITE, /<section id="media-kit"/);
    assert.match(SEITE, /<section id="partnergrafiken"/);
    assert.match(SEITE, /\.\.\.\(editionId\s*\?\s*\[\s*\{ id: "media-kit", label: g\.mediaKitTitle \},\s*\{ id: "partnergrafiken", label: g\.partnerGraphicsTitle \},\s*\]\s*: \[\]\)/);
  });

  it("die Seite reicht der Ansicht nur Wörter und Beschriftungen (`common`), keine Rechte", () => {
    assert.match(SEITE, /common=\{\{ none: t\.common\.none, cancel: t\.common\.cancel, upload: t\.common\.upload, chooseOtherFile: t\.common\.chooseOtherFile \}\}/);
  });
});

describe("Texte und Klassen (ADM-075)", () => {
  it("die neuen Texte stehen in DE und EN, die Platzhalter in beiden", () => {
    const de = JSON.parse(lies("lib/i18n/de.json")).adminGrafiken;
    const en = JSON.parse(lies("lib/i18n/en.json")).adminGrafiken;
    for (const k of [
      "colActions", "colPartner", "colStatus", "missing", "present", "manage", "manageLabel", "sectionSessions",
      "addTitle", "kindLabel", "creditHint", "uploadHint", "existingTitle", "deleteTitle", "deleteBody",
    ]) {
      assert.ok(de[k], `de ${k}`);
      assert.ok(en[k], `en ${k}`);
    }
    for (const k of ["manageLabel", "existingTitle"]) {
      assert.equal(/\{(title|n)\}/.exec(de[k])?.[0], /\{(title|n)\}/.exec(en[k])?.[0], k);
    }
  });

  it("Tailwind macht aus den neuen Klassen eine Regel (ein Tippfehler im Namen fiele sonst stillschweigend weg)", async () => {
    const theme = /@theme inline \{[\s\S]*?\n\}/.exec(lies("app/globals.css"))?.[0] ?? "";
    const tw = await compile(`@theme { --spacing: 0.25rem; --breakpoint-sm: 40rem; }\n${theme}\n@tailwind utilities;`);
    const klassen = ["h-8", "px-3", "pointer-coarse:min-h-11", "min-w-64", "sm:justify-end", "grid-cols-2", "text-success-ink", "break-all", "self-start"];
    const css = tw.build(klassen);
    const fehlend = klassen.filter((k) => !css.includes(k.replace(/([:\[\]&>()*,.%/])/g, "\\$1")));
    assert.deepEqual(fehlend, []);
  });
});
