import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * QS-054 (Konrad 04.10.2026, K-60: „Versalien passen, bitte alle umstellen“): `CardHeader` trägt seine Ebene
 * immer ausdrücklich. `h2` (`.ct-h2`) ist die Ebene eines **Abschnitts der Seite** — sonst springt die
 * Gliederung von `h1` auf `h3`; `h3` bleibt für einen **Unterabschnitt unter einer Überschrift derselben Einheit**
 * und für **gleichförmige Listeneinträge**, und jeder dieser Fälle steht unten mit seinem Grund. Die Ebene ist im
 * Kit eine Pflichtangabe (der Compiler verlangt sie) und steht als **erste Eigenschaft** — so zählt dieser Test.
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");

function quellen(ordner: string, treffer: string[] = []): string[] {
  for (const e of readdirSync(ordner, { withFileTypes: true })) {
    const pfad = `${ordner}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== ".next" && !e.name.startsWith("vorschau-")) quellen(pfad, treffer);
    } else if (/\.tsx$/.test(e.name)) treffer.push(pfad);
  }
  return treffer;
}
const ALLE = quellen("app").concat(quellen("components"));

/** Alle Aufrufe und die mit ausdrücklicher Ebene als erster Eigenschaft. */
const zaehle = (pfad: string) => {
  const t = lies(pfad);
  return {
    alle: (t.match(/<CardHeader\b/g) ?? []).length,
    h2: (t.match(/<CardHeader\s+ebene="h2"/g) ?? []).length,
    h3: (t.match(/<CardHeader\s+ebene="h3"/g) ?? []).length,
  };
};

/** Die Fälle, die bei `h3` bleiben: Datei → Anzahl und Grund. Alles andere ist `h2`. */
const H3: Record<string, { anzahl: number; grund: string }> = {
  "app/(admin)/admin/partner/[org]/OrgDetail.tsx": {
    anzahl: 1,
    grund: "Stopp einer Tour: Unterabschnitt im Abschnitt „Touren“ der Organisation, eine Karte je Stopp",
  },
  "app/(hackathon)/hackathon/challenges/page.tsx": {
    anzahl: 1,
    grund: "Challenge-Katalog: gleichförmige Karten, eine je Challenge — Listeneinträge unter der Seitenüberschrift",
  },
  "app/(hackathon)/hackathon/judging/JudgingView.tsx": {
    anzahl: 1,
    grund: "Bewertungsliste: eine gleichförmige Karte je Team",
  },
  "app/(partner)/partner/company-tour/page.tsx": {
    anzahl: 1,
    grund: "Formular unter der Karte der Tour: Unterabschnitt, die Tour-Karte darüber trägt die h2",
  },
  "app/(partner)/partner/masterclass/page.tsx": {
    anzahl: 3,
    grund: "Inhalt, Goodies und Sprecher sind Unterabschnitte unter dem Titel der Masterclass (der ist die h2 der Einheit)",
  },
};
const H3_GESAMT = Object.values(H3).reduce((s, v) => s + v.anzahl, 0);

describe("CardHeader als Abschnittskopf (QS-054)", () => {
  const dateien = ALLE.filter((f) => f !== "components/ui/Card.tsx" && lies(f).includes("<CardHeader"));

  it("jeder Kopf im ganzen Repo trägt seine Ebene als erste Eigenschaft", () => {
    assert.ok(dateien.length >= 50, "Dateien gefunden");
    const verstoesse = dateien.filter((f) => {
      const z = zaehle(f);
      return z.alle !== z.h2 + z.h3;
    });
    assert.deepEqual(verstoesse, []);
  });

  it("es gibt weit mehr Abschnittsköpfe als Ausnahmen", () => {
    const summe = dateien.reduce((s, f) => ({ h2: s.h2 + zaehle(f).h2, h3: s.h3 + zaehle(f).h3 }), { h2: 0, h3: 0 });
    // 100 bis LEAD-055 Teil 2: das Admin-Detail der Speaker ist auf `Block` umgezogen (Überschrift im Block, nicht im CardHeader).
    assert.ok(summe.h2 >= 90, `h2: ${summe.h2}`);
    assert.equal(summe.h3, H3_GESAMT);
  });

  it("jeder `h3` steht mit Grund in der Liste, und die Liste kennt keinen überzähligen", () => {
    const funde: Record<string, number> = {};
    for (const f of ALLE) {
      const n = zaehle(f).h3;
      if (n > 0) funde[f] = n;
    }
    assert.deepEqual(
      funde,
      Object.fromEntries(Object.entries(H3).map(([f, v]) => [f, v.anzahl])),
    );
    for (const [f, v] of Object.entries(H3)) assert.ok(v.grund.length > 20, `${f}: Grund fehlt`);
  });

  it("das Kit verlangt die Ebene (Pflichtangabe, kein Standardwert) und setzt die Rolle danach", () => {
    const card = lies("components/ui/Card.tsx");
    const kopf = card.slice(card.indexOf("export function CardHeader"));
    assert.match(kopf, /ebene: "h2" \| "h3";/);
    assert.doesNotMatch(kopf, /ebene\?:/);
    assert.doesNotMatch(kopf, /ebene = "h[23]"/);
    assert.match(kopf, /ebene === "h2" \? "ct-h2 text-ink" : "ct-h3 text-ink"/);
  });
});
