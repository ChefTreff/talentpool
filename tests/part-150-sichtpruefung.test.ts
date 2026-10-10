import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * PART-150, Sichtprüfung bei 375 px (Design 10.10.2026): der Hauptknopf der Tischvorgabe („Speichern und auf alle 6 Gespräche übernehmen“) brach in zwei Zeilen um, und
 * ein Kit-Knopf hat feste Höhe — der Text stand mit 39 px in 44. Unter 640 px steht jetzt die Kurzform („Speichern und übernehmen“, eine Zeile), ab 640 px bleibt der lange
 * Text mit der Zahl. Die Zahl steht im Satz darüber (`vorgabeLead`: „für alle {n} Gespräche“) und in der Meldung danach. Die Zeilenaktionen bleiben: zwei sichtbare, weil
 * die zweite nur beim abweichenden Gespräch erscheint und genau das behebt (Skill, „Liste mit Zeilenaktion“). Die Verdrahtung wird am Quelltext geprüft.
 */
const lies = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ohneKommentare = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("PART-150: der Hauptknopf der Tischvorgabe bei 375 px", () => {
  const karte = ohneKommentare(lies("components/partner/TischVorgabe.tsx"));
  const de = JSON.parse(lies("lib/i18n/de.json")).partnerInterviewTables as Record<string, string>;
  const en = JSON.parse(lies("lib/i18n/en.json")).partnerInterviewTables as Record<string, string>;

  it("zwei Texte im Knopf: die Kurzform nur unter 640 px, der lange Text mit der Zahl nur darüber — nie beide zugleich im Bild", () => {
    assert.match(karte, /<span className="sm:hidden">\{t\.vorgabeSaveAllShort\}<\/span>\s*<span className="max-sm:hidden">\{t\.vorgabeSaveAll\.replace\("\{n\}", String\(anzahl\)\)\}<\/span>/);
  });

  it("die Kurzform steht in DE und EN, trägt keinen Platzhalter und ist kurz genug für eine Zeile bei 375 px (höchstens 30 Zeichen)", () => {
    for (const [sprache, w] of [["de", de], ["en", en]] as const) {
      assert.ok(w.vorgabeSaveAllShort, `${sprache}: vorgabeSaveAllShort fehlt`);
      assert.doesNotMatch(w.vorgabeSaveAllShort, /\{/, `${sprache}: die Kurzform trägt die Zahl nicht`);
      assert.ok(w.vorgabeSaveAllShort.length <= 30, `${sprache}: „${w.vorgabeSaveAllShort}“ ist ${w.vorgabeSaveAllShort.length} Zeichen lang`);
      assert.ok(w.vorgabeSaveAll.includes("{n}"), `${sprache}: der lange Text behält die Zahl`);
    }
  });

  it("die Zahl, die der Kurzform fehlt, steht im Satz darüber", () => {
    assert.ok(de.vorgabeLead.includes("{n}"), "vorgabeLead nennt die Zahl der Gespräche nicht mehr");
    assert.ok(en.vorgabeLead.includes("{n}"), "en: vorgabeLead nennt die Zahl der Gespräche nicht mehr");
  });

  it("der zweite Knopf („Nur die Vorgabe speichern“) hat nur einen Text und braucht keine Kurzform — er bleibt bei höchstens 30 Zeichen (eine Zeile bei 375 px)", () => {
    assert.ok(de.vorgabeSaveOnly.length <= 30, `de: „${de.vorgabeSaveOnly}“ ist ${de.vorgabeSaveOnly.length} Zeichen lang`);
    assert.ok(en.vorgabeSaveOnly.length <= 30, `en: „${en.vorgabeSaveOnly}“ ist ${en.vorgabeSaveOnly.length} Zeichen lang`);
  });
});

describe("PART-150: zwei sichtbare Zeilenaktionen sind im Skill als Ausnahme begründet", () => {
  const muster = lies(".claude/skills/portal-design/referenzen/muster.md");

  it("der Skill nennt die Ausnahme, ihre Bedingung (nur bei einem Zustand der Zeile, der behoben wird) und das Verhalten am Handy", () => {
    const stelle = muster.slice(muster.indexOf("**Ausnahme: zwei sichtbare Aktionen**"), muster.indexOf("**Öffnet die Aktion ein Formular,**"));
    assert.ok(stelle.length > 300, "die Ausnahme fehlt in muster.md");
    assert.match(stelle, /nur bei einem Zustand der Zeile und behebt genau ihn/);
    assert.match(stelle, /untereinander/);
    assert.match(stelle, /Kurzform/);
  });

  it("die Zeile der Gesprächsliste zeigt „Tischvorgabe übernehmen“ nur bei Recht und Abweichung — sonst bliebe die Ausnahme ohne Grund", () => {
    const seite = ohneKommentare(lies("app/(partner)/partner/TischFragen.tsx"));
    assert.match(seite, /\{canEdit && abweichend && \(\s*<TischUebernehmen/);
  });
});
