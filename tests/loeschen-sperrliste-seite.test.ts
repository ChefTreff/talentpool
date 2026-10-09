import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ADMIN_SECTIONS } from "@/lib/admin-sections";
import { ADMIN_NAVIGATION } from "@/lib/admin-navigation";

const lies = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const SEITE = "app/(admin)/admin/loeschantraege/page.tsx";
const ALT = "app/(admin)/admin/verwaltung/sperrliste/page.tsx";
const AKTIONEN = "app/(admin)/admin/loeschantraege/sperrliste/actions.ts";

describe("Löschanträge und Sperrliste auf einer Seite (ADM-097)", () => {
  it("die Seite verlangt einen der beiden Abschnitte und prüft jeden einzeln", () => {
    const text = lies(SEITE);
    assert.match(text, /requireAnyAdminSection\(\["deletions", "suppression"\]/);
    assert.match(text, /mayEnterAdminSection\("deletions"/);
    assert.match(text, /mayEnterAdminSection\("suppression"/);
  });

  it("die alte Adresse prüft den Abschnitt und leitet auf die Seite um", () => {
    const text = lies(ALT);
    assert.match(text, /requireAdminSection\("suppression"/);
    assert.match(text, /redirect\("\/admin\/loeschantraege\?ansicht=sperrliste"\)/);
    assert.ok(text.indexOf("requireAdminSection") < text.indexOf("redirect("), "erst prüfen, dann umleiten");
  });

  it("die Sperrlisten-Aktionen prüfen weiter ihren Abschnitt und laden die neue Seite neu", () => {
    const text = lies(AKTIONEN);
    assert.equal((text.match(/requireAdminSection\("suppression"/g) ?? []).length, 2);
    assert.match(text, /const PFAD = "\/admin\/loeschantraege";/);
    assert.equal(existsSync(new URL("../app/(admin)/admin/verwaltung/sperrliste/actions.ts", import.meta.url)), false);
  });

  it("Abschnitte und Menüpunkte bleiben unverändert (die Leiste ändert Design nach Konrads Go)", () => {
    const sperr = ADMIN_SECTIONS.find((s) => s.key === "suppression");
    const loesch = ADMIN_SECTIONS.find((s) => s.key === "deletions");
    assert.equal(sperr?.path, "/admin/verwaltung/sperrliste");
    assert.equal(loesch?.path, "/admin/loeschantraege");
    const hrefs = ADMIN_NAVIGATION.flatMap((g) => g.punkte.map((p) => p.href));
    assert.ok(hrefs.includes("/admin/verwaltung/sperrliste"));
    assert.ok(hrefs.includes("/admin/loeschantraege"));
  });

  it("die neuen Beschriftungen gibt es auf Deutsch und Englisch", () => {
    for (const sprache of ["de", "en"]) {
      const d = (JSON.parse(lies(`lib/i18n/${sprache}.json`)) as { adminDeletions: Record<string, string> }).adminDeletions;
      for (const k of ["pageTitle", "pageLead", "areasLabel", "tabRequests", "tabSuppression"]) {
        assert.ok(d[k] && d[k].length > 2, `${sprache}: adminDeletions.${k}`);
      }
    }
  });
});
