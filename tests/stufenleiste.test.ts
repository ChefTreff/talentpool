import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * LEAD-055: Wo ein Speaker im Ablauf steht, als Leiste aus gleich breiten Stücken statt als acht gleich
 * gewichtete Knöpfe. Hier steht, was am Baustein feststeht; der Umbau des Personenfensters ist Sache des
 * Speaker-Chats (`docs/design-vorschlaege-2026-10-05.md`).
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");
const TEXT = lies("components/ui/Stufenleiste.tsx");
const CSS = lies("app/globals.css");
/** Der Quelltext ohne Kommentare: dort stehen die Stufen als Beispiel, im Code dürfen sie nicht vorkommen. */
const CODE = TEXT.replace(/\/\*[\s\S]*?\*\//g, "");

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

describe("Stufenleiste (LEAD-055)", () => {
  it("eine nummerierte Liste mit einem gleich breiten Stück je Stufe und zugänglichem Namen", () => {
    assert.match(TEXT, /<ol aria-label=\{label\} className="flex min-w-0 flex-1 gap-1">/);
    assert.match(TEXT, /<li key=\{s\.key\} aria-current=\{aktiv \? "step" : undefined\} className="min-w-0 flex-1">/);
  });

  it("Zustand in Form und Wort: die aktuelle Stufe ist dicker und fett, die erledigten gefüllt, die übrigen blass", () => {
    assert.match(TEXT, /aktiv \? "h-2 bg-accent-strong" : "h-1\.5"/);
    assert.match(TEXT, /erledigt && "bg-accent"/);
    assert.match(TEXT, /!aktiv && !erledigt && "bg-border"/);
    assert.match(TEXT, /aktiv && "font-semibold text-ink"/);
  });

  it("die Stücke sind für Vorlesesoftware verborgen, die Namen stehen im Text", () => {
    assert.match(TEXT, /<span\s+aria-hidden/);
    assert.match(TEXT, /\{s\.label\}/);
  });

  it("unter 640 px stehen die Namen nur für Vorlesesoftware, darunter sagt eine Zeile, wo man steht", () => {
    assert.match(TEXT, /ct-help max-sm:sr-only/);
    assert.match(TEXT, /<p className="ct-small text-ink sm:sr-only">/);
    assert.match(TEXT, /<span className="font-semibold">\{name\}<\/span> · \{zaehler\}/);
  });

  it("eine Absage hält die Leiste an: kein aktives, kein erledigtes Stück, die Stücke blass, die Namen nicht", () => {
    assert.match(TEXT, /const aktiv = !ende && i === index;/);
    assert.match(TEXT, /const erledigt = !ende && i < index;/);
    assert.match(TEXT, /ende && "opacity-60"/);
    // Die Durchsichtigkeit liegt auf den Stücken, nicht auf der Liste: blasse Namen verfehlten die 4,5:1.
    assert.doesNotMatch(TEXT, /<ol[^>]*opacity/);
    assert.match(TEXT, /\{ende && <span className="ct-label shrink-0 text-error-ink">\{ende\}<\/span>\}/);
  });

  it("eine unbekannte Stufe gilt wie die erste", () => {
    assert.match(TEXT, /const index = gefunden < 0 \? 0 : gefunden;/);
  });

  it("kein Wort im Baustein: Namen, Zähler und Absage-Wort kommen vom Aufrufer (Wörterbuch)", () => {
    assert.doesNotMatch(CODE, /Schritt|Abgesagt|Lead\b|Kontaktiert|Bestätigt|Teilgenommen/);
  });

  it("Schrift nur über die Rollen, keine rohen Maße", () => {
    assert.doesNotMatch(TEXT, /text-\[|\[[0-9.]+(px|rem|ch)\]|#[0-9a-fA-F]{3,8}\b/);
  });

  it("die gefüllten Stücke halten 3:1 auf der Karte (Grafik, WCAG 1.4.11), das aktuelle noch deutlicher", () => {
    const weiss = token("surface");
    assert.ok(weiss, "Token gefunden");
    assert.ok(verhaeltnis(token("accent"), weiss) >= 3, "erledigt");
    assert.ok(verhaeltnis(token("accent-strong"), weiss) >= 3, "aktuell");
    // Gegenprobe: die blassen Stücke tragen keine Information (Zierde), sie hielten die 3:1 nicht.
    assert.ok(verhaeltnis(token("border"), weiss) < 3);
  });

  it("der Name der aktuellen Stufe trägt als Text 4,5:1 auf Weiß", () => {
    assert.ok(verhaeltnis(token("ink"), token("surface")) >= 4.5);
    assert.ok(verhaeltnis(token("muted"), token("surface")) >= 4.5);
    assert.ok(verhaeltnis(token("error-ink"), token("surface")) >= 4.5, "das Wort „Abgesagt“");
  });

  it("steht in der Sammelstelle des Kits", () => {
    assert.match(lies("components/ui/index.ts"), /export \{ Stufenleiste, type Stufe \} from "\.\/Stufenleiste";/);
  });
});
