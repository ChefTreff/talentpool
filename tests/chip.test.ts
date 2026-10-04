import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * QS-064: Der Auswahlknopf mit Zustand (Filter, Tag- und Bereichswahl) stand als Klassenfolge in sieben
 * Dateien, überall bei 32 px, auch am Handy (Speaker-Chat 02.10., gemessen in der Stage-Lead-Pipeline).
 * Jetzt eine Stelle im Kit: `Chip` (Knopf, Zustand im Client) und `ChipLink` (Link, Zustand in der Adresse).
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");
const CHIP = lies("components/ui/Chip.tsx");

function quellen(ordner: string, treffer: string[] = []): string[] {
  for (const e of readdirSync(ordner, { withFileTypes: true })) {
    const pfad = `${ordner}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== ".next" && !e.name.startsWith("vorschau-")) quellen(pfad, treffer);
    } else if (/\.tsx$/.test(e.name)) treffer.push(pfad);
  }
  return treffer;
}

describe("Kit-Baustein Chip (QS-064)", () => {
  it("32 px am Desktop, am Handy 44 (Skill-Regel 7)", () => {
    assert.match(CHIP, /inline-flex items-center rounded-ct-sm px-2\.5 py-1\.5 ct-label transition-colors pointer-coarse:min-h-11/);
  });

  it("gewählt: Akzent-Soft-Fläche und dunkler Akzentton; sonst Grau mit Hover-Fläche", () => {
    assert.match(CHIP, /aktiv \? "bg-accent-soft text-accent-deep" : "text-muted hover:bg-surface-hover hover:text-ink"/);
  });

  it("Zustand auch für Vorlesegeräte: `aria-pressed` am Knopf, `aria-current` am Link", () => {
    assert.match(CHIP, /<button type="button" \{\.\.\.rest\} aria-pressed=\{aktiv\}/);
    assert.match(CHIP, /<Link \{\.\.\.rest\} aria-current=\{aktiv \? "page" : undefined\}/);
  });

  it("der Zustand steht hinter den übrigen Eigenschaften: eine Seite überschreibt ihn nicht aus Versehen", () => {
    assert.ok(CHIP.indexOf("{...rest} aria-pressed") > 0);
    assert.ok(CHIP.indexOf("{...rest} aria-current") > 0);
  });

  it("steht in der Sammelstelle des Kits", () => {
    assert.match(lies("components/ui/index.ts"), /export \{ Chip, ChipLink \} from "\.\/Chip";/);
  });
});

describe("Die Klassenfolge steht nur noch im Baustein (QS-064)", () => {
  // Zwei Links in der Kopfzeile sehen gleich aus, stehen aber auf Navy (`text-on-navy-muted`) — andere Farben, kein Chip.
  const ERLAUBT = ["components/layout/AppHeader.tsx", "components/ui/Chip.tsx"];

  it("keine weitere Datei setzt `rounded-ct-sm px-2.5 py-1.5 ct-label` von Hand", () => {
    const kopien = quellen("app")
      .concat(quellen("components"))
      .filter((f) => /rounded-ct-sm px-2\.5 py-1\.5 ct-label/.test(lies(f)))
      .sort();
    assert.deepEqual(kopien, ERLAUBT);
  });

  it("die Kopfzeile steht auf Navy und bleibt außen vor", () => {
    const kopf = lies("components/layout/AppHeader.tsx");
    assert.match(kopf, /rounded-ct-sm px-2\.5 py-1\.5 ct-label text-on-navy-muted/);
  });
});

describe("Die sieben Stellen nutzen den Baustein (QS-064)", () => {
  const STELLEN: [string, string, number][] = [
    ["app/(talent)/fotos/page.tsx", "ChipLink", 1],
    ["app/(admin)/admin/fotos/page.tsx", "ChipLink", 1],
    ["app/(partner)/partner/shop/page.tsx", "ChipLink", 1],
    ["app/(hackathon)/hackathon/challenges/page.tsx", "ChipLink", 1],
    ["app/(talent)/programm/ProgrammeView.tsx", "Chip", 2],
    ["app/(speaker-leads)/speaker-leads/PipelineView.tsx", "Chip", 2],
    ["components/layout/SectionTabs.tsx", "ChipLink", 1],
  ];
  for (const [datei, name, n] of STELLEN) {
    it(`${datei}: ${n}× <${name}>`, () => {
      const t = lies(datei);
      assert.equal((t.match(new RegExp(`<${name}\\b`, "g")) ?? []).length, n);
      assert.match(t, new RegExp(`import \\{ ${name} \\} from "@/components/ui/Chip";`));
    });
  }

  it("die Knopf-Chips setzen Zustand und Klick, nicht mehr `aria-pressed` von Hand", () => {
    for (const datei of ["app/(talent)/programm/ProgrammeView.tsx", "app/(speaker-leads)/speaker-leads/PipelineView.tsx"]) {
      const t = lies(datei);
      assert.doesNotMatch(t, /aria-pressed=\{(day|status)/, datei);
      assert.match(t, /<Chip\b[^>]*aktiv=\{/, datei);
    }
  });

  it("die Link-Chips tragen `aktiv`, nicht mehr `aria-current` von Hand", () => {
    for (const datei of [
      "app/(talent)/fotos/page.tsx",
      "app/(admin)/admin/fotos/page.tsx",
      "app/(partner)/partner/shop/page.tsx",
      "app/(hackathon)/hackathon/challenges/page.tsx",
      "components/layout/SectionTabs.tsx",
    ]) {
      assert.doesNotMatch(lies(datei), /aria-current=/, datei);
    }
  });
});
