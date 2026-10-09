import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ADMIN_SECTIONS } from "@/lib/admin-sections";
import { ADMIN_NAVIGATION } from "@/lib/admin-navigation";

const lies = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const A = "app/(admin)/admin";

describe("Dubletten als Unterseite der Personen (ADM-098)", () => {
  it("Liste, Vorschau und Aktionen liegen unter /admin/personen/dubletten und nennen nur noch diesen Pfad", () => {
    for (const f of ["page.tsx", "zusammenfuehren/page.tsx", "actions.ts", "DublettenFormulare.tsx", "DuplicateActions.tsx"]) {
      assert.ok(existsSync(new URL(`../${A}/personen/dubletten/${f}`, import.meta.url)), f);
      const text = lies(`${A}/personen/dubletten/${f}`);
      assert.doesNotMatch(text.replace(/\/admin\/personen\/dubletten/g, ""), /\/admin\/dubletten/, `${f} nennt noch den alten Pfad`);
    }
    assert.match(lies(`${A}/personen/dubletten/actions.ts`), /const PFAD = "\/admin\/personen\/dubletten";/);
  });

  it("die alten Adressen prüfen den Abschnitt, leiten erst danach um und nehmen Status und Paar mit", () => {
    const liste = lies(`${A}/dubletten/page.tsx`);
    assert.match(liste, /requireAdminSection\("duplicates"/);
    assert.ok(liste.indexOf("requireAdminSection") < liste.indexOf("redirect("));
    assert.match(liste, /\/admin\/personen\/dubletten\?status=\$\{encodeURIComponent\(status\)\}/);
    const vorschau = lies(`${A}/dubletten/zusammenfuehren/page.tsx`);
    assert.match(vorschau, /requireAdminSection\("duplicates"/);
    assert.match(vorschau, /q\.set\("bleibt", bleibt\)/);
    assert.match(vorschau, /q\.set\("geht", geht\)/);
    assert.ok(vorschau.indexOf("requireAdminSection") < vorschau.indexOf("redirect("));
  });

  it("Abschnittspfad und Menüpunkt bleiben, die Menü-Adresse führt über die Umleitung", () => {
    assert.equal(ADMIN_SECTIONS.find((s) => s.key === "duplicates")?.path, "/admin/dubletten");
    const punkt = ADMIN_NAVIGATION.flatMap((g) => g.punkte).find((p) => p.section === "duplicates");
    assert.equal(punkt?.href, "/admin/dubletten");
  });

  it("die Übersicht verlinkt gleich auf die neue Adresse", () => {
    const text = lies(`${A}/page.tsx`);
    assert.doesNotMatch(text, /["'`]\/admin\/dubletten/);
    assert.match(text, /\/admin\/personen\/dubletten/);
  });
});
