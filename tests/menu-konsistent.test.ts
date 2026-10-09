import { strict as assert } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * Abnahme Team & Zugänge (Design 09.10.2026, ADM-109): drei Kleinigkeiten am Kit.
 *
 * 1. **`Menu`: Rolle und Verhalten gehören zusammen.** Der Popup trug `role="menu"`, die Einträge `role="menuitem"`, der Auslöser
 *    `aria-haspopup="menu"` — Vorlesesoftware kündigt damit ein Menü mit Pfeiltasten an, die es nicht gibt (gemessen: nach Enter blieb der
 *    Fokus am Auslöser, Pfeil unten tat nichts). Es ist ein Aufklappen (Disclosure): `aria-expanded`, `aria-controls`, Escape mit Fokus
 *    zurück, Klick daneben, Tab durch die Einträge.
 * 2. **`Menu kompakt`:** nur ⋯ für Tabellenzeilen; der breite Auslöser füllte die Zelle und schob den zweiten Knopf darunter.
 * 3. **`ConfirmDialog error`:** scheitert die Aktion, bleibt die Rückfrage offen und sagt es (ADM-062) — kein Toast nach dem Schließen.
 *
 * Es gibt keinen DOM-Testlauf im Repo: Quelltext hier, Messung und Bild in der PR-Beschreibung.
 */

const src = (p: string) => readFileSync(p, "utf8");
const ohneKommentare = (q: string) => q.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const menu = ohneKommentare(src("components/ui/Menu.tsx"));
const modal = ohneKommentare(src("components/ui/Modal.tsx"));

describe("Menu: ein Aufklappen, kein Anwendungsmenü", () => {
  it("keine Menü-Rollen mehr: weder `role=\"menu\"` noch `role=\"menuitem\"` noch `aria-haspopup=\"menu\"`", () => {
    assert.doesNotMatch(menu, /role="menu"/);
    assert.doesNotMatch(menu, /role="menuitem"/);
    assert.doesNotMatch(menu, /aria-haspopup/);
  });

  it("nirgends im Code steht eine Menü-Rolle (ohne Pfeiltasten wäre jede ein Versprechen, das nicht gehalten wird)", () => {
    const treffer: string[] = [];
    const lauf = (ordner: string) => {
      for (const name of readdirSync(ordner)) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        const pfad = join(ordner, name);
        if (statSync(pfad).isDirectory()) lauf(pfad);
        else if (/\.tsx$/.test(name) && /role="menu(item)?"/.test(ohneKommentare(src(pfad)))) treffer.push(pfad);
      }
    };
    lauf("app");
    lauf("components");
    assert.deepEqual(treffer, []);
  });

  it("was das Aufklappen braucht, bleibt: `aria-expanded`, `aria-controls`, Escape gibt den Fokus zurück, ein Klick daneben schließt", () => {
    assert.match(menu, /aria-expanded=\{open\}/);
    assert.match(menu, /aria-controls=\{open \? id : undefined\}/);
    assert.match(menu, /e\.key !== "Escape"\) return;\s*setOpen\(false\);\s*knopf\.current\?\.focus\(\)/);
    assert.match(menu, /document\.addEventListener\("mousedown", beiKlick\)/);
  });

  it("die Einträge sind echte `<a>` und `<button>`; die Trennlinie bleibt `role=\"separator\"`", () => {
    assert.match(menu, /<a href=\{href\} aria-current/);
    assert.match(menu, /<button type="button" onClick=\{onSelect\}/);
    assert.match(menu, /<div role="separator"/);
  });
});

describe("Menu kompakt: nur ⋯ für Zeilenaktionen", () => {
  it("`kompakt` ist eine Eigenschaft, Vorgabe `false`; der Name bleibt am Auslöser (`aria-label`) und erscheint der Maus als `title`", () => {
    assert.match(menu, /kompakt = false,/);
    assert.match(menu, /kompakt\?: boolean;/);
    assert.match(menu, /aria-label=\{label\}/);
    assert.match(menu, /title=\{kompakt \? label : undefined\}/);
  });

  it("drei Punkte, `size-8` am Desktop und `size-11` am groben Zeiger, mit Rand wie der helle Auslöser", () => {
    assert.match(menu, /size-8 justify-center rounded-ct-md border border-border-strong bg-surface [^"]*pointer-coarse:size-11/);
    const punkte = menu.slice(menu.indexOf("{kompakt ? ("), menu.indexOf(") : ("));
    assert.equal((punkte.match(/<circle /g) ?? []).length, 3);
    assert.match(punkte, /aria-hidden/);
  });

  it("der Auslöser füllt die Zelle nur in der breiten Gestalt (`w-full`): der kompakte Knopf bleibt 32 px breit", () => {
    assert.match(menu, /: "w-full gap-2 text-left",/);
    assert.doesNotMatch(menu, /"flex w-full items-center/, "`w-full` steht nicht in der gemeinsamen Grundform");
  });

  it("der Rahmen schrumpft auf den Knopf (`inline-block`), damit die Zelle ihn rechtsbündig setzen kann", () => {
    assert.match(menu, /className=\{cn\("relative", kompakt && "inline-block"\)\}/);
  });

  it("die breite Gestalt bleibt, wie sie war (Navy und hell mit Pfeil, Wort aus `trigger`)", () => {
    assert.match(menu, /: "min-h-11 rounded-ct-sm px-2 py-1\.5 hover:bg-on-navy\/10"/);
    assert.match(menu, /\? "min-h-10 rounded-ct-md border border-border-strong bg-surface px-3 ct-label text-ink hover:bg-surface-hover pointer-coarse:min-h-11"/);
    assert.match(menu, /\{trigger\}\s*\{ton === "hell" && \(/);
  });
});

describe("ConfirmDialog: der Fehler bleibt im Dialog", () => {
  it("`error` ist eine Eigenschaft und geht an das `Modal` — dessen Meldung (`role=\"alert\"`, klebt unten) zeigt sie", () => {
    assert.match(modal, /error\?: string \| null;\s*onConfirm: \(\) => void;/);
    assert.match(modal, /<Modal onCancel=\{onCancel\} label=\{title\} error=\{error\}>/);
  });

  it("die Meldung des `Modal` ist `role=\"alert\"` und steht ohne `ModalFuss` als eigene Leiste unten", () => {
    assert.match(modal, /role="alert"/);
    assert.match(modal, /\{error && fuesse === 0 && \(/);
  });
});
