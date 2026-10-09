import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { naechsterKnopf } from "@/components/ui/format-leiste-ring";

/**
 * Drei kleine Nachbesserungen an der Formatierungsleiste (Abnahme im Vorschlag 10-09, Abschnitt 7; Design 09.10.2026):
 *
 * 1. **Kein Trennstrich am Zeilenende:** bricht die Leiste am Handy um, blieb der Strich zwischen zwei Gruppen am Ende der ersten
 *    Zeile stehen. Jetzt ist jede Gruppe ein Element mit dem Strich links; der Strich der ersten Gruppe jeder Zeile fällt weg.
 * 2. **„Vorschau“ gehört zum Ring der Pfeiltasten:** vorher zwei Tab-Stopps, und die Pfeile erreichten den Knopf nicht.
 * 3. **Der Name bei Tastaturfokus:** `title` zeigt ihn nur der Maus.
 *
 * Es gibt keinen DOM-Testlauf im Repo: die Wanderregel läuft hier wirklich (`naechsterKnopf`), die Gestalt steht im Quelltext.
 */

const src = (p: string) => readFileSync(p, "utf8");
const ohneKommentare = (q: string) => q.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const leiste = ohneKommentare(src("components/ui/FormatLeiste.tsx"));
const editor = ohneKommentare(src("components/wiki/Editor.tsx"));
const mail = ohneKommentare(src("app/(admin)/admin/mail/vorlagen/VorlagenView.tsx"));

describe("Der Ring der Pfeiltasten (naechsterKnopf)", () => {
  it("Pfeil rechts wandert und läuft am Ende zum Anfang um", () => {
    assert.equal(naechsterKnopf("ArrowRight", 0, 5), 1);
    assert.equal(naechsterKnopf("ArrowRight", 3, 5), 4);
    assert.equal(naechsterKnopf("ArrowRight", 4, 5), 0);
  });

  it("Pfeil links wandert und läuft am Anfang zum Ende um", () => {
    assert.equal(naechsterKnopf("ArrowLeft", 3, 5), 2);
    assert.equal(naechsterKnopf("ArrowLeft", 1, 5), 0);
    assert.equal(naechsterKnopf("ArrowLeft", 0, 5), 4);
  });

  it("Pos1 und Ende springen an die Ränder, auch wenn der Umschalter mitgezählt ist", () => {
    assert.equal(naechsterKnopf("Home", 3, 14), 0);
    assert.equal(naechsterKnopf("End", 3, 14), 13);
  });

  it("jede andere Taste lässt den Fokus, wo er ist (null), und eine leere Leiste wandert nirgends hin", () => {
    for (const k of ["Tab", "Enter", " ", "ArrowUp", "ArrowDown", "a", "Escape"]) assert.equal(naechsterKnopf(k, 2, 5), null, k);
    assert.equal(naechsterKnopf("ArrowRight", 0, 0), null);
    assert.equal(naechsterKnopf("End", 0, 0), null);
  });

  it("ein einziger Knopf bleibt, wo er ist", () => {
    assert.equal(naechsterKnopf("ArrowRight", 0, 1), 0);
    assert.equal(naechsterKnopf("ArrowLeft", 0, 1), 0);
  });
});

describe("1 · Trennstrich: jede Gruppe ein Element mit dem Strich links", () => {
  it("die Gruppe trägt `border-l`, und es gibt keinen Strich-Span zwischen den Knöpfen mehr", () => {
    assert.match(leiste, /<div key=\{gi\} className="flex items-center gap-1 border-l px-1">/);
    assert.doesNotMatch(leiste, /h-5 w-px/, "der alte Strich zwischen den Gruppen ist weg");
    assert.doesNotMatch(leiste, /Fragment/, "kein Fragment mehr, das den Strich zwischen die Gruppen setzt");
  });

  it("der Strich der ersten Gruppe jeder Zeile liegt außerhalb des Rands: `-ml-px` innen, `overflow-x-clip` außen (nicht `overflow-hidden`)", () => {
    assert.match(leiste, /role="toolbar"[^>]*className="overflow-x-clip /);
    assert.match(leiste, /className="-ml-px flex flex-wrap /);
    assert.doesNotMatch(leiste, /overflow-hidden/, "`hidden` würde die Fokusringe oben und unten abschneiden");
  });

  it("die Leiste bleibt umbrechend, die Touch-Größe bleibt (Kit-Regel)", () => {
    assert.match(leiste, /flex-wrap/);
    assert.match(leiste, /size-8[^"]*pointer-coarse:size-11/);
  });
});

describe("2 · Der Umschalter gehört zum Ring", () => {
  it("die Leiste nimmt einen `umschalter` mit Beschriftung, Zustand und Umschalten, mit `aria-pressed`", () => {
    assert.match(leiste, /umschalter\?: \{ label: string; pressed: boolean; onToggle: \(\) => void \}/);
    assert.match(leiste, /aria-pressed=\{umschalter\.pressed\}/);
  });

  it("er zählt im Ring mit (Anzahl = Werkzeuge + 1), hat den letzten Platz und den Roving-Tabindex", () => {
    assert.match(leiste, /const anzahl = alle\.length \+ \(umschalter \? 1 : 0\)/);
    assert.match(leiste, /naechsterKnopf\(e\.key, aktiv, anzahl\)/);
    assert.match(leiste, /knoepfe\.current\[alle\.length\] = el/);
    assert.match(leiste, /tabIndex=\{alle\.length === aktiv \? 0 : -1\}/);
  });

  it("am Handy 44 px wie die übrigen Knöpfe", () => {
    assert.match(leiste, /min-h-8 [^"]*pointer-coarse:min-h-11/);
  });

  it("der Wiki-Editor gibt „Vorschau“ als `umschalter` hinein und baut keinen eigenen Knopf mehr daneben", () => {
    assert.match(editor, /umschalter=\{\{ label: t\.preview, pressed: vorschau, onToggle: \(\) => setVorschau\(\(v\) => !v\) \}\}/);
    assert.doesNotMatch(editor, /ende=\{/);
  });

  it("die Mail-Leiste braucht keinen Umschalter und ruft die Leiste wie vorher auf", () => {
    assert.match(mail, /<FormatLeiste gruppen=\{MAIL_LEISTE\} steuert="body" onAnwenden=\{formatieren\}/);
    assert.doesNotMatch(mail, /umschalter=/);
  });
});

describe("3 · Der Name bei Tastaturfokus", () => {
  it("der Name erscheint nur bei `:focus-visible` (Tastatur), nie bei der Maus, und verschwindet beim Verlassen", () => {
    assert.match(leiste, /el\.matches\(":focus-visible"\) \? name : null/);
    assert.match(leiste, /onBlur=\{\(\) => setFokusName\(null\)\}/);
  });

  it("die Zeile liegt außerhalb des geclippten Elements, ist `aria-hidden` (Vorlesen hat `aria-label`) und nutzt vorhandene Tokens", () => {
    const toolbarEnde = leiste.indexOf("</div>\n      {fokusName");
    assert.ok(toolbarEnde > 0, "die Zeile steht hinter dem Element mit der Rolle toolbar, nicht darin");
    assert.match(leiste, /<p aria-hidden className="absolute left-0 top-full z-10 mt-1 rounded-ct-sm bg-shell px-2 py-1 ct-small text-on-navy">/);
  });

  it("der Name steht weiter als `title` und `aria-label` am Knopf", () => {
    assert.match(leiste, /title=\{name\}/);
    assert.match(leiste, /aria-label=\{name\}/);
  });
});
