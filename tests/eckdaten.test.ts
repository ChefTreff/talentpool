import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * HACK-013: Eckdaten einer Veranstaltung (Wann, Wo) in je einer Zeile mit Marke — der erste Kit-Baustein, den
 * der Vorschlag „Startseite als Event-Seite“ (Vorbild: Luma) braucht. Hier steht, was am Baustein feststeht;
 * der Umbau der Seite ist Sache des Hackathon-Chats (`docs/design-vorschlaege-2026-10-04.md`).
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");
const TEXT = lies("components/ui/Eckdaten.tsx");
const CSS = lies("app/globals.css");

const kanal = (hex: string, i: number) => {
  const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const leuchtdichte = (hex: string) => 0.2126 * kanal(hex, 0) + 0.7152 * kanal(hex, 1) + 0.0722 * kanal(hex, 2);
const verhaeltnis = (a: string, b: string) => {
  const [hell, dunkel] = [leuchtdichte(a), leuchtdichte(b)].sort((x, y) => y - x);
  return (hell + 0.05) / (dunkel + 0.05);
};
const token = (name: string) => new RegExp(`--ct-${name}:\\s*(#[0-9a-fA-F]{6});`).exec(CSS)?.[1] ?? "";

describe("Eckdaten (HACK-013)", () => {
  it("zwei Arten, Datum mit Monat und Tag, Ort ohne weitere Angaben", () => {
    assert.match(TEXT, /art: "datum";/);
    assert.match(TEXT, /monat: string;/);
    assert.match(TEXT, /tag: string;/);
    assert.match(TEXT, /\{ key: string; art: "ort"; titel: string; zusatz\?: string \}/);
  });

  it("eine Liste mit einer Zeile je Eckdatum; leer zeigt nichts", () => {
    assert.match(TEXT, /<ul className=\{cn\("flex flex-col gap-4", className\)\}>/);
    assert.match(TEXT, /<li key=\{e\.key\} className="flex items-center gap-4">/);
    assert.match(TEXT, /if \(items\.length === 0\) return null;/);
  });

  it("die Marke gleicht der Datumsmarke der `DateRow` und trägt eine weiße Fläche", () => {
    assert.match(TEXT, /size-12 shrink-0 flex-col items-center justify-center rounded-ct-md border border-accent bg-surface text-accent-strong/);
    const reihe = lies("components/ui/DateRow.tsx");
    assert.match(reihe, /rounded-ct-md border/);
    assert.match(reihe, /border-accent text-accent-strong/);
  });

  it("die Marke ist für Vorlesesoftware verborgen, der Text sagt alles", () => {
    assert.match(TEXT, /<span\s+aria-hidden/);
    assert.match(TEXT, /<p className="ct-label text-ink">\{e\.titel\}<\/p>/);
    assert.match(TEXT, /\{e\.zusatz && <p className="ct-help">\{e\.zusatz\}<\/p>\}/);
  });

  it("Schrift nur über die Rollen, keine rohen Maße", () => {
    assert.doesNotMatch(TEXT, /text-\[|\[[0-9.]+(px|rem|ch)\]|#[0-9a-fA-F]{3,8}\b/);
  });

  it("der Akzentton hält auf der weißen Marke 4,5:1 (gemessen 5,33:1) und auf dem Seitengrund 4,5:1 (4,85:1)", () => {
    const akzent = token("accent-strong");
    assert.ok(akzent, "Token gefunden");
    assert.ok(verhaeltnis(akzent, token("surface")) >= 4.5, "auf Weiß");
    assert.ok(verhaeltnis(akzent, token("canvas")) >= 4.5, "auf dem Seitengrund");
    // Gegenprobe der Rechnung: das helle Grau für Deaktiviertes trägt auf Weiß keinen Text.
    assert.ok(verhaeltnis(token("muted-soft"), token("surface")) < 4.5);
  });

  it("steht in der Sammelstelle des Kits", () => {
    assert.match(lies("components/ui/index.ts"), /export \{ Eckdaten, type Eckdatum \} from "\.\/Eckdaten";/);
  });
});
