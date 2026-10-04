import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { statusFrage } from "@/lib/award/regeln";

const lies = (pfad: string) => readFileSync(new URL(`../${pfad}`, import.meta.url), "utf8");

describe("Award-Status: Rückfrage bei jedem Wechsel, den die Öffentlichkeit sieht (QS-065)", () => {
  it("fragt beim Hineinwechseln in die Abstimmung", () => {
    for (const neu of ["accepted", "finalist", "winner"]) assert.equal(statusFrage("submitted", neu), "publish", neu);
    assert.equal(statusFrage("rejected", "accepted"), "publish");
  });
  it("fragt beim Zurückziehen von der öffentlichen Seite", () => {
    for (const alt of ["accepted", "finalist", "winner"]) {
      assert.equal(statusFrage(alt, "submitted"), "unpublish", alt);
      assert.equal(statusFrage(alt, "rejected"), "unpublish", alt);
    }
  });
  it("fragt auch zwischen den öffentlichen Stufen", () => {
    assert.equal(statusFrage("accepted", "finalist"), "change");
    assert.equal(statusFrage("finalist", "winner"), "change");
  });
  it("fragt nicht, wo nichts öffentlich wird oder nichts wechselt", () => {
    assert.equal(statusFrage("submitted", "rejected"), null);
    assert.equal(statusFrage("rejected", "submitted"), null);
    assert.equal(statusFrage("accepted", "accepted"), null);
  });
  it("die Steuerung ruft setzeStatus nur über die Rückfrage auf, wenn statusFrage etwas liefert", () => {
    const q = lies("app/(admin)/admin/initiativen/award/AwardSteuerung.tsx");
    assert.match(q, /if \(statusFrage\(status, wert\)\) setNeuerStatus\(wert\);\s*else fuehreAus\(\(\) => setzeStatus\(id, wert\)/);
  });
});

describe("Öffentliches Award-Formular", () => {
  const form = lies("app/award/bewerben/BewerbungsFormular.tsx");
  it("nimmt Bilder über den Kit-Knopf, nicht über ein rohes Dateifeld", () => {
    assert.match(form, /<FileButton/);
    assert.ok(!/type="file"/.test(form), "kein rohes <input type=file>");
  });
  it("die neuen Beschriftungen stehen im Formular-Wörterbuch, DE und EN (nicht daneben)", () => {
    for (const l of ["de", "en"]) {
      const d = JSON.parse(lies(`lib/i18n/${l}.json`)) as { award: { form: Record<string, string> } };
      for (const k of ["imagesChoose", "imagesChange", "imagesChosen"]) assert.ok(d.award.form[k], `${l}: award.form.${k}`);
    }
  });
  it("hält den Seitenrand am Handy bei px-4", () => {
    for (const datei of ["app/award/page.tsx", "app/award/bewerben/page.tsx"]) {
      const q = lies(datei);
      assert.match(q, /px-4 py-10 sm:px-6/, datei);
      assert.ok(!/ px-6 py-10/.test(q), datei);
    }
  });
});

describe("Logo-Wand und Initiativen", () => {
  it("die Logo-Wand ist eine gestapelte Tabelle mit allen Spalten", () => {
    const q = lies("app/(admin)/admin/partner/logos/page.tsx");
    assert.match(q, /<Table stapeln>/);
    for (const k of ["colPartner", "colLevel", "colCategory", "colVector", "colConsent", "colState", "colMissing"]) {
      assert.match(q, new RegExp(`t\\.logoWall\\.${k}`), k);
    }
    assert.ok(!/<ul className="flex flex-col divide-y">/.test(q), "keine Zeilenliste mehr");
  });
  it("die Initiativen zählen je Stufe und filtern über die Adresszeile", () => {
    const q = lies("app/(admin)/admin/initiativen/InitiativenView.tsx");
    assert.match(q, /useUrlFilter\(\{ stufe: "" \}/);
    assert.match(q, /aria-pressed=\{f\.stufe === x\.wert\}/);
    assert.match(q, /STAGES\.map\(\(s\) => \(\{ wert: s as string/);
  });
});

describe("Bewerbungen und Schicht-Vorlagen: eine Hauptaktion, große Ziele (QS-065 Punkt 8 und 9)", () => {
  it("der Seitenwechsel der Bewerbungen besteht aus Knöpfen, nicht aus Textlinks", () => {
    const q = lies("app/(admin)/admin/bewerbungen/page.tsx");
    assert.equal((q.match(/<ButtonLink prefetch=\{false\} variant="secondary" size="sm"/g) ?? []).length, 2);
    assert.ok(!/className="ct-link" href=\{seitenAdresse/.test(q));
  });
  it("in der Session-Queue steht je Zeile kein gefüllter Knopf", () => {
    const q = lies("app/(admin)/admin/bewerbungen/[id]/QueueView.tsx");
    assert.ok(!/variant=\{d === "accepted" \? "primary"/.test(q));
  });
  it("„Neue Vorlage“ ist nachrangig, „Anwenden“ bleibt die Hauptaktion", () => {
    const q = lies("app/(admin)/admin/volunteers/ShiftTemplates.tsx");
    assert.match(q, /<Button variant="secondary" disabled=\{pending\} onClick=\{\(\) => openDraft\(\)\}>\s*\{t\.tplNew\}/);
    assert.match(q, /<Button disabled=\{pending \|\| selected\.length === 0[^>]*onClick=\{onApply\}>/);
  });
});
