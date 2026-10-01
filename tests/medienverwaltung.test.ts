import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { adminSection } from "@/lib/admin-sections";
import { ADMIN_NAVIGATION } from "@/lib/admin-navigation";
import { migrationText } from "@/tests/migration-datei";

const seite = readFileSync(new URL("../app/(admin)/admin/medien/page.tsx", import.meta.url), "utf8");

describe("Medienverwaltung (ADM-063)", () => {
  it("ein Ort, aber je Bereich die Rechte des vorhandenen Abschnitts", () => {
    assert.match(seite, /requireAnyAdminSection\(\["videos", "productionFiles", "contacts", "graphics"\]/);
    assert.match(seite, /videos: darfVideos, links: darfVideos, dateien: darfDateien, bilder: darfKontakte \|\| darfGrafiken/);
    // Ein Bereich ohne Recht wird auch über ?bereich= nicht geöffnet.
    assert.match(seite, /&& sichtbar\[roh as Bereich\]/);
  });

  it("zusammengeführt, nicht neu gebaut: die vorhandenen Editoren", () => {
    assert.match(seite, /from "\.\.\/videos\/VideoAdmin"/);
    assert.match(seite, /from "\.\.\/produktion\/dateien\/DateienView"/);
    assert.match(seite, /rpc\("edition_files_admin"/);
    // PROD-009: dieselbe Zielgruppen-Auswahl wie unter Produktion → Dateien.
    assert.match(seite, /audiences=\{vgroup\(vocab, "kb_audience"\)\}/);
    assert.match(seite, /rpc\("edition_contacts_admin"\)/);
  });

  it("Leiste und Abschnitt zeigen auf /admin/medien, die alte Adresse leitet weiter", () => {
    assert.equal(adminSection("videos").path, "/admin/medien");
    const punkte = ADMIN_NAVIGATION.flatMap((g) => g.punkte);
    assert.ok(punkte.some((p) => p.href === "/admin/medien" && p.label === "media"));
    const alt = readFileSync(new URL("../app/(admin)/admin/videos/page.tsx", import.meta.url), "utf8");
    assert.match(alt, /redirect\("\/admin\/medien\?bereich=videos"\)/);
  });

  it("ADM-009: das Event-App-Loom am Schlüssel partner_event_app, idempotent", () => {
    const sql = migrationText("v6_medien_event_app_loom");
    assert.match(sql, /'partner_event_app'.*\n.*67013b2c5a1a42cfbd2ee1a045a9bc5c/);
    assert.match(sql, /where not exists/);
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });
});
