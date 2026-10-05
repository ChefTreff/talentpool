import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { compile } from "tailwindcss";

/**
 * LEAD-055: Der Aufbau des Personenfensters und der Detailseite aus aufklappbaren Blöcken. Hier steht, was an
 * den Bausteinen feststeht (`Block`, der helle Auslöser des `Menu`, die schmale `InfoList`); den Umbau der
 * Seiten macht der Speaker-Chat nach `docs/design-vorschlaege-2026-10-05.md`.
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");
const BLOCK = lies("components/ui/Block.tsx");
const MENU = lies("components/ui/Menu.tsx");
const INFO = lies("components/ui/InfoList.tsx");

describe("Block (LEAD-055)", () => {
  it("ein `<details>` mit Anker, Startzustand und der Gruppe für die Zustände offen/zu", () => {
    assert.match(BLOCK, /<details\s+ref=\{el\}\s+id=\{id\}\s+open=\{offen\}/);
    assert.match(BLOCK, /className=\{cn\("group scroll-mt-20",/);
  });

  it("der Kopf ist eine Überschrift mit Pflicht-Ebene, wie `CardHeader` (h2 auf einer Seite, h3 im Fenster)", () => {
    assert.match(BLOCK, /ebene: "h2" \| "h3";/);
    assert.doesNotMatch(BLOCK, /ebene\?:/);
    assert.doesNotMatch(BLOCK, /ebene = "h[23]"/);
    assert.match(BLOCK, /ebene === "h2" \? "ct-h2 text-ink" : "ct-h3 text-ink"/);
    assert.match(BLOCK, /<Kopf className=/);
  });

  it("die Zeile zum Aufklappen ist mindestens 44 hoch und bricht um, die Kurzfassung steht in einer eigenen Zeile", () => {
    assert.match(BLOCK, /<summary\s+className=\{cn\(\s*"flex min-h-11 cursor-pointer list-none flex-wrap items-center/);
    assert.match(BLOCK, /basis-full ct-help group-open:hidden/);
  });

  it("der Zustand des Blocks steht in Wort und Ton (`Badge`), der Pfeil dreht sich mit dem Zustand", () => {
    assert.match(BLOCK, /marke\?: \{ text: string; ton: BadgeTone \};/);
    assert.match(BLOCK, /<Badge tone=\{marke\.ton\}>\{marke\.text\}<\/Badge>/);
    assert.match(BLOCK, /group-open:rotate-180/);
    assert.match(BLOCK, /aria-hidden/);
  });

  it("in einem Fenster ein Abschnitt mit Trennlinie, auf einer Seite eine Karte — nie Karte in Karte", () => {
    assert.match(BLOCK, /karte \? "rounded-ct-lg border bg-surface" : "border-t"/);
    assert.match(BLOCK, /karte && "px-4 sm:px-6"/);
  });

  it("öffnet sich von selbst, wenn man auf seinen Anker springt", () => {
    assert.match(BLOCK, /^"use client";/);
    assert.match(BLOCK, /window\.location\.hash === `#\$\{id\}`/);
    assert.match(BLOCK, /window\.addEventListener\("hashchange", zumAnker\)/);
    assert.match(BLOCK, /window\.removeEventListener\("hashchange", zumAnker\)/);
  });

  it("öffnet sich von selbst, wenn ein Feld darin die Prüfung des Browsers bemängelt (Fangphase)", () => {
    assert.match(BLOCK, /d\.addEventListener\("invalid", oeffne, true\)/);
    assert.match(BLOCK, /d\.removeEventListener\("invalid", oeffne, true\)/);
  });

  it("kein Wort im Baustein: Titel, Marke und Kurzfassung kommen vom Aufrufer (Wörterbuch)", () => {
    const code = BLOCK.replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(code, /Grunddaten|Pipeline|Onboarding|Hospitality|Programm|Nächste Pflicht|Erledigt/);
  });

  it("Schrift nur über die Rollen, keine rohen Maße", () => {
    assert.doesNotMatch(BLOCK, /text-\[|\[[0-9.]+(px|rem|ch)\]|#[0-9a-fA-F]{3,8}\b/);
  });

  it("steht in der Sammelstelle des Kits", () => {
    assert.match(lies("components/ui/index.ts"), /export \{ Block \} from "\.\/Block";/);
  });
});

describe("Übersetzung der Klassen (LEAD-055)", () => {
  it("Tailwind macht aus allen neuen Klassen eine Regel (ein Tippfehler im Namen fiele sonst stillschweigend weg)", async () => {
    const css0 = lies("app/globals.css");
    const theme = /@theme inline \{[\s\S]*?\n\}/.exec(css0)?.[0] ?? "";
    assert.ok(theme.length > 0, "Theme-Block gefunden");
    // Die Breitenstufe `sm` kommt aus dem Standard-Theme von Tailwind, das hier nicht geladen wird.
    const tw = await compile(`@theme { --spacing: 0.25rem; --breakpoint-sm: 40rem; }\n${theme}\n@tailwind utilities;`);
    const klassen = [
      "group-open:rotate-180",
      "group-open:hidden",
      "max-sm:sr-only",
      "sm:sr-only",
      "h-1.5",
      "h-2",
      "bg-accent-strong",
      "bg-accent",
      "bg-border",
      "text-error-ink",
      "pointer-coarse:min-h-11",
      "[&::-webkit-details-marker]:hidden",
      "scroll-mt-20",
      "basis-full",
      "border-border-strong",
      "hover:bg-surface-hover",
      "sm:grid-cols-[minmax(0,9rem)_1fr]",
    ];
    const css = tw.build(klassen);
    const fehlend = klassen.filter((k) => !css.includes(k.replace(/([:\[\]&>()*,.%])/g, "\\$1")));
    assert.deepEqual(fehlend, []);
  });
});

describe("Menu: der helle Auslöser (LEAD-055 „Weitere Aktionen“)", () => {
  it("die Vorgabe bleibt der Auslöser für Navy (Kopfzeile und Seitenleiste), unverändert", () => {
    assert.match(MENU, /ton = "navy",/);
    assert.match(MENU, /: "min-h-11 rounded-ct-sm px-2 py-1\.5 hover:bg-on-navy\/10"/);
  });

  it("hell: mit Rand und Hover-Fläche wie ein zweitrangiger Knopf, 40 am Desktop, 44 am Handy", () => {
    assert.match(
      MENU,
      /"min-h-10 rounded-ct-md border border-border-strong bg-surface px-3 ct-label text-ink hover:bg-surface-hover pointer-coarse:min-h-11"/,
    );
  });

  it("hell: ein Pfeil sagt, dass etwas aufklappt, und dreht sich beim Öffnen; auf Navy gibt es ihn nicht", () => {
    assert.match(MENU, /\{ton === "hell" && \(/);
    assert.match(MENU, /open && "rotate-180"/);
  });

  it("die Klassen der beiden Gestalten schließen einander aus (`cn` fügt nur aneinander)", () => {
    const stelle = MENU.slice(MENU.indexOf('ton === "hell"\n'), MENU.indexOf("{trigger}"));
    assert.match(stelle, /\? "min-h-10/);
    assert.match(stelle, /: "min-h-11/);
  });
});

describe("InfoList: die schmale Begriffsspalte (LEAD-055)", () => {
  it("die Vorgabe bleibt 14 rem, schmal sind 9 rem — beide als volle Klasse, nie zusammengesetzt", () => {
    assert.match(INFO, /schmal \? "sm:grid-cols-\[minmax\(0,9rem\)_1fr\]" : "sm:grid-cols-\[minmax\(0,14rem\)_1fr\]"/);
    assert.match(INFO, /schmal = false,/);
  });
});
