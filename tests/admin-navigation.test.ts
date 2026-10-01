import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ADMIN_NAVIGATION, sichtbareNavigation } from "@/lib/admin-navigation";
import { ADMIN_SECTIONS, TEAM_ROLES, canEnterAdminSection, type AdminSectionKey } from "@/lib/admin-sections";

/**
 * Die Admin-Seitenleiste (QS-032) gegen die Abschnittsliste. Beide müssen
 * dasselbe sagen: ein Abschnitt ohne Punkt ist nur über die Adresszeile
 * erreichbar, ein Punkt ohne passenden Abschnitt führt ins 404.
 */

const ABSCHNITTE = new Map(ADMIN_SECTIONS.map((s) => [s.key, s]));
const PUNKTE = ADMIN_NAVIGATION.flatMap((g) => g.punkte.map((p) => ({ ...p, gruppe: g.gruppe })));
const de = JSON.parse(readFileSync("lib/i18n/de.json", "utf8"));
const en = JSON.parse(readFileSync("lib/i18n/en.json", "utf8"));

test("jeder Abschnitt hat einen Punkt in der Leiste", () => {
  const inLeiste = new Set(PUNKTE.map((p) => p.section));
  const fehlt = ADMIN_SECTIONS.filter((s) => !inLeiste.has(s.key)).map((s) => s.key);
  assert.deepEqual(fehlt, []);
});

test("jeder Punkt öffnet einen bekannten Abschnitt und liegt unter dessen Pfad", () => {
  for (const p of PUNKTE) {
    const s = ABSCHNITTE.get(p.section);
    assert.ok(s, `${p.href}: Abschnitt ${p.section} unbekannt`);
    // Die Startseite `/admin` ist Präfix von allem — für sie zählt Gleichheit.
    const passt = s.path === "/admin" ? p.href === "/admin" : p.href === s.path || p.href.startsWith(`${s.path}/`);
    assert.ok(passt, `${p.href} liegt nicht unter ${s.path} (${p.section})`);
  }
  const hrefs = PUNKTE.map((p) => p.href);
  assert.equal(new Set(hrefs).size, hrefs.length, "doppelte Adresse in der Leiste");
});

test("jede Beschriftung und jeder Gruppenkopf steht in beiden Sprachen", () => {
  for (const [sprache, d] of [["de", de], ["en", en]] as const) {
    for (const p of PUNKTE) {
      assert.equal(typeof d.admin.nav[p.label], "string", `${sprache}: admin.nav.${p.label} fehlt`);
    }
    for (const g of ADMIN_NAVIGATION) {
      if (!g.gruppe) continue;
      assert.equal(typeof d.admin.nav.sections[g.gruppe], "string", `${sprache}: admin.nav.sections.${g.gruppe} fehlt`);
    }
  }
});

test("Speaker und Programm stehen in einer Gruppe (QS-032)", () => {
  const gruppeVon = (s: AdminSectionKey) => PUNKTE.find((p) => p.section === s)?.gruppe;
  assert.equal(gruppeVon("programme"), "speakerProgramme");
  assert.equal(gruppeVon("edition"), "speakerProgramme");
  assert.equal(gruppeVon("speakers"), "speakerProgramme");
  for (const g of ["production", "partner", "administration"]) {
    assert.ok(ADMIN_NAVIGATION.some((x) => x.gruppe === g), `Gruppe ${g} fehlt`);
  }
});

test("die Leiste je Rolle zeigt nur offene Abschnitte und keine leeren Köpfe", () => {
  const nav = de.admin.nav as Record<string, unknown>;
  const alle = sichtbareNavigation(() => true, nav);
  assert.equal(alle.reduce((n, g) => n + g.items.length, 0), PUNKTE.length, "admin sieht jeden Punkt");

  for (const rolle of TEAM_ROLES) {
    const offen = (s: AdminSectionKey) => canEnterAdminSection(s, [rolle]);
    const leiste = sichtbareNavigation(offen, nav);
    for (const g of leiste) assert.ok(g.items.length > 0, `${rolle}: leere Gruppe ${g.label}`);
    const sichtbar = new Set(leiste.flatMap((g) => g.items.map((i) => i.href)));
    for (const p of PUNKTE) {
      assert.equal(sichtbar.has(p.href), offen(p.section), `${rolle}: ${p.href} ${offen(p.section) ? "fehlt" : "sichtbar, obwohl zu"}`);
    }
  }

  // Gegenprobe: das Partner-Team sieht weder Speaker & Programm noch die
  // Verwaltung, wohl aber seine eigene Gruppe. (Die Produktion taugt dafür
  // nicht: Regie, Technik und Anreise öffnen auch ihre Rolle.)
  const partner = sichtbareNavigation((s) => canEnterAdminSection(s, ["partner_team"]), nav).map((g) => g.label);
  assert.ok(!partner.includes(de.admin.nav.sections.speakerProgramme), "Partner-Team sieht Speaker & Programm");
  assert.ok(!partner.includes(de.admin.nav.sections.administration), "Partner-Team sieht Verwaltung");
  assert.ok(partner.includes(de.admin.nav.sections.partner));
});
