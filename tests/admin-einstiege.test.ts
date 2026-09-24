import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { EINSTIEGE, einstiegeFuer } from "@/app/(admin)/admin/einstiege";
import { ADMIN_SECTIONS, TEAM_ROLES, adminSection, canEnterAdminSection } from "@/lib/admin-sections";

const de = JSON.parse(readFileSync("lib/i18n/de.json", "utf8"));
const en = JSON.parse(readFileSync("lib/i18n/en.json", "utf8"));

const schluessel = (roles: string[]) => einstiegeFuer(roles).map((e) => e.key);

describe("Admin-Startseite: Einstiege nach Rolle (QS-037)", () => {
  it("zeigt Konrad Programm, Speaker und Partner", () => {
    assert.deepEqual(schluessel(["admin"]), ["programme", "speakers", "partner"]);
  });

  it("zeigt der Produktion Produktion, Regie und Technik", () => {
    assert.deepEqual(schluessel(["production_team"]), ["production", "regie", "tech"]);
  });

  it("gibt jeder Teamrolle drei Karten, und jede davon öffnet die Rolle", () => {
    for (const rolle of TEAM_ROLES) {
      const karten = einstiegeFuer([rolle]);
      assert.equal(karten.length, 3, `${rolle}: ${karten.map((k) => k.key).join(", ")}`);
      for (const k of karten) assert.ok(canEnterAdminSection(k.key, [rolle]), `${rolle} → ${k.key}`);
    }
  });

  it("führt jede Karte auf den Pfad ihres Abschnitts", () => {
    for (const e of EINSTIEGE) assert.equal(e.href, adminSection(e.key).path, e.key);
  });

  it("hat für jede Karte Wort, Satz und Menütitel in DE und EN", () => {
    for (const e of EINSTIEGE) {
      for (const [sprache, d] of [["de", de], ["en", en]] as const) {
        assert.ok(d.admin.words[e.key], `${sprache}: admin.words.${e.key}`);
        assert.ok(d.admin.entries[e.key], `${sprache}: admin.entries.${e.key}`);
        assert.ok(typeof d.admin.nav[e.nav] === "string", `${sprache}: admin.nav.${e.nav}`);
      }
    }
  });

  it("hat ein Seitenkopf-Wort für jeden Admin-Abschnitt ausser der Übersicht", () => {
    for (const s of ADMIN_SECTIONS) {
      if (s.key === "overview") continue;
      assert.ok(de.admin.words[s.key], `de: admin.words.${s.key}`);
      assert.ok(en.admin.words[s.key], `en: admin.words.${s.key}`);
    }
  });
});
