import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * QS-054 (Konrad 04.10.2026, K-60: „Versalien passen, bitte alle umstellen“): Wo Karten die Abschnitte einer Seite
 * sind, trägt `CardHeader` die Ebene `h2` (`.ct-h2`) — sonst springt die Gliederung von `h1` auf `h3`. Ein
 * Unterabschnitt unter einer Überschrift der Einheit oder ein gleichförmiger Listeneintrag bleibt ausdrücklich bei
 * `h3`; jeder dieser Fälle steht unten mit seinem Grund. Der Kopf trägt seine Ebene immer als **erste Eigenschaft**.
 *
 * Die Umstellung läuft je Bereich; hier stehen die Bereiche, die schon umgestellt sind. Ein neuer `CardHeader` ohne
 * Ebene in einem dieser Bereiche fällt durch, ebenso ein `h3` ohne Eintrag und Grund.
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

/** Bereiche, in denen jeder `CardHeader` seine Ebene ausdrücklich trägt. */
const UMGESTELLT = [
  "app/(admin)/admin/benachrichtigungen/",
  "app/(admin)/admin/edition/",
  "app/(admin)/admin/feedback/",
  "app/(admin)/admin/fotos/",
  "app/(admin)/admin/grafiken/",
  "app/(admin)/admin/hackathon/",
  "app/(admin)/admin/mail/",
  "app/(admin)/admin/partner/",
  "app/(admin)/admin/speaker/",
  "app/(admin)/admin/speaker-leads/",
  "app/(admin)/admin/team/",
  "app/(admin)/admin/technik/",
  "app/(admin)/admin/volunteers/",
];

/** Die Fälle, die bei `h3` bleiben: Datei → Anzahl und Grund. Alles andere in den umgestellten Bereichen ist `h2`. */
const H3: Record<string, { anzahl: number; grund: string }> = {
  "app/(admin)/admin/partner/[org]/OrgDetail.tsx": {
    anzahl: 1,
    grund: "Stopp einer Tour: Unterabschnitt im Abschnitt „Touren“ der Organisation, eine Karte je Stopp",
  },
};

describe("CardHeader als Abschnittskopf (QS-054)", () => {
  const dateien = ALLE.filter((f) => UMGESTELLT.some((p) => f.startsWith(p)) && lies(f).includes("<CardHeader"));

  it("in den umgestellten Bereichen trägt jeder Kopf seine Ebene als erste Eigenschaft", () => {
    assert.ok(dateien.length >= 12, "Dateien gefunden");
    const verstoesse = dateien.filter((f) => {
      const z = zaehle(f);
      return z.alle !== z.h2 + z.h3;
    });
    assert.deepEqual(verstoesse, []);
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

  it("das Kit kennt den Schalter und hält h3 als Vorgabe", () => {
    const card = lies("components/ui/Card.tsx");
    assert.match(card, /ebene = "h3"/);
    assert.match(card, /ebene === "h2" \? "ct-h2 text-ink" : "ct-h3 text-ink"/);
  });
});
